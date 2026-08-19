import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { env } from '../config/env.js';
import { createCancellationToken, enviarCorreoReserva, verifyCancellationToken } from '../services/email.service.js';

const router = Router();

function supabaseHeaders(preferRepresentation = false) {
  const headers = {
    apikey: env.supabaseServiceKey,
    Authorization: 'Bearer ' + env.supabaseServiceKey,
    'Content-Type': 'application/json'
  };
  if (preferRepresentation) headers.Prefer = 'return=representation';
  return headers;
}

async function supabaseRequest(path, options = {}) {
  const res = await fetch(env.supabaseUrl + '/rest/v1/' + path, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.message || data?.error_description || data?.error || 'Error de Supabase';
    const err = new Error(reason);
    err.status = res.status;
    throw err;
  }
  return data;
}

function clean(value) {
  return String(value || '').trim();
}

function inferPassengerName(body) {
  return clean(body.passenger_name || body.nombre_pasajero || body.cliente || body.nombre || body.customer);
}

function inferConfirmationCode(body) {
  return clean(body.confirmation_code || body.codigo_confirmacion || body.confirmationCode || body.confirmation_code_value);
}

function inferEmail(body) {
  return clean(body.email_cliente || body.email || body.email_cliente_reserva || body.email_user || body.emailUsuario);
}

function normalizePaymentMethod(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return 'tarjeta';
  if (raw === 'efectivo' || raw === 'cash') return 'efectivo';
  if (raw === 'tarjeta' || raw === 'card') return 'tarjeta';
  return 'tarjeta';
}

function cancellationUrl(reservaId) {
  const token = createCancellationToken(reservaId);
  const query = new URLSearchParams({ reservaId, token });
  return `${env.frontendOrigin}/api/reservas/cancelar?${query.toString()}`;
}

async function deleteReservation(reservaId) {
  await supabaseRequest('viajes?reserva_id=eq.' + encodeURIComponent(reservaId), {
    method: 'DELETE',
    headers: supabaseHeaders()
  });

  await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(reservaId), {
    method: 'DELETE',
    headers: supabaseHeaders()
  });
}

function cancellationPage(reservaId, token) {
  const escapedReservaId = reservaId.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const escapedToken = token.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cancelar reserva | LuxRides</title></head><body style="font-family:Arial,sans-serif;max-width:540px;margin:48px auto;padding:0 20px;color:#1f2937;"><h1>Cancelar reserva</h1><p>Vas a cancelar la reserva <strong>${escapedReservaId}</strong>. Esta accion no se puede deshacer.</p><form method="post" action="/api/reservas/cancelar"><input type="hidden" name="reservaId" value="${escapedReservaId}"><input type="hidden" name="token" value="${escapedToken}"><button type="submit" style="background:#b91c1c;color:#fff;border:0;border-radius:4px;padding:12px 20px;font-weight:bold;cursor:pointer;">Confirmar cancelacion</button></form></body></html>`;
}

router.get('/reservas/cancelar', (req, res) => {
  const reservaId = clean(req.query.reservaId);
  const token = clean(req.query.token);
  if (!reservaId || !verifyCancellationToken(reservaId, token)) {
    return res.status(400).send('El enlace de cancelacion no es valido o ha vencido.');
  }
  res.type('html').send(cancellationPage(reservaId, token));
});

router.post('/reservas/cancelar', async (req, res, next) => {
  try {
    const reservaId = clean(req.body?.reservaId);
    const token = clean(req.body?.token);
    if (!reservaId || !verifyCancellationToken(reservaId, token)) {
      return res.status(400).send('El enlace de cancelacion no es valido o ha vencido.');
    }
    await deleteReservation(reservaId);
    res.type('html').send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reserva cancelada | LuxRides</title></head><body style="font-family:Arial,sans-serif;max-width:540px;margin:48px auto;padding:0 20px;color:#1f2937;"><h1>Reserva cancelada</h1><p>Tu reserva fue eliminada correctamente.</p></body></html>');
  } catch (error) {
    next(error);
  }
});

router.post('/reservas',
  body('passenger_name').optional().isString().isLength({ max: 120 }),
  body('cliente').optional().isString().isLength({ max: 120 }),
  body('nombre').optional().isString().isLength({ max: 120 }),
  body('email_cliente').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('total').optional().isFloat({ min: 0, max: 1_000_000 }),
  body('fecha').optional().isString().isLength({ max: 30 }),
  body('metodo_pago').optional().isString().isLength({ max: 20 }),
  body('payment_method').optional().isString().isLength({ max: 20 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    try {
    const body = req.body || {};
    const passengerName = inferPassengerName(body);
    const confirmationCode = inferConfirmationCode(body) || 'LUX-' + Date.now();
    const email = inferEmail(body);
    const customerName = clean(body.customer || body.cliente || body.nombre || passengerName);
    const paymentMethod = normalizePaymentMethod(body.metodo_pago || body.payment_method);

    if (!passengerName && !customerName) {
      return res.status(400).json({ ok: false, error: 'passenger_name es obligatorio' });
    }

    const reservaId = clean(body.reserva_id || body.reservaId) || 'LUX-' + Date.now();
    // Solo columnas que existen en la tabla Supabase (sin passenger_name, confirmation_code, customer, email)
    const payload = {
      reserva_id: reservaId,
      cliente: customerName,
      origen: clean(body.origen || body.origin),
      destino: clean(body.destino || body.destination),
      origen_lat: body.origen_lat ?? body.origin_lat ?? null,
      origen_lng: body.origen_lng ?? body.origin_lng ?? null,
      destino_lat: body.destino_lat ?? body.destination_lat ?? null,
      destino_lng: body.destino_lng ?? body.destination_lng ?? null,
      fecha: clean(body.fecha || body.booking_date || body.date),
      hora_recogida: clean(body.hora_recogida || body.pickup_time || body.hora || body.time),
      total: Number(body.total || 0),
      estado: clean(body.estado || 'pendiente') || 'pendiente',
      servicio: clean(body.servicio || body.service_kind || body.serviceKind),
      vehiculo: clean(body.vehiculo || body.vehicle),
      timestamp: body.timestamp || new Date().toISOString(),
      email_cliente: email,
      pasajeros: body.pasajeros ?? null,
      metodo_pago: paymentMethod,
      payment_method: paymentMethod,
      traslado: clean(body.traslado || body.trip_kind || body.tripKind),
      numero_vuelo: clean(body.numero_vuelo || body.flight_number),
      distancia_km: body.distancia_km ?? body.distance_km ?? null,
      duracion_min: body.duracion_min ?? body.duration_min ?? null
    };

    let persisted = null;
    let persistenceStatus = 'skipped';
    if (env.supabaseUrl) {
      try {
        const rows = await supabaseRequest('reservas', {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(payload)
        });
        persisted = rows?.[0] || payload;
        persistenceStatus = 'saved';
      } catch (supabaseErr) {
        console.warn('[reservas] no se pudo guardar en Supabase:', supabaseErr.message || supabaseErr);
        persisted = payload;
        persistenceStatus = 'failed';
      }
    } else {
      persisted = payload;
    }

    const created = {
      ...(persisted || payload),
      passenger_name: passengerName || customerName,
      confirmation_code: confirmationCode,
      email_cliente: email,
      email
    };

    let emailStatus = 'skipped';
    if (clean(created.email_cliente)) {
      try {
        const emailResult = await enviarCorreoReserva({
          ...created,
          cliente: created.cliente || created.passenger_name,
          passenger_name: created.passenger_name,
          confirmation_code: created.confirmation_code,
          cancel_url: cancellationUrl(created.reserva_id)
        });
        emailStatus = emailResult?.skipped ? 'skipped' : 'sent';
      } catch (emailErr) {
        console.warn('[reservas] no se pudo enviar correo:', emailErr.message || emailErr);
        emailStatus = 'failed';
      }
    }

    res.status(201).json({ ok: true, data: created, email_status: emailStatus, persistence_status: persistenceStatus });
  } catch (error) {
    next(error);
  }
});

// Reservas por concierge slug — usa service key para bypassear RLS
router.get('/reservas/by-concierge/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!slug) return res.status(400).json({ ok: false, error: 'slug requerido' });
    if (!env.supabaseUrl) return res.json({ ok: true, data: [] });

    const pattern = '%-CG-' + slug;
    const rows = await supabaseRequest(
      'reservas?reserva_id=ilike.' + encodeURIComponent(pattern) + '&order=timestamp.desc&limit=100',
      { method: 'GET', headers: supabaseHeaders() }
    );
    res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    next(error);
  }
});

export default router;

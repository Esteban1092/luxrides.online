import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { env } from '../config/env.js';
import { enviarCorreoReserva } from '../services/email.service.js';

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

router.post('/reservas',
  body('passenger_name').optional().isString().isLength({ max: 120 }),
  body('cliente').optional().isString().isLength({ max: 120 }),
  body('nombre').optional().isString().isLength({ max: 120 }),
  body('email_cliente').optional().isEmail().normalizeEmail(),
  body('email').optional().isEmail().normalizeEmail(),
  body('total').optional().isFloat({ min: 0, max: 1_000_000 }),
  body('fecha').optional().isString().isLength({ max: 30 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    try {
    const body = req.body || {};
    const passengerName = inferPassengerName(body);
    const confirmationCode = inferConfirmationCode(body) || 'LUX-' + Date.now();
    const email = inferEmail(body);
    const customerName = clean(body.customer || body.cliente || body.nombre || passengerName);

    if (!passengerName && !customerName) {
      return res.status(400).json({ ok: false, error: 'passenger_name es obligatorio' });
    }

    const reservaId = clean(body.reserva_id || body.reservaId) || 'LUX-' + Date.now();
    const payload = {
      reserva_id: reservaId,
      cliente: customerName,
      customer: customerName,
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
      email: email,
      pasajeros: body.pasajeros ?? null,
      traslado: clean(body.traslado || body.trip_kind || body.tripKind),
      numero_vuelo: clean(body.numero_vuelo || body.flight_number),
      distancia_km: body.distancia_km ?? body.distance_km ?? null,
      duracion_min: body.duracion_min ?? body.duration_min ?? null,
      passenger_name: passengerName || customerName,
      confirmation_code: confirmationCode
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
          confirmation_code: created.confirmation_code
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

export default router;
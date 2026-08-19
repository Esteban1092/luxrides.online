import { Router } from 'express';
import { env } from '../config/env.js';
import { clearDriverSessionCookie, createDriverSessionCookieValue, requireDriverSession, setDriverSessionCookie } from '../middleware/driver-auth.js';
import { isSchemaMissingError } from '../lib/supabase-compat.js';

const router = Router();

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const PLATFORM_COMMISSION_RATE = 0.20;
const DRIVER_SHARE_CARD_RATE = 1 - PLATFORM_COMMISSION_RATE;
const CASH_DEBT_LIMIT_DEFAULT = -300;

function calcularPagoChofer(totalViaje) {
  return roundMoney(Number(totalViaje || 0) * DRIVER_SHARE_CARD_RATE);
}

function calcularComisionPlataforma(totalViaje) {
  return roundMoney(Number(totalViaje || 0) * PLATFORM_COMMISSION_RATE);
}

function parsePaymentMethod(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'efectivo' || raw === 'cash') return 'efectivo';
  if (raw === 'tarjeta' || raw === 'card') return 'tarjeta';
  return '';
}

function getTripTotal(trip) {
  return Number(trip?.total ?? trip?.precio ?? 0) || 0;
}

function getCashDebtLimit(chofer) {
  const configured = Number(chofer?.cash_debt_limit);
  return Number.isFinite(configured) ? configured : CASH_DEBT_LIMIT_DEFAULT;
}

function getWalletBalance(chofer) {
  const wallet = Number(chofer?.wallet_balance);
  if (Number.isFinite(wallet)) return wallet;
  return Number(chofer?.saldo_disponible || 0);
}

function mustBlockForDebt(walletBalance, debtLimit) {
  return Number(walletBalance) <= Number(debtLimit);
}

const CHOFER_UPDATE_FIELDS = new Set([
  'nombre',
  'hotel',
  'estado',
  'vehiculo',
  'vehiculo_tipo',
  'vehiculo_marca',
  'vehiculo_modelo',
  'vehiculo_color',
  'placa',
  'foto_url',
  'ubicacion',
  'ultima_conexion',
  'viaje_actual',
  'saldo_disponible',
  'saldo_en_proceso'
]);

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

function cleanString(value) {
  return String(value || '').trim();
}

function decodeBase64Safe(value) {
  const raw = cleanString(value);
  if (!raw) return '';
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return raw;
  }
}

function normalizeChoferPatch(body) {
  const patch = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!CHOFER_UPDATE_FIELDS.has(key)) continue;
    patch[key] = value;
  }
  return patch;
}

async function getChoferById(id) {
  const rows = await supabaseRequest('choferes?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1', {
    method: 'GET',
    headers: supabaseHeaders()
  });
  return rows?.[0] || null;
}

async function updateChofer(id, patch) {
  const rows = await supabaseRequest('choferes?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: supabaseHeaders(true),
    body: JSON.stringify(patch)
  });
  return rows?.[0] || null;
}

async function insertRow(table, payload) {
  const rows = await supabaseRequest(table, {
    method: 'POST',
    headers: supabaseHeaders(true),
    body: JSON.stringify(payload)
  });
  return rows?.[0] || null;
}

async function resolveTripPaymentMethod(trip) {
  const direct = parsePaymentMethod(trip?.metodo_pago || trip?.payment_method);
  if (direct) return direct;

  const reservaId = cleanString(trip?.reserva_id);
  if (!reservaId) return 'tarjeta';

  try {
    const rows = await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(reservaId) + '&select=metodo_pago,payment_method&limit=1', {
      method: 'GET',
      headers: supabaseHeaders()
    });
    const reserva = rows?.[0] || null;
    return parsePaymentMethod(reserva?.metodo_pago || reserva?.payment_method || 'tarjeta') || 'tarjeta';
  } catch (error) {
    console.warn('[driver-payment-method] no se pudo leer metodo en reserva', error.message);
    return 'tarjeta';
  }
}

async function insertWalletMovementSafe(payload) {
  try {
    await insertRow('wallet_movements', payload);
  } catch (error) {
    console.warn('[wallet-movement] no se pudo guardar movimiento', error.message);
  }
}

async function updateChoferWithWalletFallback(id, patch) {
  try {
    return await updateChofer(id, patch);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    const touchesWalletColumns = msg.includes('wallet_balance') || msg.includes('cash_debt_limit') || msg.includes('cash_blocked');
    if (!touchesWalletColumns) throw error;

    const fallbackPatch = { ...patch };
    delete fallbackPatch.wallet_balance;
    delete fallbackPatch.cash_debt_limit;
    delete fallbackPatch.cash_blocked;
    return await updateChofer(id, fallbackPatch);
  }
}

router.post('/driver/login', async (req, res, next) => {
  try {
    const id = cleanString(req.body?.id);
    const nombre = cleanString(req.body?.nombre);
    const pass = cleanString(req.body?.pass);
    if (!id || (!nombre && !pass)) {
      return res.status(400).json({ ok: false, error: 'Faltan credenciales' });
    }

    const chofer = await getChoferById(id);
    if (!chofer) {
      return res.status(404).json({ ok: false, error: 'Chofer no encontrado' });
    }

    // Compatibilidad:
    // - Login legacy: id + nombre (chofer app)
    // - Login nuevo: id + contraseña (guias/admin style)
    let authOk = false;
    if (pass) {
      const storedDecoded = decodeBase64Safe(chofer.password_hash);
      if (!storedDecoded) {
        return res.status(401).json({ ok: false, error: 'Este usuario no tiene contraseña configurada.' });
      }
      authOk = storedDecoded === pass;
      if (!authOk) {
        return res.status(401).json({ ok: false, error: 'Contraseña incorrecta.' });
      }
    } else {
      authOk = Boolean(nombre) && Boolean(chofer.nombre) && chofer.nombre.toLowerCase() === nombre.toLowerCase();
      if (!authOk) {
        return res.status(401).json({ ok: false, error: 'El nombre no coincide con el ID proporcionado.' });
      }
    }

    const sessionToken = createDriverSessionCookieValue(chofer);
    setDriverSessionCookie(res, chofer);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, sessionToken, data: chofer });
  } catch (error) {
    next(error);
  }
});

router.get('/driver/session', requireDriverSession, async (req, res) => {
  res.json({ ok: true, role: 'driver', choferId: req.driverSession.choferId, exp: req.driverSession.exp });
});

router.get('/driver/me', requireDriverSession, async (req, res, next) => {
  try {
    const chofer = await getChoferById(req.driverSession.choferId);
    if (!chofer) return res.status(404).json({ ok: false, error: 'Chofer no encontrado' });
    return res.json({ ok: true, data: chofer });
  } catch (error) {
    next(error);
  }
});

router.patch('/driver/profile', requireDriverSession, async (req, res, next) => {
  try {
    const patch = normalizeChoferPatch(req.body || {});
    delete patch.saldo_disponible;
    delete patch.saldo_en_proceso;
    delete patch.ubicacion;
    delete patch.ultima_conexion;
    delete patch.viaje_actual;
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: 'No hay campos validos para actualizar.' });
    }

    const chofer = await updateChofer(req.driverSession.choferId, patch);
    return res.json({ ok: true, data: chofer });
  } catch (error) {
    next(error);
  }
});

router.patch('/driver/chofer', requireDriverSession, async (req, res, next) => {
  try {
    const patch = normalizeChoferPatch(req.body || {});
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: 'No hay campos validos para actualizar.' });
    }

    const chofer = await updateChofer(req.driverSession.choferId, patch);
    return res.json({ ok: true, data: chofer });
  } catch (error) {
    next(error);
  }
});

router.patch('/driver/location', requireDriverSession, async (req, res, next) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const patch = {
      ubicacion: { lat, lng },
      ultima_conexion: new Date().toISOString(),
      estado: cleanString(req.body?.estado || 'en linea') || 'en linea'
    };
    const chofer = await updateChofer(req.driverSession.choferId, patch);
    return res.json({ ok: true, data: chofer });
  } catch (error) {
    next(error);
  }
});

router.patch('/driver/status', requireDriverSession, async (req, res, next) => {
  try {
    const patch = {
      estado: cleanString(req.body?.estado || 'offline') || 'offline',
      ultima_conexion: new Date().toISOString()
    };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'viaje_actual')) {
      patch.viaje_actual = req.body.viaje_actual;
    }
    const chofer = await updateChofer(req.driverSession.choferId, patch);
    return res.json({ ok: true, data: chofer });
  } catch (error) {
    next(error);
  }
});

router.patch('/driver/trips/:id/accept', requireDriverSession, async (req, res, next) => {
  try {
    const id = cleanString(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'id invalido' });

    const chofer = await getChoferById(req.driverSession.choferId);
    if (!chofer) return res.status(404).json({ ok: false, error: 'Chofer no encontrado' });

    const walletBalance = getWalletBalance(chofer);
    const debtLimit = getCashDebtLimit(chofer);
    const blockedByDebt = Boolean(chofer.cash_blocked) || mustBlockForDebt(walletBalance, debtLimit);

    if (blockedByDebt) {
      return res.status(403).json({
        ok: false,
        code: 'DEBT_LIMIT_EXCEEDED',
        error: 'Tu deuda por viajes en efectivo excede el limite permitido. Contacta a administracion para regularizar tu wallet.',
        wallet_balance: walletBalance,
        debt_limit: debtLimit
      });
    }

    const rows = await supabaseRequest('viajes?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: supabaseHeaders(true),
      body: JSON.stringify({
        estado: 'aceptado',
        chofer_id: req.driverSession.choferId,
        aceptado_en: new Date().toISOString()
      })
    });

    await updateChofer(req.driverSession.choferId, { estado: 'en_viaje', viaje_actual: id, ultima_conexion: new Date().toISOString() });
    return res.json({ ok: true, data: rows?.[0] || null });
  } catch (error) {
    next(error);
  }
});

router.patch('/driver/trips/:id/reject', requireDriverSession, async (req, res, next) => {
  try {
    const id = cleanString(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'id invalido' });

    const payload = {
      estado: 'rechazado',
      chofer_id: req.driverSession.choferId
    };

    try {
      const rows = await supabaseRequest('viajes?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: supabaseHeaders(true),
        body: JSON.stringify({
          ...payload,
          rechazado_en: new Date().toISOString()
        })
      });
      return res.json({ ok: true, data: rows?.[0] || null });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        const rows = await supabaseRequest('viajes?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: supabaseHeaders(true),
          body: JSON.stringify(payload)
        });
        return res.json({ ok: true, data: rows?.[0] || null });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.patch('/driver/trips/:id/finalize', requireDriverSession, async (req, res, next) => {
  try {
    const id = cleanString(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'id invalido' });

    const tripRows = await supabaseRequest('viajes?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1', {
      method: 'GET',
      headers: supabaseHeaders()
    });
    const trip = tripRows?.[0] || null;
    if (!trip) return res.status(404).json({ ok: false, error: 'Viaje no encontrado' });
    if (String(trip.chofer_id || '') !== req.driverSession.choferId) {
      return res.status(403).json({ ok: false, error: 'El viaje no pertenece a esta sesion.' });
    }

    const paymentMethod = await resolveTripPaymentMethod(trip);
    const totalViaje = getTripTotal(trip);
    const comisionPlataforma = calcularComisionPlataforma(totalViaje);
    const pagoChofer = paymentMethod === 'efectivo'
      ? roundMoney(totalViaje)
      : calcularPagoChofer(totalViaje);
    const walletDelta = paymentMethod === 'efectivo'
      ? roundMoney(-comisionPlataforma)
      : roundMoney(pagoChofer);

    const completedAt = new Date().toISOString();

    let viajeCerrado = null;
    try {
      viajeCerrado = await supabaseRequest('viajes?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: supabaseHeaders(true),
        body: JSON.stringify({
          estado: 'completado',
          completado_en: completedAt,
          pago_chofer: pagoChofer,
          comision_plataforma: comisionPlataforma,
          metodo_pago: paymentMethod,
          payment_method: paymentMethod,
          wallet_delta: walletDelta
        })
      });
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      const paymentColumnsMissing = msg.includes('comision_plataforma') || msg.includes('metodo_pago') || msg.includes('payment_method') || msg.includes('wallet_delta');
      if (!paymentColumnsMissing) throw error;
      viajeCerrado = await supabaseRequest('viajes?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: supabaseHeaders(true),
        body: JSON.stringify({
          estado: 'completado',
          completado_en: completedAt,
          pago_chofer: pagoChofer
        })
      });
    }

    try {
      await insertRow('historial', {
        chofer_id: req.driverSession.choferId,
        cliente: trip.cliente || '',
        origen: trip.origen || '',
        destino: trip.destino || '',
        precio: trip.total || trip.precio || 0,
        pago_chofer: pagoChofer,
        comision_plataforma: comisionPlataforma,
        metodo_pago: paymentMethod,
        payment_method: paymentMethod,
        wallet_delta: walletDelta,
        estado: 'completado',
        reserva_id: trip.reserva_id || '',
        fecha: completedAt.slice(0, 10),
        hora: completedAt.slice(11, 16),
        timestamp: Date.now()
      });
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      const paymentColumnsMissing = msg.includes('comision_plataforma') || msg.includes('metodo_pago') || msg.includes('payment_method') || msg.includes('wallet_delta');
      if (!paymentColumnsMissing) throw error;
      await insertRow('historial', {
        chofer_id: req.driverSession.choferId,
        cliente: trip.cliente || '',
        origen: trip.origen || '',
        destino: trip.destino || '',
        precio: trip.total || trip.precio || 0,
        pago_chofer: pagoChofer,
        estado: 'completado',
        reserva_id: trip.reserva_id || '',
        fecha: completedAt.slice(0, 10),
        hora: completedAt.slice(11, 16),
        timestamp: Date.now()
      });
    }

    const chofer = await getChoferById(req.driverSession.choferId);
    const saldoActual = Number(chofer?.saldo_disponible || 0);
    const saldoProcesoActual = Number(chofer?.saldo_en_proceso || 0);
    const walletBalanceActual = getWalletBalance(chofer);
    const walletBalanceNuevo = roundMoney(walletBalanceActual + walletDelta);
    const debtLimit = getCashDebtLimit(chofer);
    const blockedByDebt = mustBlockForDebt(walletBalanceNuevo, debtLimit);

    const saldoDisponible = paymentMethod === 'efectivo'
      ? roundMoney(saldoActual)
      : roundMoney(saldoActual + pagoChofer);
    const saldoProceso = paymentMethod === 'efectivo'
      ? roundMoney(saldoProcesoActual)
      : roundMoney(saldoProcesoActual + roundMoney(pagoChofer * 0.1));

    const viajeActualizado = await updateChoferWithWalletFallback(req.driverSession.choferId, {
      saldo_disponible: saldoDisponible,
      saldo_en_proceso: saldoProceso,
      wallet_balance: walletBalanceNuevo,
      cash_debt_limit: debtLimit,
      cash_blocked: blockedByDebt,
      estado: 'en linea',
      viaje_actual: null,
      ultima_conexion: completedAt
    });

    await insertWalletMovementSafe({
      chofer_id: req.driverSession.choferId,
      reserva_id: trip.reserva_id || null,
      viaje_id: trip.id || id,
      tipo: paymentMethod === 'efectivo' ? 'cash_commission' : 'card_settlement',
      metodo_pago: paymentMethod,
      amount: walletDelta,
      comision_plataforma: comisionPlataforma,
      wallet_balance_before: walletBalanceActual,
      wallet_balance_after: walletBalanceNuevo,
      metadata: {
        total_viaje: totalViaje,
        pago_chofer: pagoChofer,
        cash_blocked: blockedByDebt
      },
      created_at: completedAt
    });

    if (trip.reserva_id) {
      try {
        await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(trip.reserva_id), {
          method: 'PATCH',
          headers: supabaseHeaders(true),
          body: JSON.stringify({
            estado: 'completado',
            saldo_acreditado: true,
            metodo_pago: paymentMethod,
            payment_method: paymentMethod,
            comision_plataforma: comisionPlataforma
          })
        });
      } catch (error) {
        console.warn('[driver-finalize] no se pudo actualizar reserva', error.message);
      }
    }

    return res.json({
      ok: true,
      data: {
        viaje: viajeCerrado?.[0] || null,
        chofer: viajeActualizado,
        payment_method: paymentMethod,
        pago_chofer: pagoChofer,
        comision_plataforma: comisionPlataforma,
        wallet_balance: walletBalanceNuevo,
        cash_blocked: blockedByDebt,
        debt_limit: debtLimit
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/driver/withdrawals', requireDriverSession, async (req, res, next) => {
  try {
    const monto = Number(req.body?.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ ok: false, error: 'Monto invalido' });
    }

    const chofer = await getChoferById(req.driverSession.choferId);
    const saldo = Number(chofer?.saldo_disponible || 0);
    if (monto > saldo) {
      return res.status(400).json({ ok: false, error: 'Saldo insuficiente' });
    }

    const metodo = cleanString(req.body?.metodo || 'transferencia');
    const payload = {
      chofer_id: req.driverSession.choferId,
      chofer_nombre: chofer?.nombre || req.driverSession.nombre || '',
      monto,
      metodo,
      status: metodo === 'stripe' ? 'procesado' : 'pendiente',
      created_at: new Date().toISOString()
    };
    if (metodo === 'transferencia') {
      payload.banco = cleanString(req.body?.banco);
      payload.clabe = cleanString(req.body?.clabe);
    } else {
      payload.stripe_card_id = cleanString(req.body?.stripe_card_id);
      payload.card_last4 = cleanString(req.body?.card_last4);
      payload.titular = cleanString(req.body?.titular || req.body?.nombre_titular || req.driverSession.nombre);
    }

    const withdrawal = await insertRow('solicitudes_retiro', payload);
    await updateChofer(req.driverSession.choferId, {
      saldo_disponible: saldo - monto,
      ultima_conexion: new Date().toISOString()
    });

    return res.status(201).json({ ok: true, data: withdrawal });
  } catch (error) {
    next(error);
  }
});

router.post('/driver/push-subscription', requireDriverSession, async (req, res, next) => {
  try {
    const subscription = req.body?.subscription;
    if (!subscription) return res.status(400).json({ ok: false, error: 'subscription requerido' });

    try {
      const rows = await supabaseRequest('push_subscriptions?on_conflict=chofer_id', {
        method: 'POST',
        headers: {
          ...supabaseHeaders(true),
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          chofer_id: req.driverSession.choferId,
          subscription,
          updated_at: new Date().toISOString()
        })
      });
      return res.status(201).json({ ok: true, data: rows?.[0] || null });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        console.warn('[driver-push-subscription] tabla push_subscriptions no existe aún; se omite', error.message);
        return res.status(201).json({ ok: true, data: null });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.post('/driver/photo', requireDriverSession, async (req, res, next) => {
  try {
    const dataUrl = cleanString(req.body?.dataUrl);
    if (!dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ ok: false, error: 'Imagen invalida' });
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ ok: false, error: 'Formato de imagen no soportado' });
    }

    const mimeType = match[1];
    const base64 = match[2];
    const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
    const fileName = 'chofer_' + req.driverSession.choferId + '_' + Date.now() + '.' + ext;
    const binary = Buffer.from(base64, 'base64');

    const uploadRes = await fetch(env.supabaseUrl + '/storage/v1/object/choferes/' + encodeURIComponent(fileName), {
      method: 'POST',
      headers: {
        apikey: env.supabaseServiceKey,
        Authorization: 'Bearer ' + env.supabaseServiceKey,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      body: binary
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '');
      return res.status(uploadRes.status).json({ ok: false, error: text || 'No se pudo subir la imagen' });
    }

    const publicUrl = env.supabaseUrl + '/storage/v1/object/public/choferes/' + encodeURIComponent(fileName);
    await updateChofer(req.driverSession.choferId, {
      foto_url: publicUrl,
      ultima_conexion: new Date().toISOString()
    });

    return res.status(201).json({ ok: true, data: { foto_url: publicUrl } });
  } catch (error) {
    next(error);
  }
});

router.post('/driver/reset', requireDriverSession, async (req, res, next) => {
  try {
    const chofer = await updateChoferWithWalletFallback(req.driverSession.choferId, {
      estado: 'offline',
      vehiculo: '',
      vehiculo_tipo: '',
      vehiculo_marca: '',
      vehiculo_modelo: '',
      vehiculo_color: '',
      placa: '',
      foto_url: '',
      saldo_disponible: 0,
      saldo_en_proceso: 0,
      wallet_balance: 0,
      cash_debt_limit: CASH_DEBT_LIMIT_DEFAULT,
      cash_blocked: false,
      viaje_actual: null,
      ubicacion: null,
      ultima_conexion: new Date().toISOString()
    });
    clearDriverSessionCookie(res);
    return res.json({ ok: true, data: chofer });
  } catch (error) {
    next(error);
  }
});

router.post('/driver/logout', requireDriverSession, async (req, res, next) => {
  try {
    await updateChofer(req.driverSession.choferId, {
      estado: 'offline',
      ultima_conexion: new Date().toISOString()
    });
    clearDriverSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
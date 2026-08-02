import { Router } from 'express';
import { env } from '../config/env.js';

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

router.post('/reservas', async (req, res, next) => {
  try {
    const body = req.body || {};
    const reservaId = clean(body.reserva_id || body.reservaId) || 'LUX-' + Date.now();
    const payload = {
      reserva_id: reservaId,
      cliente: clean(body.cliente),
      origen: clean(body.origen),
      destino: clean(body.destino),
      origen_lat: body.origen_lat ?? null,
      origen_lng: body.origen_lng ?? null,
      destino_lat: body.destino_lat ?? null,
      destino_lng: body.destino_lng ?? null,
      fecha: clean(body.fecha),
      hora_recogida: clean(body.hora_recogida),
      total: Number(body.total || 0),
      estado: clean(body.estado || 'pendiente') || 'pendiente',
      servicio: clean(body.servicio),
      vehiculo: clean(body.vehiculo),
      timestamp: body.timestamp || new Date().toISOString(),
      email_cliente: clean(body.email_cliente),
      pasajeros: body.pasajeros ?? null,
      traslado: clean(body.traslado),
      numero_vuelo: clean(body.numero_vuelo),
      distancia_km: body.distancia_km ?? null,
      duracion_min: body.duracion_min ?? null
    };

    const rows = await supabaseRequest('reservas', {
      method: 'POST',
      headers: supabaseHeaders(true),
      body: JSON.stringify(payload)
    });

    res.status(201).json({ ok: true, data: rows?.[0] || payload });
  } catch (error) {
    next(error);
  }
});

export default router;
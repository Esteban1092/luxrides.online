import { Router } from 'express';
import { env } from '../config/env.js';
import { requireAdminSession } from '../middleware/admin-auth.js';

const router = Router();

const CHOFER_ALLOWED_FIELDS = new Set([
  'id',
  'nombre',
  'hotel',
  'estado',
  'creado_en',
  'vehiculo_tipo',
  'vehiculo_marca',
  'vehiculo_modelo',
  'vehiculo_color',
  'placa',
  'ubicacion',
  'viaje_actual'
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

function normalizeChofer(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!CHOFER_ALLOWED_FIELDS.has(key)) continue;
    out[key] = value;
  }

  out.id = String(out.id || '').trim();
  out.nombre = String(out.nombre || '').trim();
  out.hotel = String(out.hotel || 'Sin hotel').trim() || 'Sin hotel';
  out.estado = String(out.estado || 'offline').trim() || 'offline';
  out.creado_en = out.creado_en || new Date().toISOString();

  return out;
}

router.use('/admin/choferes', requireAdminSession);

router.get('/admin/choferes', async (req, res, next) => {
  try {
    const rows = await supabaseRequest('choferes?select=*&order=id.asc', {
      method: 'GET',
      headers: supabaseHeaders()
    });
    res.json({ ok: true, data: rows || [] });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/choferes/:id', async (req, res, next) => {
  try {
    const id = encodeURIComponent(String(req.params.id || '').trim());
    if (!id) return res.status(400).json({ ok: false, error: 'ID invalido' });

    const rows = await supabaseRequest('choferes?id=eq.' + id + '&select=*&limit=1', {
      method: 'GET',
      headers: supabaseHeaders()
    });

    res.json({ ok: true, data: rows?.[0] || null });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/choferes', async (req, res, next) => {
  try {
    const payload = normalizeChofer(req.body || {});
    if (!payload.id || !payload.nombre) {
      return res.status(400).json({ ok: false, error: 'id y nombre son requeridos' });
    }

    const rows = await supabaseRequest('choferes', {
      method: 'POST',
      headers: supabaseHeaders(true),
      body: JSON.stringify(payload)
    });

    res.status(201).json({ ok: true, data: rows?.[0] || payload });
  } catch (error) {
    if (error.status === 409) {
      return res.status(409).json({ ok: false, error: 'Ya existe un chofer con ese ID.' });
    }
    next(error);
  }
});

router.patch('/admin/choferes/:id', async (req, res, next) => {
  try {
    const idRaw = String(req.params.id || '').trim();
    if (!idRaw) return res.status(400).json({ ok: false, error: 'ID invalido' });

    const patch = {};
    for (const [key, value] of Object.entries(req.body || {})) {
      if (key === 'id') continue;
      if (!CHOFER_ALLOWED_FIELDS.has(key)) continue;
      patch[key] = value;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: 'No hay campos validos para actualizar.' });
    }

    const rows = await supabaseRequest('choferes?id=eq.' + encodeURIComponent(idRaw), {
      method: 'PATCH',
      headers: supabaseHeaders(true),
      body: JSON.stringify(patch)
    });

    res.json({ ok: true, data: rows?.[0] || null });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/choferes/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'ID invalido' });

    await supabaseRequest('choferes?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: supabaseHeaders()
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/choferes', async (req, res, next) => {
  try {
    await supabaseRequest('choferes?id=neq.__none__', {
      method: 'DELETE',
      headers: supabaseHeaders()
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;

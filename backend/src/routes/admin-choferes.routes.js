import { Router } from 'express';
import { env } from '../config/env.js';
import { requireAdminSession } from '../middleware/admin-auth.js';

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

function normalizeChofer(input) {
  return {
    id: String(input?.id || '').trim(),
    nombre: String(input?.nombre || '').trim(),
    hotel: String(input?.hotel || 'Sin hotel').trim() || 'Sin hotel',
    estado: String(input?.estado || 'offline').trim() || 'offline',
    creado_en: input?.creado_en || new Date().toISOString(),
    updated_at: input?.updated_at || new Date().toISOString(),
    vehiculo_tipo: input?.vehiculo_tipo || null,
    vehiculo_marca: input?.vehiculo_marca || null,
    vehiculo_modelo: input?.vehiculo_modelo || null,
    vehiculo_color: input?.vehiculo_color || null,
    placa: input?.placa || null,
    ubicacion: input?.ubicacion || null,
    viaje_actual: input?.viaje_actual || null
  };
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

    const patch = { ...(req.body || {}) };
    delete patch.id;
    patch.updated_at = new Date().toISOString();

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

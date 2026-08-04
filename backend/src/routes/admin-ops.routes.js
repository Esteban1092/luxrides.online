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

router.use('/admin', requireAdminSession);

// Leer todas las reservas (usa service key para bypassear RLS)
router.get('/admin/reservas', async (req, res, next) => {
  try {
    if (!env.supabaseUrl) return res.json({ ok: true, data: [] });
    const estado = req.query.estado;
    let path = 'reservas?order=timestamp.desc&limit=500';
    if (estado) path += '&estado=eq.' + encodeURIComponent(estado);
    const data = await supabaseRequest(path, { method: 'GET', headers: supabaseHeaders() });
    res.json({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/viajes', async (req, res, next) => {
  try {
    const rows = await supabaseRequest('viajes', {
      method: 'POST',
      headers: supabaseHeaders(true),
      body: JSON.stringify(req.body || {})
    });
    res.status(201).json({ ok: true, data: rows?.[0] || null });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/push-notifications', async (req, res, next) => {
  try {
    const payload = {
      chofer_id: req.body?.chofer_id,
      reserva_id: req.body?.reserva_id,
      titulo: req.body?.titulo,
      cuerpo: req.body?.cuerpo,
      datos: req.body?.datos || null,
      created_at: new Date().toISOString()
    };

    const rows = await supabaseRequest('push_notifications', {
      method: 'POST',
      headers: supabaseHeaders(true),
      body: JSON.stringify(payload)
    });

    res.status(201).json({ ok: true, data: rows?.[0] || null });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/reservas/:reservaId', async (req, res, next) => {
  try {
    const reservaId = String(req.params.reservaId || '').trim();
    if (!reservaId) return res.status(400).json({ ok: false, error: 'reservaId invalido' });

    const rows = await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(reservaId), {
      method: 'PATCH',
      headers: supabaseHeaders(true),
      body: JSON.stringify(req.body || {})
    });

    res.json({ ok: true, data: rows?.[0] || null });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/reservas/:reservaId', async (req, res, next) => {
  try {
    const reservaId = String(req.params.reservaId || '').trim();
    if (!reservaId) return res.status(400).json({ ok: false, error: 'reservaId invalido' });

    await supabaseRequest('viajes?reserva_id=eq.' + encodeURIComponent(reservaId), {
      method: 'DELETE',
      headers: supabaseHeaders()
    });

    await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(reservaId), {
      method: 'DELETE',
      headers: supabaseHeaders()
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/reservas/:reservaId/force', async (req, res, next) => {
  try {
    const reservaId = String(req.params.reservaId || '').trim();
    if (!reservaId) return res.status(400).json({ ok: false, error: 'reservaId invalido' });

    const choferId = String(req.body?.choferId || '').trim();
    if (choferId) {
      try {
        await supabaseRequest('choferes?id=eq.' + encodeURIComponent(choferId), {
          method: 'PATCH',
          headers: supabaseHeaders(true),
          body: JSON.stringify({ viaje_actual: null })
        });
      } catch (error) {
        console.warn('[admin-force-delete] no se pudo liberar chofer', error.message);
      }
    }

    try {
      await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(reservaId), {
        method: 'PATCH',
        headers: supabaseHeaders(true),
        body: JSON.stringify({
          chofer_id: null,
          chofer_asignado: null,
          chofer_nombre: null,
          estado: 'cancelado'
        })
      });
    } catch (error) {
      console.warn('[admin-force-delete] no se pudo limpiar reserva', error.message);
    }

    const dependientes = ['viajes', 'calificaciones', 'notificaciones'];
    for (const table of dependientes) {
      try {
        await supabaseRequest(table + '?reserva_id=eq.' + encodeURIComponent(reservaId), {
          method: 'DELETE',
          headers: supabaseHeaders()
        });
      } catch (error) {
        console.warn('[admin-force-delete] tabla dependiente error', table, error.message);
      }
    }

    await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(reservaId), {
      method: 'DELETE',
      headers: supabaseHeaders()
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/historial/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id invalido' });

    await supabaseRequest('historial?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: supabaseHeaders()
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/historial/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id invalido' });

    const rows = await supabaseRequest('historial?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: supabaseHeaders(true),
      body: JSON.stringify(req.body || {})
    });

    res.json({ ok: true, data: rows?.[0] || null });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/historial/chofer/:choferId', async (req, res, next) => {
  try {
    const choferId = String(req.params.choferId || '').trim();
    if (!choferId) return res.status(400).json({ ok: false, error: 'choferId invalido' });

    await supabaseRequest('historial?chofer_id=eq.' + encodeURIComponent(choferId), {
      method: 'DELETE',
      headers: supabaseHeaders()
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;

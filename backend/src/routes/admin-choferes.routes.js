import { Router } from 'express';
import { env } from '../config/env.js';
import { requireAdminSession } from '../middleware/admin-auth.js';

const router = Router();

const CHOFER_ALLOWED_FIELDS = new Set([
  'id',
  'nombre',
  'password_hash',
  'hotel',
  'estado',
  'creado_en',
  'vehiculo_tipo',
  'vehiculo_marca',
  'vehiculo_modelo',
  'vehiculo_color',
  'placa',
  'ubicacion',
  'viaje_actual',
  'saldo_disponible',
  'saldo_en_proceso',
  'wallet_balance',
  'cash_debt_limit',
  'cash_blocked'
]);

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

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

router.post('/admin/choferes/:id/wallet-adjustments', async (req, res, next) => {
  try {
    const choferId = String(req.params.id || '').trim();
    if (!choferId) return res.status(400).json({ ok: false, error: 'ID invalido' });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ ok: false, error: 'amount debe ser numerico y distinto de 0' });
    }

    const choferRows = await supabaseRequest('choferes?id=eq.' + encodeURIComponent(choferId) + '&select=*&limit=1', {
      method: 'GET',
      headers: supabaseHeaders()
    });
    const chofer = choferRows?.[0] || null;
    if (!chofer) return res.status(404).json({ ok: false, error: 'Chofer no encontrado' });

    const currentWallet = Number.isFinite(Number(chofer.wallet_balance))
      ? Number(chofer.wallet_balance)
      : Number(chofer.saldo_disponible || 0);
    const debtLimit = Number.isFinite(Number(chofer.cash_debt_limit))
      ? Number(chofer.cash_debt_limit)
      : -300;
    const nextWallet = roundMoney(currentWallet + amount);
    const blockedByDebt = nextWallet <= debtLimit;

    const updateRows = await supabaseRequest('choferes?id=eq.' + encodeURIComponent(choferId), {
      method: 'PATCH',
      headers: supabaseHeaders(true),
      body: JSON.stringify({
        wallet_balance: nextWallet,
        cash_debt_limit: debtLimit,
        cash_blocked: blockedByDebt,
        ultima_conexion: new Date().toISOString()
      })
    });

    try {
      await supabaseRequest('wallet_movements', {
        method: 'POST',
        headers: supabaseHeaders(true),
        body: JSON.stringify({
          chofer_id: choferId,
          tipo: String(req.body?.tipo || 'manual_adjustment').slice(0, 60),
          metodo_pago: String(req.body?.metodo || 'admin_manual').slice(0, 40),
          amount: amount,
          wallet_balance_before: currentWallet,
          wallet_balance_after: nextWallet,
          metadata: {
            referencia: String(req.body?.referencia || ''),
            notas: String(req.body?.notas || ''),
            admin_id: req.adminSession?.adminId || null
          },
          created_at: new Date().toISOString()
        })
      });
    } catch (error) {
      console.warn('[admin-wallet-adjustment] no se pudo guardar wallet_movements', error.message);
    }

    res.status(201).json({
      ok: true,
      data: updateRows?.[0] || null,
      wallet_balance_before: currentWallet,
      wallet_balance_after: nextWallet,
      cash_blocked: blockedByDebt,
      debt_limit: debtLimit
    });
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

import { Router } from 'express';
import { env } from '../config/env.js';
import { readAdminSession } from '../middleware/admin-auth.js';
import { readDriverSession } from '../middleware/driver-auth.js';

const router = Router();

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
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
  const response = await fetch(env.supabaseUrl + '/rest/v1/' + path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const missingChatTable = response.status === 404 && (data?.code === 'PGRST205' || String(data?.message || '').includes('driver_chat_messages'));
    const error = new Error(missingChatTable
      ? 'El chat aún no está configurado en Supabase. Ejecuta backend/src/migrations/20260925_driver_chat.sql en el SQL Editor de Supabase.'
      : (data?.message || data?.error || 'Error de Supabase'));
    error.status = missingChatTable ? 503 : response.status;
    throw error;
  }
  return data;
}

async function getCustomerFromToken(req) {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const response = await fetch(env.supabaseUrl + '/auth/v1/user', {
    headers: { apikey: env.supabaseServiceKey, Authorization: 'Bearer ' + token }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user?.id) return null;
  return {
    role: 'customer',
    id: String(user.id),
    name: clean(user.user_metadata?.nombre_completo || user.email || 'Usuario', 120)
  };
}

async function getPrincipal(req) {
  const driver = readDriverSession(req);
  if (driver) return { role: 'driver', id: String(driver.choferId), name: clean(driver.nombre || 'Chofer', 120) };

  const admin = readAdminSession(req);
  if (admin) return { role: 'admin', id: 'admin', name: 'Admin LuxRides' };

  return getCustomerFromToken(req);
}

function conversationId(customerId, driverId) {
  return clean(customerId, 120) + ':' + clean(driverId, 120);
}

function canAccessConversation(principal, customerId, driverId) {
  if (!principal) return false;
  if (principal.role === 'admin') return true;
  if (principal.role === 'driver') return principal.id === driverId;
  return principal.role === 'customer' && principal.id === customerId;
}

router.get('/driver-chat/messages', async (req, res, next) => {
  try {
    const principal = await getPrincipal(req);
    const customerId = clean(req.query.customerId);
    const driverId = clean(req.query.driverId);
    const driverInbox = principal?.role === 'driver' && principal.id === driverId && !customerId;
    if (!principal || !driverId || (!driverInbox && (!customerId || !canAccessConversation(principal, customerId, driverId)))) {
      return res.status(401).json({ ok: false, error: 'No autorizado para este chat.' });
    }

    const query = driverInbox
      ? 'driver_chat_messages?driver_id=eq.' + encodeURIComponent(driverId) + '&select=*&order=created_at.asc&limit=300'
      : 'driver_chat_messages?conversation_id=eq.' + encodeURIComponent(conversationId(customerId, driverId)) + '&select=*&order=created_at.asc&limit=100';
    const rows = await supabaseRequest(query, { headers: supabaseHeaders() });
    return res.json({ ok: true, messages: rows || [] });
  } catch (error) {
    next(error);
  }
});

router.post('/driver-chat/messages', async (req, res, next) => {
  try {
    const principal = await getPrincipal(req);
    const customerId = clean(req.body?.customerId);
    const driverId = clean(req.body?.driverId);
    const message = clean(req.body?.message, 1200);
    if (!principal || !customerId || !driverId || !message || !canAccessConversation(principal, customerId, driverId)) {
      return res.status(401).json({ ok: false, error: 'No autorizado para enviar este mensaje.' });
    }

    const senderRole = principal.role;
    const row = await supabaseRequest('driver_chat_messages', {
      method: 'POST',
      headers: supabaseHeaders(true),
      body: JSON.stringify({
        conversation_id: conversationId(customerId, driverId),
        customer_id: customerId,
        driver_id: driverId,
        sender_role: senderRole,
        sender_id: principal.id,
        sender_name: principal.name,
        message
      })
    });
    return res.status(201).json({ ok: true, message: row?.[0] || null });
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express';
import { env } from '../config/env.js';
import { clearAdminSessionCookie, readAdminSession, setAdminSessionCookie } from '../middleware/admin-auth.js';

const router = Router();

const loginAttempts = new Map();

function isBlocked(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    loginAttempts.delete(ip);
    return false;
  }
  return true;
}

function registerFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, until: now + (10 * 60 * 1000) };
  if (now > entry.until) {
    entry.count = 0;
    entry.until = now + (10 * 60 * 1000);
  }
  entry.count += 1;
  if (entry.count >= 7) {
    entry.until = now + (15 * 60 * 1000);
  }
  loginAttempts.set(ip, entry);
}

function clearFailures(ip) {
  loginAttempts.delete(ip);
}

router.post('/admin/login', (req, res) => {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
  if (isBlocked(ip)) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera 15 minutos.' });
  }

  const id = String(req.body?.id || '').trim();
  const pass = String(req.body?.pass || '').trim();

  if (!id || !pass) {
    return res.status(400).json({ ok: false, error: 'Faltan credenciales' });
  }

  const ok = id === env.admin.id && pass === env.admin.pass;
  if (!ok) {
    registerFailure(ip);
    return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
  }

  clearFailures(ip);
  setAdminSessionCookie(res);
  return res.json({ ok: true });
});

router.get('/admin/session', (req, res) => {
  const session = readAdminSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Sesion invalida' });
  }
  return res.json({ ok: true, role: session.role, exp: session.exp });
});

router.post('/admin/logout', (req, res) => {
  clearAdminSessionCookie(res);
  return res.json({ ok: true });
});

export default router;

import crypto from 'node:crypto';
import { env } from '../config/env.js';

const DRIVER_COOKIE = 'luxrides_driver_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function cookieSecret() {
  return env.driver.sessionSecret || env.admin.sessionSecret || env.quoteSecret || 'luxrides-driver-fallback';
}

function sign(payload) {
  return crypto.createHmac('sha256', cookieSecret()).update(payload).digest('base64url');
}

function parseCookies(req) {
  const header = String(req.headers?.cookie || '');
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function createDriverSessionCookieValue(chofer) {
  const payloadObj = {
    role: 'driver',
    choferId: String(chofer?.id || '').trim(),
    nombre: String(chofer?.nombre || '').trim(),
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = sign(payload);
  return payload + '.' + sig;
}

export function verifyDriverSessionCookieValue(raw) {
  const token = String(raw || '');
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || data.role !== 'driver') return null;
  if (!data.choferId || !data.exp || Date.now() > Number(data.exp)) return null;
  return data;
}

export function setDriverSessionCookie(res, chofer) {
  const value = createDriverSessionCookieValue(chofer);
  res.cookie(DRIVER_COOKIE, value, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS,
    path: '/'
  });
}

export function clearDriverSessionCookie(res) {
  res.clearCookie(DRIVER_COOKIE, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/'
  });
}

export function readDriverSession(req) {
  const cookies = parseCookies(req);
  const cookieSession = verifyDriverSessionCookieValue(cookies[DRIVER_COOKIE]);
  if (cookieSession) return cookieSession;

  const authHeader = String(req.headers?.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    return verifyDriverSessionCookieValue(token);
  }

  return null;
}

export function requireDriverSession(req, res, next) {
  const session = readDriverSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Sesion expirada o no autorizada.' });
  }
  req.driverSession = session;
  next();
}
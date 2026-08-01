import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ADMIN_COOKIE = 'luxrides_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function cookieSecret() {
  return env.admin.sessionSecret || env.admin.pass || env.quoteSecret || 'luxrides-admin-fallback';
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

export function createAdminSessionCookieValue() {
  const payloadObj = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = sign(payload);
  return payload + '.' + sig;
}

export function verifyAdminSessionCookieValue(raw) {
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
  if (!data || data.role !== 'admin') return null;
  if (!data.exp || Date.now() > Number(data.exp)) return null;
  return data;
}

export function setAdminSessionCookie(res) {
  const value = createAdminSessionCookieValue();
  res.cookie(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS,
    path: '/'
  });
}

export function clearAdminSessionCookie(res) {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/'
  });
}

export function readAdminSession(req) {
  const cookies = parseCookies(req);
  return verifyAdminSessionCookieValue(cookies[ADMIN_COOKIE]);
}

export function requireAdminSession(req, res, next) {
  const session = readAdminSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Sesion expirada o no autorizada.' });
  }
  req.adminSession = session;
  next();
}

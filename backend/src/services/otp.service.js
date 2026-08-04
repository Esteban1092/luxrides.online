import crypto from 'crypto';

// email → { code, expiresAt, attempts, sendCount, windowStart }
const store = new Map();

// Limpiar entradas expiradas cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export function generateOtp(email) {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const existing = store.get(key);
  const windowActive = existing && existing.windowStart && (now - existing.windowStart < 15 * 60 * 1000);

  // Máximo 3 envíos por ventana de 15 minutos
  if (windowActive && existing.sendCount >= 3) {
    const err = new Error('Demasiados intentos. Espera 15 minutos antes de solicitar otro código.');
    err.status = 429;
    throw err;
  }

  const code = String(crypto.randomInt(100000, 999999));
  store.set(key, {
    code,
    expiresAt: now + 10 * 60 * 1000,
    attempts: 0,
    sendCount: windowActive ? existing.sendCount + 1 : 1,
    windowStart: windowActive ? existing.windowStart : now
  });

  return code;
}

export function verifyOtp(email, inputCode) {
  const key = email.toLowerCase().trim();
  const entry = store.get(key);

  if (!entry) return { ok: false, reason: 'not_found' };
  if (Date.now() > entry.expiresAt) { store.delete(key); return { ok: false, reason: 'expired' }; }

  entry.attempts++;
  if (entry.attempts > 5) return { ok: false, reason: 'too_many_attempts' };
  if (entry.code !== String(inputCode).trim()) return { ok: false, reason: 'wrong_code' };

  store.delete(key); // invalidar tras uso exitoso
  return { ok: true };
}

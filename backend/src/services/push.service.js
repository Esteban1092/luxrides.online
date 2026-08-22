import webpush from 'web-push';
import { env } from '../config/env.js';

function sanitizeVapidKey(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/-----BEGIN [A-Z ]+-----/g, '').replace(/-----END [A-Z ]+-----/g, '').replace(/\s+/g, '');
}

const publicKey = sanitizeVapidKey(env.vapid.publicKey);
const privateKey = sanitizeVapidKey(env.vapid.privateKey);

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(
      'mailto:' + env.vapid.email,
      publicKey,
      privateKey
    );
    console.log('[push] VAPID configurado correctamente');
  } catch (error) {
    console.warn('[push] VAPID inválido, push notifications desactivadas:', error.message);
  }
} else {
  console.warn('[push] VAPID keys no configuradas — push notifications desactivadas');
}

export async function enviarPushAChofer(choferId) {
  const res = await fetch(
    env.supabaseUrl + '/rest/v1/push_subscriptions?chofer_id=eq.' + encodeURIComponent(choferId) + '&select=subscription',
    { headers: { apikey: env.supabaseServiceKey, Authorization: 'Bearer ' + env.supabaseServiceKey } }
  );

  if (!res.ok) throw new Error('No se pudo obtener la suscripción del chofer');
  const rows = await res.json();
  if (!rows || !rows.length) throw new Error('El chofer no tiene suscripción push registrada');

  return rows[0].subscription;
}

export async function enviarPush(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

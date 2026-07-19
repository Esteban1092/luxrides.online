import webpush from 'web-push';
import { env } from '../config/env.js';

webpush.setVapidDetails(
  'mailto:' + env.vapid.email,
  env.vapid.publicKey,
  env.vapid.privateKey
);

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

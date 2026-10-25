import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { enviarPushAChofer, enviarPush } from '../services/push.service.js';
import { runScheduledNotifications } from '../services/customer-notifications.service.js';

const router = Router();

async function enviarPushChoferDesdeBody(body) {
  const { chofer_id, titulo, cuerpo, tag, url } = body || {};
  if (!chofer_id || !titulo) {
    const err = new Error('chofer_id y titulo son requeridos');
    err.status = 400;
    throw err;
  }

  const subscription = await enviarPushAChofer(chofer_id);
  await enviarPush(subscription, {
    title: titulo,
    body: cuerpo || '',
    tag: tag || 'luxrides-viaje',
    url: url || '/ses.html'
  });
}

router.post('/push/enviar', async (req, res, next) => {
  try {
    await enviarPushChoferDesdeBody(req.body);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/push/notificar', async (req, res, next) => {
  try {
    await enviarPushChoferDesdeBody(req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Para un cron externo que despierte el servicio: sin NOTIFICATIONS_CRON_SECRET el endpoint no existe.
router.all('/notifications/tick', async (req, res, next) => {
  const expected = env.notifications.cronSecret;
  if (!expected) return res.status(404).json({ ok: false, error: 'No encontrado' });
  const supplied = Buffer.from(String(req.headers['x-cron-secret'] || ''));
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !crypto.timingSafeEqual(supplied, wanted)) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  try {
    res.json({ ok: true, ...(await runScheduledNotifications()) });
  } catch (err) {
    next(err);
  }
});

export default router;

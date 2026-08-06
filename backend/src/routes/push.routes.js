import { Router } from 'express';
import { enviarPushAChofer, enviarPush } from '../services/push.service.js';

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

export default router;

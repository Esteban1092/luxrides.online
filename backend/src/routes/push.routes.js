import { Router } from 'express';
import { enviarPushAChofer, enviarPush } from '../services/push.service.js';

const router = Router();

router.post('/push/enviar', async (req, res, next) => {
  try {
    const { chofer_id, titulo, cuerpo, tag, url } = req.body;
    if (!chofer_id || !titulo) {
      return res.status(400).json({ error: 'chofer_id y titulo son requeridos' });
    }

    const subscription = await enviarPushAChofer(chofer_id);
    await enviarPush(subscription, { title: titulo, body: cuerpo || '', tag: tag || 'luxrides-viaje', url: url || '/ses.html' });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

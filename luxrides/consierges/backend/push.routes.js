import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

const ONE_SIGNAL_APP_ID = '3b1b174b-aa37-4ce6-b3f1-2dab7accc4e2';

router.post('/push/notificar', async (req, res, next) => {
  try {
    const { external_user_ids, titulo, cuerpo, datos } = req.body || {};

    if (!titulo || !cuerpo) {
      return res.status(400).json({ ok: false, error: 'titulo y cuerpo son requeridos' });
    }

    const restApiKey = env.oneSignalRestKey;
    if (!restApiKey) {
      return res.status(503).json({ ok: false, error: 'OneSignal REST key no configurada' });
    }

    const payload = {
      app_id: ONE_SIGNAL_APP_ID,
      headings: { en: titulo, es: titulo },
      contents: { en: cuerpo, es: cuerpo },
      data: datos || {}
    };

    if (external_user_ids && external_user_ids.length > 0) {
      payload.include_aliases = { external_id: external_user_ids };
      payload.target_channel = 'push';
    } else {
      payload.included_segments = ['All'];
    }

    const r = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Key ' + restApiKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: data.errors?.[0] || 'OneSignal error' });
    }

    return res.json({ ok: true, id: data.id, recipients: data.recipients });
  } catch (err) {
    next(err);
  }
});

export default router;

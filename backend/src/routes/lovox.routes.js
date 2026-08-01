import { Router } from 'express';
import { generarVozEdge } from '../services/edge-tts.service.js';

const router = Router();

router.post('/lovox/speak', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    const lang = String(req.body?.lang || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text es requerido' });
    }
    const out = await generarVozEdge(text, lang);
    return res.json({ ok: true, ...out });
  } catch (err) {
    next(err);
  }
});

export default router;

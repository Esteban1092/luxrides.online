import { Router } from 'express';
import { generarVozFish } from '../services/fish.service.js';

const router = Router();

// POST /api/lovox/speak
// body: { text: "..." }
router.post('/lovox/speak', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text es requerido' });
    }
    const out = await generarVozFish(text);
    return res.json({ ok: true, ...out });
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from 'express';
import { completarChat } from '../services/groq.service.js';

const router = Router();

// /api/chat — usado por Iovox AI en el frontend
router.post('/chat', async (req, res, next) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages requerido y debe ser array' });
    }
    const reply = await completarChat(messages);
    res.json({ ok: true, reply });
  } catch (err) {
    next(err);
  }
});

export default router;

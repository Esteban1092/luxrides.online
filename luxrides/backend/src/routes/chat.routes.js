import { Router } from 'express';
import { completarChat } from '../services/groq.service.js';

const router = Router();

router.post('/chat', async (req, res, next) => {
  try {
    const messages = req.body?.messages;
    const reply = await completarChat(messages);
    res.json({ reply });
  } catch (err) {
    next(err);
  }
});

export default router;

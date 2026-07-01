import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

router.post('/admin/login', (req, res) => {
  const { id, pass } = req.body || {};
  if (!id || !pass) {
    return res.status(400).json({ ok: false, error: 'id y pass requeridos' });
  }
  if (id === env.adminId && pass === env.adminPass) {
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
});

export default router;

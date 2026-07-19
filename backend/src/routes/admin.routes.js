import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

router.post('/admin/login', (req, res) => {
  const id = String(req.body?.id || '').trim();
  const pass = String(req.body?.pass || '').trim();

  if (!id || !pass) {
    return res.status(400).json({ ok: false, error: 'Faltan credenciales' });
  }

  const ok = id === env.admin.id && pass === env.admin.pass;
  if (!ok) {
    return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
  }

  return res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { enviarCorreoReserva } from '../services/email.service.js';

const router = Router();

async function handleEnviarReserva(req, res, next) {
  try {
    await enviarCorreoReserva(req.body || {});
    res.json({ ok: true, message: 'Correo enviado' });
  } catch (err) {
    next(err);
  }
}

router.post('/enviar-reserva', handleEnviarReserva);
router.post('/email/reserva-confirmacion', handleEnviarReserva);

export default router;

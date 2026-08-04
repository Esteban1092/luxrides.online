import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import nodemailer from 'nodemailer';
import { generateOtp, verifyOtp } from '../services/otp.service.js';
import { env } from '../config/env.js';

const router = Router();

function getMailer() {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) return null;
  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass }
  });
}

function otpEmailHtml(code, email) {
  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fffdf5;border:1px solid #e8d9a0;border-radius:12px;">
    <h2 style="margin:0 0 4px;font-size:22px;color:#b8860b;letter-spacing:.04em;">LUXRIDES</h2>
    <p style="margin:0 0 24px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.12em;">Transporte Ejecutivo VIP</p>
    <p style="font-size:15px;color:#333;margin-bottom:8px;">Tu código de verificación es:</p>
    <div style="font-size:42px;font-weight:700;letter-spacing:12px;color:#1a1a1a;text-align:center;padding:18px 0;border:2px dashed #d4af37;border-radius:10px;margin:12px 0 24px;">
      ${code}
    </div>
    <p style="font-size:13px;color:#666;margin:0;">Este código expira en <b>10 minutos</b>. Si no lo solicitaste, ignora este mensaje.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
    <p style="font-size:11px;color:#aaa;margin:0;">luxrides.online · Servicio de transporte ejecutivo en CDMX</p>
  </div>`;
}

// POST /api/auth/send-otp
router.post('/auth/send-otp',
  body('email').isEmail().normalizeEmail().withMessage('Correo inválido'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, error: errors.array()[0].msg });

    const email = req.body.email.toLowerCase().trim();
    const mailer = getMailer();
    if (!mailer) return res.status(503).json({ ok: false, error: 'Servicio de correo no configurado.' });

    let code;
    try {
      code = generateOtp(email);
    } catch (e) {
      return res.status(e.status || 429).json({ ok: false, error: e.message });
    }

    try {
      await mailer.sendMail({
        from: env.smtp.from,
        to: email,
        subject: 'LuxRides – Código de verificación: ' + code,
        html: otpEmailHtml(code, email)
      });
      res.json({ ok: true, message: 'Código enviado a ' + email });
    } catch (e) {
      console.error('[auth/send-otp] error SMTP:', e.message);
      res.status(502).json({ ok: false, error: 'No se pudo enviar el correo. Intenta de nuevo.' });
    }
  }
);

// POST /api/auth/verify-otp  — verifica el código y genera link de recuperación si aplica
router.post('/auth/verify-otp',
  body('email').isEmail().normalizeEmail(),
  body('code').isString().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, error: 'Datos inválidos.' });

    const email = req.body.email.toLowerCase().trim();
    const code = String(req.body.code).trim();
    const purpose = String(req.body.purpose || 'recovery');

    const result = verifyOtp(email, code);
    if (!result.ok) {
      const msgs = {
        not_found: 'No hay un código activo para este correo. Solicita uno nuevo.',
        expired: 'El código expiró. Solicita uno nuevo.',
        wrong_code: 'Código incorrecto. Intenta de nuevo.',
        too_many_attempts: 'Demasiados intentos. Solicita un código nuevo.'
      };
      return res.status(400).json({ ok: false, error: msgs[result.reason] || 'Código inválido.' });
    }

    // Si es recuperación de contraseña y hay Supabase configurado, generar link de admin
    if (purpose === 'recovery' && env.supabaseUrl && env.supabaseServiceKey) {
      try {
        const resp = await fetch(`${env.supabaseUrl}/auth/v1/admin/generate_link`, {
          method: 'POST',
          headers: {
            apikey: env.supabaseServiceKey,
            Authorization: 'Bearer ' + env.supabaseServiceKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ type: 'recovery', email })
        });
        const linkData = await resp.json().catch(() => ({}));
        if (resp.ok && linkData?.action_link) {
          return res.json({ ok: true, action_link: linkData.action_link });
        }
      } catch (e) {
        console.warn('[auth/verify-otp] no se pudo generar recovery link:', e.message);
      }
    }

    res.json({ ok: true });
  }
);

export default router;

import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass
    }
  });
  return transporter;
}

function buildReservaHtml(payload) {
  const cliente = payload.passenger_name || payload.cliente || payload.nombre || 'Cliente';
  const confirmationCode = payload.confirmation_code || payload.codigo_confirmacion || 'N/A';
  const origen = payload.origen || 'N/A';
  const destino = payload.destino || 'N/A';
  const fecha = payload.fecha || 'N/A';
  const hora = payload.hora_recogida || payload.hora || 'N/A';
  const total = payload.total ? '$' + Number(payload.total).toLocaleString('es-MX') + ' MXN' : 'N/A';
  const cancelUrl = payload.cancel_url || '';
  const cancelButton = cancelUrl
    ? `<p style="margin:24px 0 0;"><a href="${cancelUrl}" style="display:inline-block;background:#b91c1c;color:#ffffff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:bold;">Cancelar reserva</a></p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#B8860B;">LuxRides - Confirmacion de reserva</h2>
      <p>Hola ${cliente}, tu reserva fue registrada correctamente.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Codigo de confirmacion</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${confirmationCode}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Origen</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${origen}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Destino</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${destino}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Fecha</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${fecha}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Hora</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${hora}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Total</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${total}</td></tr>
      </table>
      ${cancelButton}
      <p style="margin-top:16px;">Gracias por elegir LuxRides.</p>
    </div>
  `;
}

export function createCancellationToken(reservaId) {
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const value = `${reservaId}.${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', env.reservationCancellationSecret)
    .update(value)
    .digest('base64url');
  return `${expiresAt}.${signature}`;
}

export function verifyCancellationToken(reservaId, token) {
  const [expiresAt, signature] = String(token || '').split('.');
  const numericExpiration = Number(expiresAt);
  if (!Number.isSafeInteger(numericExpiration) || numericExpiration < Math.floor(Date.now() / 1000) || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.reservationCancellationSecret)
    .update(`${reservaId}.${expiresAt}`)
    .digest('base64url');
  const receivedSignature = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return receivedSignature.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedSignature, expectedBuffer);
}

export async function enviarCorreoReserva(payload) {
  const to = String(payload.email_cliente || payload.email || '').trim();
  if (!to) {
    const err = new Error('email_cliente is required');
    err.status = 400;
    throw err;
  }

  const mailer = getTransporter();
  if (!mailer) {
    return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  }

  await mailer.sendMail({
    from: env.smtp.from,
    to,
    subject: 'LuxRides - Confirmacion de reserva',
    html: buildReservaHtml(payload)
  });

  return { ok: true, skipped: false };
}

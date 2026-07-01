import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: { user: env.smtp.user, pass: env.smtp.pass }
});

function htmlReserva(payload) {
  return `
    <div style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:0 auto;">
      <h2 style="color:#b8860b;">LuxRides - Confirmacion de reserva</h2>
      <p>Tu reserva fue registrada correctamente.</p>
      <p><b>Origen:</b> ${payload.origen || 'N/A'}</p>
      <p><b>Destino:</b> ${payload.destino || 'N/A'}</p>
      <p><b>Fecha:</b> ${payload.fecha || 'N/A'}</p>
      <p><b>Hora:</b> ${payload.hora_recogida || payload.hora || 'N/A'}</p>
      <p><b>Total:</b> ${payload.total ? '$' + Number(payload.total).toLocaleString('es-MX') + ' MXN' : 'N/A'}</p>
    </div>
  `;
}

export async function enviarCorreoReserva(payload) {
  const to = String(payload.email_cliente || '').trim();
  if (!to) {
    const err = new Error('email_cliente is required');
    err.status = 400;
    throw err;
  }

  await transporter.sendMail({
    from: env.smtp.from,
    to,
    subject: 'LuxRides - Confirmacion de reserva',
    html: htmlReserva(payload)
  });
}

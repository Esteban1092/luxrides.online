import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass
  }
});

function buildReservaHtml(payload) {
  const cliente = payload.cliente || payload.nombre || 'Cliente';
  const origen = payload.origen || 'N/A';
  const destino = payload.destino || 'N/A';
  const fecha = payload.fecha || 'N/A';
  const hora = payload.hora_recogida || payload.hora || 'N/A';
  const total = payload.total ? '$' + Number(payload.total).toLocaleString('es-MX') + ' MXN' : 'N/A';

  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#B8860B;">LuxRides - Confirmacion de reserva</h2>
      <p>Hola ${cliente}, tu reserva fue registrada correctamente.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Origen</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${origen}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Destino</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${destino}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Fecha</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${fecha}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Hora</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${hora}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;"><b>Total</b></td><td style="padding:8px;border-bottom:1px solid #eee;">${total}</td></tr>
      </table>
      <p style="margin-top:16px;">Gracias por elegir LuxRides.</p>
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
    html: buildReservaHtml(payload)
  });
}

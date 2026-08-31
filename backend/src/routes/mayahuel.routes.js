import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const router = Router();

const fallbackInfo = {
  name: 'Restaurante Mayahuel',
  slug: 'mayahuel',
  address: 'San Francisco Mazapa, Teotihuacan',
  phone: '5555555555',
  is_active: true
};

const fallbackTables = [
  { id: 'demo-m-01', table_number: 'M-01', zone_name: 'Terraza VIP', capacity: 4, status: 'AVAILABLE', pos_x: 1, pos_y: 1 },
  { id: 'demo-m-02', table_number: 'M-02', zone_name: 'Terraza VIP', capacity: 2, status: 'RESERVED', pos_x: 2, pos_y: 1 },
  { id: 'demo-m-03', table_number: 'M-03', zone_name: 'Terraza VIP', capacity: 4, status: 'AVAILABLE', pos_x: 3, pos_y: 1 },
  { id: 'demo-m-04', table_number: 'M-04', zone_name: 'Jardin Principal', capacity: 6, status: 'OCCUPIED', pos_x: 1, pos_y: 2 },
  { id: 'demo-m-05', table_number: 'M-05', zone_name: 'Jardin Principal', capacity: 6, status: 'AVAILABLE', pos_x: 2, pos_y: 2 },
  { id: 'demo-m-06', table_number: 'M-06', zone_name: 'Jardin Principal', capacity: 8, status: 'AVAILABLE', pos_x: 3, pos_y: 2 }
];

let mailer = null;

function clean(value) {
  return String(value || '').trim();
}

function supabaseHeaders(preferRepresentation = false) {
  const headers = {
    apikey: env.supabaseServiceKey,
    Authorization: 'Bearer ' + env.supabaseServiceKey,
    'Content-Type': 'application/json'
  };
  if (preferRepresentation) headers.Prefer = 'return=representation';
  return headers;
}

async function supabaseRequest(path, options = {}) {
  const res = await fetch(env.supabaseUrl + '/rest/v1/' + path, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.message || data?.error_description || data?.error || 'Error de Supabase';
    const err = new Error(reason);
    err.status = res.status;
    throw err;
  }
  return data;
}

function getMailer() {
  if (mailer) return mailer;
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) return null;
  mailer = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass }
  });
  return mailer;
}

function reservationEmailHtml(payload, table) {
  const tableName = table?.table_number || payload.table_number || 'Mesa';
  const zone = table?.zone_name || payload.zone_name || 'Mayahuel';
  const capacity = table?.capacity || payload.guest_count || '';
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#17212d;">
      <div style="padding:20px 0;text-align:center;color:#b8860b;font-weight:800;letter-spacing:2px;">LUXRIDES PASS</div>
      <div style="border:1px solid #eadfbf;border-radius:18px;overflow:hidden;background:#fffaf0;">
        <div style="padding:22px;background:#102018;color:#f8e7b1;">
          <h2 style="margin:0;font-size:24px;">Nueva reserva Mayahuel</h2>
          <p style="margin:8px 0 0;color:#d6c69c;">Reservacion creada desde LuxRides Pass.</p>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;">
          <tr><td style="padding:12px;border-bottom:1px solid #eee;"><b>Cliente</b></td><td style="padding:12px;border-bottom:1px solid #eee;">${payload.customer_name}</td></tr>
          <tr><td style="padding:12px;border-bottom:1px solid #eee;"><b>Telefono</b></td><td style="padding:12px;border-bottom:1px solid #eee;">${payload.customer_phone || 'N/A'}</td></tr>
          <tr><td style="padding:12px;border-bottom:1px solid #eee;"><b>Email</b></td><td style="padding:12px;border-bottom:1px solid #eee;">${payload.customer_email || 'N/A'}</td></tr>
          <tr><td style="padding:12px;border-bottom:1px solid #eee;"><b>Mesa</b></td><td style="padding:12px;border-bottom:1px solid #eee;">${tableName} · ${zone}</td></tr>
          <tr><td style="padding:12px;border-bottom:1px solid #eee;"><b>Capacidad</b></td><td style="padding:12px;border-bottom:1px solid #eee;">${capacity} personas</td></tr>
          <tr><td style="padding:12px;border-bottom:1px solid #eee;"><b>Personas</b></td><td style="padding:12px;border-bottom:1px solid #eee;">${payload.guest_count}</td></tr>
          <tr><td style="padding:12px;"><b>Hora</b></td><td style="padding:12px;">${new Date(payload.reservation_time).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>
        </table>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.5;">Ubicacion: San Francisco Mazapa, Teotihuacan. Promo sugerida: MAYAHUELVIP.</p>
    </div>
  `;
}

async function sendReservationEmail(payload, table) {
  const transport = getMailer();
  if (!transport) return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  const recipients = Array.from(new Set([
    env.smtp.user,
    payload.customer_email
  ].map((item) => clean(item)).filter(Boolean)));

  await transport.sendMail({
    from: env.smtp.from,
    to: recipients.join(','),
    subject: 'LuxRides Pass - Reserva Mayahuel ' + (table?.table_number || ''),
    html: reservationEmailHtml(payload, table)
  });

  return { ok: true, skipped: false, recipients };
}

router.get('/mayahuel/info', async (req, res, next) => {
  try {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      return res.json({ ok: true, data: fallbackInfo, source: 'fallback' });
    }
    const rows = await supabaseRequest('mayahuel_info?slug=eq.mayahuel&limit=1', { headers: supabaseHeaders() });
    res.json({ ok: true, data: rows?.[0] || fallbackInfo, source: rows?.[0] ? 'supabase' : 'fallback' });
  } catch (error) {
    console.warn('[mayahuel-info]', error.message);
    res.json({ ok: true, data: fallbackInfo, source: 'fallback' });
  }
});

router.get('/mayahuel/tables', async (req, res, next) => {
  try {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      return res.json({ ok: true, data: fallbackTables, source: 'fallback' });
    }
    const rows = await supabaseRequest('mayahuel_tables?select=*&order=pos_y.asc,pos_x.asc', { headers: supabaseHeaders() });
    res.json({ ok: true, data: rows?.length ? rows : fallbackTables, source: rows?.length ? 'supabase' : 'fallback' });
  } catch (error) {
    console.warn('[mayahuel-tables]', error.message);
    res.json({ ok: true, data: fallbackTables, source: 'fallback' });
  }
});

router.post('/mayahuel/reservations',
  body('table_id').optional().isString().isLength({ max: 80 }),
  body('table_number').optional().isString().isLength({ max: 20 }),
  body('customer_name').isString().trim().isLength({ min: 2, max: 100 }),
  body('customer_phone').optional({ checkFalsy: true }).isString().isLength({ max: 24 }),
  body('customer_email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('reservation_time').isISO8601(),
  body('guest_count').isInt({ min: 1, max: 20 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    try {
      const payload = {
        table_id: clean(req.body.table_id) || null,
        customer_name: clean(req.body.customer_name),
        customer_phone: clean(req.body.customer_phone),
        customer_email: clean(req.body.customer_email),
        reservation_time: new Date(req.body.reservation_time).toISOString(),
        guest_count: Number(req.body.guest_count),
        status: 'CONFIRMED'
      };

      let table = null;
      if (env.supabaseUrl && env.supabaseServiceKey) {
        const tablePath = payload.table_id
          ? 'mayahuel_tables?id=eq.' + encodeURIComponent(payload.table_id) + '&limit=1'
          : 'mayahuel_tables?table_number=eq.' + encodeURIComponent(clean(req.body.table_number)) + '&limit=1';
        const rows = await supabaseRequest(tablePath, { headers: supabaseHeaders() });
        table = rows?.[0] || null;

        if (!table) return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });
        if (table.status !== 'AVAILABLE') return res.status(409).json({ ok: false, error: 'Esta mesa no esta disponible' });
        if (payload.guest_count > Number(table.capacity || 0)) return res.status(400).json({ ok: false, error: 'La mesa no tiene capacidad suficiente' });

        payload.table_id = table.id;
        const reservationRows = await supabaseRequest('mayahuel_reservations', {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(payload)
        });
        await supabaseRequest('mayahuel_tables?id=eq.' + encodeURIComponent(table.id), {
          method: 'PATCH',
          headers: supabaseHeaders(true),
          body: JSON.stringify({ status: 'RESERVED' })
        });

        const emailStatus = await sendReservationEmail(payload, table);
        return res.status(201).json({ ok: true, data: reservationRows?.[0] || payload, table: { ...table, status: 'RESERVED' }, email_status: emailStatus });
      }

      table = fallbackTables.find((item) => item.id === payload.table_id || item.table_number === clean(req.body.table_number));
      if (!table) return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });
      if (table.status !== 'AVAILABLE') return res.status(409).json({ ok: false, error: 'Esta mesa no esta disponible' });
      if (payload.guest_count > Number(table.capacity || 0)) return res.status(400).json({ ok: false, error: 'La mesa no tiene capacidad suficiente' });
      const emailStatus = await sendReservationEmail(payload, table);
      res.status(201).json({ ok: true, data: payload, table: { ...table, status: 'RESERVED' }, email_status: emailStatus, source: 'fallback' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

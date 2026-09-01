import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const router = Router();
const MAYAHUEL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TICKETS_ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

function signMayahuelSession(payload) {
  return crypto.createHmac('sha256', env.mayahuel.sessionSecret).update(payload).digest('base64url');
}

function createMayahuelSession() {
  const data = { role: 'mayahuel', exp: Date.now() + MAYAHUEL_SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + signMayahuelSession(payload);
}

function readMayahuelSession(req) {
  const auth = String(req.headers?.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const [payload, signature] = auth.slice(7).trim().split('.');
  if (!payload || !signature) return null;
  const expected = signMayahuelSession(payload);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data?.role === 'mayahuel' && Number(data.exp) > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function requireMayahuelSession(req, res, next) {
  const session = readMayahuelSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Sesion Mayahuel expirada o no autorizada.' });
  req.mayahuelSession = session;
  next();
}

function signTicketsAdminSession(payload) {
  return crypto.createHmac('sha256', env.ticketsAdmin.sessionSecret).update(payload).digest('base64url');
}

function createTicketsAdminSession() {
  const data = { role: 'mayahuel_tickets', exp: Date.now() + TICKETS_ADMIN_SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + signTicketsAdminSession(payload);
}

function readTicketsAdminSession(req) {
  const auth = String(req.headers?.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const [payload, signature] = auth.slice(7).trim().split('.');
  if (!payload || !signature) return null;
  const expected = signTicketsAdminSession(payload);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data?.role === 'mayahuel_tickets' && Number(data.exp) > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function requireTicketsAdminSession(req, res, next) {
  const session = readTicketsAdminSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Sesion de tickets expirada o no autorizada.' });
  req.ticketsAdminSession = session;
  next();
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

router.post('/mayahuel/admin/login', (req, res) => {
  const supplied = Buffer.from(clean(req.body?.password));
  const expected = Buffer.from(env.mayahuel.pass);
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!valid) return res.status(401).json({ ok: false, error: 'Contrasena incorrecta' });
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, sessionToken: createMayahuelSession(), expiresIn: MAYAHUEL_SESSION_TTL_MS });
});

router.get('/mayahuel/admin/dashboard', requireMayahuelSession, async (req, res, next) => {
  try {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      return res.json({ ok: true, tables: fallbackTables, reservations: [], redemptions: [], source: 'fallback' });
    }
    const [tables, reservations] = await Promise.all([
      supabaseRequest('mayahuel_tables?select=*&order=pos_y.asc,pos_x.asc', { headers: supabaseHeaders() }),
      supabaseRequest('mayahuel_reservations?select=*,mayahuel_tables(table_number,zone_name,capacity)&status=eq.CONFIRMED&order=reservation_time.asc', { headers: supabaseHeaders() })
    ]);
    let redemptions = [];
    try {
      redemptions = await supabaseRequest('mayahuel_promo_redemptions?select=*&order=redeemed_at.desc&limit=30', { headers: supabaseHeaders() });
    } catch (error) {
      console.warn('[mayahuel-redemptions]', error.message);
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, tables: tables || [], reservations: reservations || [], redemptions: redemptions || [], source: 'supabase' });
  } catch (error) {
    next(error);
  }
});

router.patch('/mayahuel/admin/tables/:id', requireMayahuelSession,
  body('status').isIn(['AVAILABLE', 'OCCUPIED']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });
    try {
      if (!env.supabaseUrl || !env.supabaseServiceKey) {
        const table = fallbackTables.find((item) => item.id === req.params.id);
        if (!table) return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });
        table.status = req.body.status;
        return res.json({ ok: true, data: table, source: 'fallback' });
      }
      const tableRows = await supabaseRequest('mayahuel_tables?id=eq.' + encodeURIComponent(req.params.id), {
        method: 'PATCH',
        headers: supabaseHeaders(true),
        body: JSON.stringify({ status: req.body.status })
      });
      if (!tableRows?.length) return res.status(404).json({ ok: false, error: 'Mesa no encontrada' });
      if (req.body.status === 'AVAILABLE') {
        await supabaseRequest('mayahuel_reservations?table_id=eq.' + encodeURIComponent(req.params.id) + '&status=eq.CONFIRMED', {
          method: 'PATCH',
          headers: supabaseHeaders(),
          body: JSON.stringify({ status: 'COMPLETED' })
        });
      }
      return res.json({ ok: true, data: tableRows[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/mayahuel/promos/redeem',
  body('code').isString().trim().isLength({ min: 2, max: 50 }),
  body('customer_name').isString().trim().isLength({ min: 2, max: 100 }),
  body('customer_contact').isString().trim().isLength({ min: 5, max: 100 }),
  body('table_number').optional({ checkFalsy: true }).isString().isLength({ max: 20 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    try {
      if (!env.supabaseUrl || !env.supabaseServiceKey) {
        return res.status(503).json({ ok: false, error: 'El canje de tickets no esta disponible en este momento.' });
      }

      const rows = await supabaseRequest('rpc/redeem_mayahuel_promo', {
        method: 'POST',
        headers: supabaseHeaders(),
        body: JSON.stringify({
          p_code: clean(req.body.code),
          p_customer_name: clean(req.body.customer_name),
          p_customer_contact: clean(req.body.customer_contact),
          p_table_number: clean(req.body.table_number) || null
        })
      });

      const result = rows?.[0];
      if (!result?.is_valid) {
        return res.status(400).json({ ok: false, error: result?.message || 'No se pudo validar el ticket.' });
      }
      return res.status(201).json({ ok: true, message: result.message, redemption: result.redemption });
    } catch (error) {
      console.error('[mayahuel-redeem]', error.message);
      return res.status(503).json({ ok: false, error: 'El sistema de tickets no esta disponible en este momento. Intenta mas tarde.' });
    }
  }
);

router.get('/mayahuel/promos/public', async (req, res, next) => {
  try {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      return res.json({ ok: true, data: [], source: 'fallback' });
    }
    const rows = await supabaseRequest('mayahuel_promotions?select=code,venue_name,description,icon,discount_type,discount_value,expiration_date,max_uses,uses_count,is_active&order=is_active.desc,expiration_date.asc', { headers: supabaseHeaders() });
    const now = Date.now();
    const data = (rows || []).map((promo) => {
      const expired = now > new Date(promo.expiration_date).getTime();
      const exhausted = Number(promo.uses_count || 0) >= Number(promo.max_uses || 0);
      const redeemable = Boolean(promo.is_active) && !expired && !exhausted;
      return {
        code: promo.code,
        venue_name: promo.venue_name,
        description: promo.description,
        icon: promo.icon,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        expiration_date: promo.expiration_date,
        redeemable,
        status: redeemable ? 'active' : 'expired'
      };
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data, source: 'supabase' });
  } catch (error) {
    console.warn('[mayahuel-promos-public]', error.message);
    return res.json({ ok: true, data: [], source: 'fallback' });
  }
});

router.post('/mayahuel/tickets-admin/login', (req, res) => {
  const supplied = Buffer.from(clean(req.body?.password));
  const expected = Buffer.from(env.ticketsAdmin.pass);
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!valid) return res.status(401).json({ ok: false, error: 'Contrasena incorrecta' });
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, sessionToken: createTicketsAdminSession(), expiresIn: TICKETS_ADMIN_SESSION_TTL_MS });
});

router.get('/mayahuel/tickets-admin/list', requireTicketsAdminSession, async (req, res, next) => {
  try {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      return res.json({ ok: true, data: [], source: 'fallback' });
    }
    const rows = await supabaseRequest('mayahuel_promotions?select=*&order=created_at.desc', { headers: supabaseHeaders() });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: rows || [], source: 'supabase' });
  } catch (error) {
    next(error);
  }
});

router.post('/mayahuel/tickets-admin/tickets', requireTicketsAdminSession,
  body('code').isString().trim().isLength({ min: 2, max: 50 }),
  body('venue_name').isString().trim().isLength({ min: 2, max: 100 }),
  body('description').isString().trim().isLength({ min: 2, max: 200 }),
  body('icon').isString().trim().isLength({ min: 1, max: 10 }),
  body('discount_type').isIn(['PERCENTAGE', 'FIXED_AMOUNT']),
  body('discount_value').isFloat({ min: 0 }),
  body('max_uses').isInt({ min: 1, max: 100000 }),
  body('expiration_date').isISO8601(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    try {
      if (!env.supabaseUrl || !env.supabaseServiceKey) {
        return res.status(503).json({ ok: false, error: 'La creacion de tickets no esta disponible en este momento.' });
      }
      const payload = {
        code: clean(req.body.code).toUpperCase(),
        title: clean(req.body.description),
        venue_name: clean(req.body.venue_name),
        description: clean(req.body.description),
        icon: clean(req.body.icon),
        discount_type: clean(req.body.discount_type),
        discount_value: Number(req.body.discount_value),
        applicable_to: 'MAYAHUEL_ONLY',
        borne_by: 'MAYAHUEL',
        max_uses: Number(req.body.max_uses),
        expiration_date: new Date(req.body.expiration_date).toISOString(),
        is_active: true
      };
      const rows = await supabaseRequest('mayahuel_promotions', {
        method: 'POST',
        headers: supabaseHeaders(true),
        body: JSON.stringify(payload)
      });
      return res.status(201).json({ ok: true, data: rows?.[0] || payload });
    } catch (error) {
      if (error.status === 409 || /duplicate/i.test(String(error.message || ''))) {
        return res.status(409).json({ ok: false, error: 'Ya existe un ticket con ese codigo.' });
      }
      console.error('[mayahuel-tickets-create]', error.message);
      return res.status(503).json({ ok: false, error: 'No se pudo crear el ticket. Verifica que la migracion de tickets este aplicada.' });
    }
  }
);

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

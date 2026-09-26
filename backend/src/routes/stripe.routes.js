import { Router } from 'express';
import Stripe from 'stripe';
import { body, validationResult } from 'express-validator';
import { env } from '../config/env.js';
import { buildReservationQuote, decodeQuoteToken } from '../services/quote.service.js';

const router = Router();

function getStripeClient() {
  if (!env.stripeSecretKey) return null;
  return new Stripe(env.stripeSecretKey);
}

function normalizeAmount(monto) {
  const amount = Number(monto);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(env.supabaseUrl + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: env.supabaseServiceKey,
      Authorization: 'Bearer ' + env.supabaseServiceKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || 'Error de Supabase');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function getCustomerFromRequest(req) {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const response = await fetch(env.supabaseUrl + '/auth/v1/user', {
    headers: { apikey: env.supabaseServiceKey, Authorization: 'Bearer ' + token }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id && user?.email ? user : null;
}

router.post('/stripe/quote-reservation', async (req, res, next) => {
  try {
    const user = await getCustomerFromRequest(req);
    const reservationId = String(req.body?.reservationId || '').trim();
    if (!user || !reservationId) return res.status(401).json({ ok: false, error: 'Inicia sesión para pagar esta reserva.' });

    const reservations = await supabaseRequest(
      'reservas?reserva_id=eq.' + encodeURIComponent(reservationId) + '&email_cliente=eq.' + encodeURIComponent(user.email) + '&select=reserva_id,total,estado,payment_status&limit=1'
    );
    const reservation = reservations?.[0];
    if (!reservation) return res.status(404).json({ ok: false, error: 'No encontramos una reserva tuya con ese folio.' });
    if (String(reservation.payment_status || '').toLowerCase() === 'paid' || ['pagado', 'paid'].includes(String(reservation.estado || '').toLowerCase())) {
      return res.status(409).json({ ok: false, error: 'Esta reserva ya aparece como pagada.' });
    }

    const quoteOut = buildReservationQuote({ reservationId, userId: user.id, amountMx: reservation.total });
    return res.json({ ok: true, ...quoteOut });
  } catch (error) {
    next(error);
  }
});

// Webhook: raw body ya configurado en server.js antes de este router
router.post('/stripe/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = env.stripeWebhookSecret;
  if (!secret) return res.status(503).json({ error: 'Webhook secret no configurado' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe no configurado' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.warn('[stripe/webhook] firma inválida:', err.message);
    return res.status(400).send('Webhook signature inválida');
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    console.log('[stripe/webhook] pago confirmado:', pi.id, 'monto:', pi.amount);
    // TODO: marcar reserva como pagada en Supabase usando pi.metadata
  }

  res.json({ received: true });
});

// Pago con validación de inputs
router.post('/stripe/pagar',
  body('quoteToken').isString().notEmpty().withMessage('quoteToken requerido'),
  body('paymentMethodId').isString().notEmpty().withMessage('paymentMethodId requerido'),
  body('nombre').optional().isString().isLength({ max: 120 }),
  body('email').optional().isEmail().normalizeEmail(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    try {
      const stripe = getStripeClient();
      if (!stripe) return res.status(503).json({ ok: false, error: 'Stripe no configurado en backend.' });

      const paymentMethodId = String(req.body.paymentMethodId).trim();
      const quoteToken = String(req.body.quoteToken).trim();
      const nombre = String(req.body?.nombre || '').trim();
      const email = String(req.body?.email || '').trim();

      const quote = decodeQuoteToken(quoteToken);
      if (quote.type === 'reservation') {
        const user = await getCustomerFromRequest(req);
        if (!user || String(user.id) !== String(quote.userId)) {
          return res.status(401).json({ ok: false, error: 'Inicia sesión con la cuenta que hizo la reserva.' });
        }
        const currentRows = await supabaseRequest(
          'reservas?reserva_id=eq.' + encodeURIComponent(quote.reservationId) + '&email_cliente=eq.' + encodeURIComponent(user.email) + '&select=payment_status,estado&limit=1'
        );
        if (!currentRows?.[0]) return res.status(404).json({ ok: false, error: 'La reserva ya no está disponible para esta cuenta.' });
        if (String(currentRows[0].payment_status || '').toLowerCase() === 'paid' || ['pagado', 'paid'].includes(String(currentRows[0].estado || '').toLowerCase())) {
          return res.status(409).json({ ok: false, error: 'Esta reserva ya está pagada.' });
        }
      }
      const amount = normalizeAmount(quote.amountMx);
      if (!amount) return res.status(400).json({ ok: false, error: 'Monto inválido en cotización.' });

      const descripcion = String(req.body?.descripcion || (quote.type === 'tour'
        ? ('LuxRides tour: ' + (quote.tourId || 'tour'))
        : 'LuxRides transfer')).trim().slice(0, 200);

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'mxn',
        payment_method: paymentMethodId,
        confirmation_method: 'manual',
        confirm: true,
        description: descripcion,
        receipt_email: email || undefined,
        payment_method_types: ['card'],
        metadata: {
          nombre: nombre || 'Cliente LuxRides',
          source: 'luxrides-web',
          quote_type: quote.type || '',
          reservation_id: quote.reservationId || '',
          quote_tour_id: quote.tourId || '',
          quote_tarifa: quote.tarifaLabel || ''
        }
      });

      if (paymentIntent.status === 'succeeded') {
        if (quote.type === 'reservation' && quote.reservationId) {
          try {
            await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(quote.reservationId), {
              method: 'PATCH',
              body: JSON.stringify({
                payment_status: 'paid',
                stripe_payment_intent_id: paymentIntent.id,
                metodo_pago: 'tarjeta',
                payment_method: 'tarjeta'
              })
            });
          } catch (updateError) {
            console.error('[stripe] pago aceptado pero no se pudo actualizar la reserva:', updateError.message);
          }
        }
        return res.json({ ok: true, status: paymentIntent.status, paymentIntentId: paymentIntent.id });
      }

      if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
        return res.json({
          ok: false, requiresAction: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status
        });
      }

      return res.status(402).json({
        ok: false, error: 'Pago no completado. Estado: ' + paymentIntent.status,
        status: paymentIntent.status, paymentIntentId: paymentIntent.id
      });
    } catch (error) {
      if (error?.type && error?.message) {
        return res.status(error.statusCode || 400).json({ ok: false, error: error.message });
      }
      next(error);
    }
  }
);

router.post('/stripe/confirm-reservation', async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) return res.status(503).json({ ok: false, error: 'Stripe no configurado en backend.' });
    const quote = decodeQuoteToken(String(req.body?.quoteToken || '').trim());
    const paymentIntentId = String(req.body?.paymentIntentId || '').trim();
    if (quote.type !== 'reservation' || !quote.reservationId || !paymentIntentId) {
      return res.status(400).json({ ok: false, error: 'Datos de confirmación de reserva inválidos.' });
    }
    const user = await getCustomerFromRequest(req);
    if (!user || String(user.id) !== String(quote.userId)) {
      return res.status(401).json({ ok: false, error: 'Inicia sesión con la cuenta que hizo la reserva.' });
    }

    let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.metadata?.reservation_id !== quote.reservationId) {
      return res.status(409).json({ ok: false, error: 'El pago no corresponde a esta reserva.' });
    }
    if (paymentIntent.status === 'requires_confirmation') {
      paymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id);
    }
    if (paymentIntent.status !== 'succeeded') {
      return res.status(409).json({ ok: false, error: 'Stripe todavía no confirma el pago de esta reserva.' });
    }

    await supabaseRequest('reservas?reserva_id=eq.' + encodeURIComponent(quote.reservationId), {
      method: 'PATCH',
      body: JSON.stringify({
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent.id,
        metodo_pago: 'tarjeta',
        payment_method: 'tarjeta'
      })
    });
    return res.json({ ok: true, payment_status: 'paid' });
  } catch (error) {
    next(error);
  }
});

export default router;

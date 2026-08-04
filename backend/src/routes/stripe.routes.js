import { Router } from 'express';
import Stripe from 'stripe';
import { body, validationResult } from 'express-validator';
import { env } from '../config/env.js';
import { decodeQuoteToken } from '../services/quote.service.js';

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
          quote_tour_id: quote.tourId || '',
          quote_tarifa: quote.tarifaLabel || ''
        }
      });

      if (paymentIntent.status === 'succeeded') {
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

export default router;

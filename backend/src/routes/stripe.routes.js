import { Router } from 'express';
import Stripe from 'stripe';
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

router.post('/stripe/pagar', async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).json({ ok: false, error: 'Stripe no configurado en backend.' });
    }

    const paymentMethodId = String(req.body?.paymentMethodId || '').trim();
    const quoteToken = String(req.body?.quoteToken || '').trim();
    const nombre = String(req.body?.nombre || '').trim();
    const email = String(req.body?.email || '').trim();
    if (!quoteToken) {
      return res.status(400).json({ ok: false, error: 'quoteToken es requerido.' });
    }

    const quote = decodeQuoteToken(quoteToken);
    const amount = normalizeAmount(quote.amountMx);
    const descripcion = String(req.body?.descripcion || (quote.type === 'tour'
      ? ('LuxRides tour: ' + (quote.tourId || 'tour'))
      : 'LuxRides transfer')).trim();

    if (!paymentMethodId) {
      return res.status(400).json({ ok: false, error: 'paymentMethodId es requerido.' });
    }
    if (!amount) {
      return res.status(400).json({ ok: false, error: 'Monto invalido.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'mxn',
      payment_method: paymentMethodId,
      confirmation_method: 'manual',
      confirm: true,
      description,
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
        ok: false,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });
    }

    return res.status(402).json({
      ok: false,
      error: 'Pago no completado. Estado: ' + paymentIntent.status,
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    if (error?.type && error?.message) {
      return res.status(error.statusCode || 400).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

export default router;

import { Router } from 'express';
import Stripe from 'stripe';
import { env } from '../config/env.js';

const router = Router();

router.post('/stripe/pagar', async (req, res, next) => {
  try {
    const { paymentMethodId, monto, nombre, email, descripcion } = req.body || {};

    if (!paymentMethodId || !monto) {
      return res.status(400).json({ ok: false, error: 'paymentMethodId y monto son requeridos' });
    }
    if (!env.stripeSecretKey) {
      return res.status(503).json({ ok: false, error: 'Stripe no configurado en servidor' });
    }

    const stripe = new Stripe(env.stripeSecretKey, { apiVersion: '2024-06-20' });

    // Monto en centavos (Stripe usa centavos)
    const montoEnCentavos = Math.round(Number(monto) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: montoEnCentavos,
      currency: 'mxn',
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: descripcion || 'Reserva LuxRides',
      receipt_email: email || undefined,
      metadata: {
        cliente: nombre || '',
        email: email || '',
        plataforma: 'luxrides.online'
      }
    });

    if (paymentIntent.status === 'succeeded') {
      return res.json({ ok: true, paymentIntentId: paymentIntent.id, status: 'succeeded' });
    }

    // Requiere acción adicional (3D Secure, etc.)
    if (paymentIntent.status === 'requires_action') {
      return res.json({
        ok: false,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        error: 'Se requiere verificación adicional (3D Secure)'
      });
    }

    res.status(400).json({ ok: false, error: 'Pago no completado: ' + paymentIntent.status });
  } catch (err) {
    console.error('[Stripe]', err.message);
    // Errores específicos de Stripe
    if (err.type === 'StripeCardError') {
      return res.status(402).json({ ok: false, error: err.message });
    }
    next(err);
  }
});

export default router;

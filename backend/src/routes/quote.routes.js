import { Router } from 'express';
import { env } from '../config/env.js';
import { buildDiscountedTransferQuote, buildTourQuote, buildTransferQuote, decodeQuoteToken } from '../services/quote.service.js';

const router = Router();

router.post('/quotes/transfer', (req, res, next) => {
  try {
    const out = buildTransferQuote(req.body || {});
    res.json({ ok: true, ...out });
  } catch (error) {
    next(error);
  }
});

router.post('/quotes/transfer/discount', async (req, res, next) => {
  try {
    const baseQuote = decodeQuoteToken(String(req.body?.quoteToken || '').trim());
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (baseQuote.type !== 'transfer' || baseQuote.discountCode || !code) {
      return res.status(400).json({ ok: false, error: 'Cotización o código de descuento inválido.' });
    }
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      return res.status(503).json({ ok: false, error: 'La validación de descuentos no está disponible.' });
    }
    const response = await fetch(env.supabaseUrl + '/rest/v1/rpc/validate_luxrides_ride_promo', {
      method: 'POST',
      headers: {
        apikey: env.supabaseServiceKey,
        Authorization: 'Bearer ' + env.supabaseServiceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_code: code,
        p_passengers: Number(baseQuote.passengers),
        p_amount: Number(baseQuote.amountMx)
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || 'No se pudo validar el descuento.');
      error.status = response.status;
      throw error;
    }
    const validation = data?.[0];
    if (!validation?.is_valid) {
      return res.status(400).json({ ok: false, error: validation?.message || 'No se pudo validar el descuento.' });
    }
    const out = buildDiscountedTransferQuote(baseQuote, {
      code: validation.promo_code,
      discountAmount: validation.discount_amount,
      discountedTotal: validation.discounted_total
    });
    return res.json({ ok: true, ...out });
  } catch (error) {
    next(error);
  }
});

router.post('/quotes/tour', (req, res, next) => {
  try {
    const out = buildTourQuote(req.body || {});
    res.json({ ok: true, ...out });
  } catch (error) {
    next(error);
  }
});

export default router;

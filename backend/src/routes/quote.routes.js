import { Router } from 'express';
import { buildTourQuote, buildTransferQuote } from '../services/quote.service.js';

const router = Router();

router.post('/quotes/transfer', (req, res, next) => {
  try {
    const out = buildTransferQuote(req.body || {});
    res.json({ ok: true, ...out });
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

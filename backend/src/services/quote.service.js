import crypto from 'node:crypto';
import { env } from '../config/env.js';

const TOUR_PRICING = {
  'teotihuacan-basilica': {
    '1-3 personas': { amountMx: 4000, note: 'Tarifa base privada' },
    '4-7 personas': { amountMx: 1600, note: 'Tarifa grupo' },
    'Grupo compartido': { amountMx: 1350, note: 'Por persona' }
  },
  'globo-teotihuacan': {
    '1-3 personas': { amountMx: 3000, note: 'Reserva compartida' },
    '4-7 personas': { amountMx: 4000, note: 'Bloque grupal' },
    'Individual': { amountMx: 2400, note: 'Por persona' }
  },
  'xochimilco-coyoacan-frida': {
    '1-3 personas': { amountMx: 4400, note: 'Servicio personalizado' },
    '4-7 personas': { amountMx: 1700, note: 'Servicio personalizado' },
    'Grupo compartido': { amountMx: 1150, note: 'Por persona' }
  },
  'taxco-cuernavaca': {
    '1-3 personas': { amountMx: 8000, note: 'Tarifa privada' },
    '4-7 personas': { amountMx: 12000, note: 'Grupo completo' }
  },
  'puebla-cholula': {
    '1-3 personas': { amountMx: 7000, note: 'Tarifa privada' },
    '4-7 personas': { amountMx: 11000, note: 'Grupo completo' }
  },
  'san-miguel': {
    '1-3 personas': { amountMx: 9000, note: 'Tarifa privada' },
    '4-7 personas': { amountMx: 12000, note: 'Grupo completo' }
  },
  'city-tour-cdmx': {
    '3 horas': { amountMx: 2100, note: 'Minimo 3 horas' },
    '4 horas': { amountMx: 2800, note: '$700 MXN por hora' },
    '5 horas': { amountMx: 3500, note: 'Tarifa extendida' }
  },
  'mariposa-valle': {
    '1-3 personas': { amountMx: 9000, note: 'Tarifa privada' },
    '4-7 personas': { amountMx: 12500, note: 'Grupo completo' }
  },
  'avandaro-refugio': {
    '1-3 personas': { amountMx: 7000, note: 'Tarifa privada' },
    '4-7 personas': { amountMx: 9500, note: 'Grupo completo' }
  }
};

function quoteSecret() {
  return env.quoteSecret || env.stripeSecretKey || env.admin.pass;
}

function signPayload(payload) {
  return crypto.createHmac('sha256', quoteSecret()).update(payload).digest('base64url');
}

function encodeQuote(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = signPayload(payload);
  return payload + '.' + sig;
}

export function decodeQuoteToken(token) {
  const raw = String(token || '');
  const parts = raw.split('.');
  if (parts.length !== 2) throw new Error('quoteToken invalido');
  const [payload, sig] = parts;
  const expected = signPayload(payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('Firma de quote invalida');
  }
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data || !data.expiresAt || Date.now() > Number(data.expiresAt)) {
    throw new Error('Quote expirada');
  }
  return data;
}

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function applyDistanceRules(distanceKm, originText, destinationText) {
  let km = Number(distanceKm) || 0;
  const origin = normalizeText(originText);
  const destination = normalizeText(destinationText);
  const isCaminoRealPolanco = (text) => text.includes('camino real polanco');
  const isTerminalCdmx = (text) => /terminal\s*(1|2|uno|dos)|\bt1\b|\bt2\b|\baicm\b|\baeropuerto\b/.test(text) && (text.includes('cdmx') || text.includes('ciudad de mexico') || text.includes('aicm'));
  const isTerminal1Cdmx = (text) => /terminal\s*(1|uno)|\bt1\b/.test(text) && (text.includes('cdmx') || text.includes('ciudad de mexico') || text.includes('aicm'));
  const isTerminal2Cdmx = (text) => /terminal\s*(2|dos)|\bt2\b/.test(text) && (text.includes('cdmx') || text.includes('ciudad de mexico') || text.includes('aicm'));
  const isCdmx = (text) => text.includes('cdmx') || text.includes('ciudad de mexico');

  if ((isCaminoRealPolanco(origin) && isTerminal1Cdmx(destination)) || (isCaminoRealPolanco(destination) && isTerminal1Cdmx(origin))) {
    km = Math.max(km, 15);
  } else if ((isCaminoRealPolanco(origin) && isTerminal2Cdmx(destination)) || (isCaminoRealPolanco(destination) && isTerminal2Cdmx(origin))) {
    km = Math.max(km, 18);
  } else if ((isCaminoRealPolanco(origin) && isTerminalCdmx(destination)) || (isCaminoRealPolanco(destination) && isTerminalCdmx(origin))) {
    km = Math.max(km, 15);
  } else if ((isCaminoRealPolanco(origin) && isCdmx(destination)) || (isCaminoRealPolanco(destination) && isCdmx(origin))) {
    km = Math.max(km, 12);
  }

  return Number(km.toFixed(1));
}

function calcCasetas(distanceKm, transferType) {
  if (transferType === 'P' || transferType === 'D') return 0;
  if (distanceKm > 100) return 500;
  if (distanceKm > 50) return 360;
  if (distanceKm > 20) return 240;
  return 0;
}

function calcTransferTotal(service, distanceKm, tolls, passengers, hours, transferType) {
  const isSuv = Number(passengers) > 3;
  if (transferType === 'P') return isSuv ? 2900 : 1900;
  if (transferType === 'D') return isSuv ? 3800 : 2550;
  if (service === 'I') {
    const base = isSuv ? 320 : 240;
    const perKm = isSuv ? 45 : 30;
    return Math.round(base + Math.max(0, distanceKm - 4) * perKm + tolls);
  }
  if (Number(hours) >= 10) return isSuv ? 7000 : 4800;
  const hourlyRate = isSuv ? 760 : 550;
  return Math.round(hourlyRate * Number(hours || 0));
}

export function buildTransferQuote(input) {
  const service = String(input?.service || 'I');
  const transferType = String(input?.transferType || 'N');
  const passengers = Number(input?.passengers || 1);
  const hours = Number(input?.hours || 0);
  const origin = input?.origin || null;
  const destination = input?.destination || null;
  const originText = String(input?.originText || '');
  const destinationText = String(input?.destinationText || '');

  if (service === 'I' && transferType !== 'P' && transferType !== 'D') {
    if (!origin || !destination) throw new Error('Origen y destino son requeridos');
  }

  let distanceKm = 0;
  let durationMin = 0;
  if (service === 'I' && transferType !== 'P' && transferType !== 'D' && origin && destination) {
    distanceKm = calcDistanceKm(Number(origin.lat), Number(origin.lng), Number(destination.lat), Number(destination.lng));
    distanceKm = applyDistanceRules(distanceKm * 1.35, originText, destinationText);
    durationMin = Math.max(1, Math.round(distanceKm / 0.7));
  }

  const tolls = calcCasetas(distanceKm, transferType);
  let total = calcTransferTotal(service, distanceKm, tolls, passengers, hours, transferType);

  const near = (coord, lat, lng) => coord && Math.abs(Number(coord.lat) - lat) < 0.01 && Math.abs(Number(coord.lng) - lng) < 0.01;
  const isPalacio = (coord) => near(coord, 19.4177, -99.1627);
  const isCamino = (coord) => near(coord, 19.4279, -99.1794);
  if (service === 'I' && transferType !== 'P' && transferType !== 'D' && ((isPalacio(origin) && isCamino(destination)) || (isCamino(origin) && isPalacio(destination)))) {
    total = 300;
  }
  const isT1 = (text) => /terminal\s*(1|uno)|\bt1\b/.test(normalizeText(text));
  if (service === 'I' && transferType !== 'P' && transferType !== 'D' && (isT1(originText) || isT1(destinationText))) {
    total = Math.max(total, passengers > 3 ? 760 : 560);
  }

  const quote = {
    type: 'transfer',
    amountMx: total,
    passengers,
    service,
    transferType,
    hours,
    distanceKm: Number(distanceKm.toFixed(1)),
    durationMin,
    tolls,
    originText,
    destinationText,
    expiresAt: Date.now() + (15 * 60 * 1000)
  };

  return { quote, token: encodeQuote(quote) };
}

export function buildTourQuote(input) {
  const tourId = String(input?.tourId || '').trim();
  const tarifaLabel = String(input?.tarifaLabel || '').trim();
  const routeChoice = String(input?.routeChoice || '').trim();
  const pricing = TOUR_PRICING[tourId];
  if (!pricing) throw new Error('Tour no soportado');
  const option = pricing[tarifaLabel];
  if (!option) throw new Error('Tarifa no soportada');

  const quote = {
    type: 'tour',
    tourId,
    tarifaLabel,
    routeChoice,
    amountMx: option.amountMx,
    note: option.note,
    expiresAt: Date.now() + (15 * 60 * 1000)
  };

  return { quote, token: encodeQuote(quote) };
}

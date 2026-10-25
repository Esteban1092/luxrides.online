import { env } from '../config/env.js';
import { enviarPush } from './push.service.js';

const TZ = 'America/Mexico_City';
const ARRIVING_KM = 5;
const ARRIVED_KM = 0.2;
const TRACK_MAX_KM = 30;
const TRACK_COOLDOWN_S = 180;
const EVAL_GAP_MS = 10_000;
const ROUTE_GAP_MS = 20_000;
const CONTEXT_TTL_MS = 90_000;
const SUBSCRIPTION_TTL_MS = 60_000;
const MAX_SENDS_PER_TICK = 25;
const ACTIVE_TRIP = /^(aceptado|asignado|en[ _]camino)$/i;
const CLOSED_RESERVA = /cancel|rechaz|complet|finaliz|no[ _]?show/i;
const ICON = '/icon-192.png';
const BADGE = '/badge-96.png';

const warned = new Set();
const driverState = new Map();
const subscriptionCache = new Map();
let ticking = false;

function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[notify] ' + message);
}

function enabled() {
  return env.notifications.enabled && Boolean(env.supabaseUrl) && Boolean(env.supabaseServiceKey);
}

async function sb(path, options = {}) {
  const res = await fetch(env.supabaseUrl + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: env.supabaseServiceKey,
      Authorization: 'Bearer ' + env.supabaseServiceKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.message || data?.error || 'Error de Supabase');
    error.status = res.status;
    throw error;
  }
  return data;
}

// --- geografia ---------------------------------------------------------

export function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parsePosition(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

async function getRoute(from, to) {
  const url = `${env.notifications.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=polyline`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'LuxRides/1.0 (+https://luxrides.online)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    return { km: route.distance / 1000, minutes: Math.max(1, Math.round(route.duration / 60)), polyline: route.geometry || '', estimated: false };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function estimateRoute(straightKm) {
  const km = straightKm * 1.35;
  return { km, minutes: Math.max(1, Math.round((km / 28) * 60)), polyline: '', estimated: true };
}

function mapImageUrl(from, to, polyline) {
  const key = env.notifications.staticMapsKey;
  if (!key) return '';
  const marker = (style, p) => '&markers=' + encodeURIComponent(`${style}|${p.lat},${p.lng}`);
  const base = 'https://maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2&maptype=roadmap&key=' + encodeURIComponent(key)
    + marker('color:0x1c1c1c|label:A', from) + marker('color:0xD4AF37|label:B', to);
  if (!polyline) return base;
  const withRoute = base + '&path=' + encodeURIComponent('weight:5|color:0x1c1c1cff|enc:' + polyline);
  return withRoute.length <= 1800 ? withRoute : base;
}

// --- fechas (la hora de recogida viene como texto libre) ---------------

function parseDay(text) {
  const raw = String(text || '').trim();
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) };
  return null;
}

function parseClock(text) {
  const raw = String(text || '').trim();
  let m = raw.match(/(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*([ap])\.?\s*m\b\.?/i);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'p') h += 12;
    return { h, min: Number(m[2] || 0) };
  }
  m = raw.match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return { h: Number(m[1]), min: Number(m[2]) };
  return null;
}

function wallMinutes(p) {
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 60000;
}

function nowWall() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

export function pickupInfo(reserva, now = nowWall()) {
  const day = parseDay(reserva?.fecha);
  const clock = parseClock(reserva?.hora_recogida);
  if (!day || !clock) return null;
  const pickup = { ...day, ...clock };
  return {
    minutesUntil: wallMinutes(pickup) - wallMinutes(now),
    isToday: day.y === now.y && day.m === now.m && day.d === now.d,
    nowHour: now.h
  };
}

function minutesSinceCreated(reserva) {
  const created = Date.parse(reserva?.timestamp || reserva?.created_at || '');
  return Number.isFinite(created) ? (Date.now() - created) / 60000 : Infinity;
}

// --- textos (varian por viaje para no sentirse repetitivos) ------------

function hash(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function pick(list, seed) {
  return list[hash(seed) % list.length];
}

function shortPlace(text) {
  const first = String(text || '').split(',')[0].trim();
  return first.length > 38 ? first.slice(0, 37).trim() + '…' : first;
}

function firstName(text) {
  const name = String(text || '').trim().split(/\s+/)[0] || '';
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : '';
}

function copyContext(reserva, chofer, route) {
  const pick1 = (...values) => values.find((v) => String(v || '').trim()) || '';
  const vehicle = [
    pick1(reserva?.chofer_marca, chofer?.vehiculo_marca, chofer?.marca),
    pick1(reserva?.chofer_modelo, chofer?.vehiculo_modelo, chofer?.modelo),
    pick1(reserva?.chofer_color, chofer?.vehiculo_color, chofer?.color)
  ].filter(Boolean).join(' ');
  const plate = String(pick1(reserva?.chofer_placa, chofer?.placa)).trim();
  const vehicleText = [vehicle, plate].filter(Boolean).join(' · ');
  const origin = shortPlace(reserva?.origen) || 'tu punto de recogida';
  const dest = shortPlace(reserva?.destino) || 'tu destino';
  return {
    driver: firstName(pick1(reserva?.chofer_nombre, chofer?.nombre)) || 'Tu chofer',
    tail: vehicleText ? ' ' + vehicleText + '.' : '',
    vehicleText,
    origin,
    dest,
    route: origin + ' → ' + dest,
    time: String(reserva?.hora_recogida || '').trim() || 'la hora acordada',
    eta: route ? route.minutes : 0,
    kmText: route ? route.km.toFixed(1) : ''
  };
}

const COPY = {
  driver_assigned: [
    (c) => ({ title: `${c.driver} será tu chofer`, body: `Ya está asignado a tu viaje.${c.tail} Te avisaremos cuando esté cerca.` }),
    (c) => ({ title: 'Tu chofer ya está asignado', body: `${c.driver} te llevará.${c.tail} Nosotros te avisamos cuando se acerque.` })
  ],
  trip_today: [
    (c) => ({ title: 'Hoy es tu viaje con LuxRides', body: `${c.route} a las ${c.time}. Tu chofer estará puntual.` }),
    (c) => ({ title: 'Tu viaje es hoy', body: `Te recogemos a las ${c.time} en ${c.origin}. Destino: ${c.dest}.` }),
    (c) => ({ title: 'Hoy viajas con LuxRides', body: `${c.time} · ${c.route}. Todo listo de nuestra parte.` })
  ],
  trip_soon: [
    (c) => ({ title: 'Tu viaje sale en menos de una hora', body: `Recogida a las ${c.time} en ${c.origin}. Ten tu equipaje listo.` }),
    (c) => ({ title: 'Falta poco para tu viaje', body: `${c.time} · ${c.route}. Te avisaremos cuando tu chofer esté cerca.` })
  ],
  driver_arriving: [
    (c) => ({ title: `${c.driver} está a punto de llegar`, body: `Prepárate, disfruta tu viaje. Llega en ${c.eta} min.${c.tail}` }),
    (c) => ({ title: 'Tu chofer ya casi llega', body: `${c.driver} está a ${c.kmText} km. Prepárate y disfruta tu viaje.${c.tail}` }),
    (c) => ({ title: `Prepárate, ${c.driver} está por llegar`, body: `Tu LuxRides llega en ${c.eta} min. ¡Disfruta tu viaje!${c.tail}` })
  ],
  driver_arrived: [
    (c) => ({ title: `${c.driver} ya llegó`, body: `Te espera en ${c.origin}.${c.tail}` }),
    (c) => ({ title: 'Tu chofer está aquí', body: `${c.driver} llegó al punto de recogida.${c.tail}` })
  ]
};

function payloadFor(reservaId, content, options = {}) {
  return {
    title: content.title,
    body: content.body,
    tag: 'luxrides-trip-' + reservaId,
    url: '/',
    icon: ICON,
    badge: BADGE,
    silent: Boolean(options.silent),
    renotify: !options.silent,
    requireInteraction: true,
    ...(options.image ? { image: options.image } : {})
  };
}

// --- suscripciones y anti-spam -----------------------------------------

async function getSubscription(email) {
  const cached = subscriptionCache.get(email);
  if (cached && Date.now() - cached.at < SUBSCRIPTION_TTL_MS) return cached.value;
  let value = null;
  try {
    const rows = await sb('customer_push_subscriptions?email=eq.' + encodeURIComponent(email) + '&select=user_id,subscription&limit=1');
    value = rows?.[0] || null;
  } catch (error) {
    warnOnce('subscription', 'no se pudo leer customer_push_subscriptions (¿falta el SQL?): ' + error.message);
    return null;
  }
  subscriptionCache.set(email, { at: Date.now(), value });
  return value;
}

async function dropSubscription(userId) {
  subscriptionCache.clear();
  try {
    await sb('customer_push_subscriptions?user_id=eq.' + encodeURIComponent(userId), { method: 'DELETE' });
  } catch (error) {
    warnOnce('drop-subscription', 'no se pudo borrar la suscripción vencida: ' + error.message);
  }
}

// true = reclamado, false = ya enviado/en enfriamiento, null = no se pudo verificar (no enviar)
async function claim(reservaId, userId, kind, cooldownSeconds, meta) {
  try {
    const result = await sb('rpc/claim_customer_notification', {
      method: 'POST',
      body: JSON.stringify({ p_reserva_id: reservaId, p_user_id: userId || null, p_kind: kind, p_cooldown_seconds: cooldownSeconds, p_meta: meta || {} })
    });
    return result === true;
  } catch (error) {
    warnOnce('claim', 'no se pudo reclamar el aviso (¿falta el SQL?): ' + error.message);
    return null;
  }
}

// 'sent' | 'dup' | 'nosub' | 'error'
async function deliver({ reserva, kind, cooldown = null, meta = {}, build }) {
  const email = String(reserva?.email_cliente || '').trim().toLowerCase();
  if (!email || !reserva?.reserva_id) return 'nosub';
  const subscription = await getSubscription(email);
  if (!subscription) return 'nosub';
  const claimed = await claim(reserva.reserva_id, subscription.user_id, kind, cooldown, meta);
  if (claimed === null) return 'error';
  if (!claimed) return 'dup';
  try {
    await enviarPush(subscription.subscription, await build());
    return 'sent';
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) await dropSubscription(subscription.user_id);
    else console.warn('[notify] push no enviado (' + kind + '):', error?.message || error);
    return 'error';
  }
}

// --- avisos por GPS del chofer -----------------------------------------

async function loadTripContext(state, viajeId) {
  const now = Date.now();
  if (state.contextAt && now - state.contextAt < CONTEXT_TTL_MS) return state.context;
  state.contextAt = now;
  state.context = null;
  const viaje = (await sb('viajes?id=eq.' + encodeURIComponent(viajeId) + '&select=*&limit=1'))?.[0];
  if (!viaje || !viaje.reserva_id || !ACTIVE_TRIP.test(String(viaje.estado || ''))) return null;
  const pickup = parsePosition({ lat: viaje.origen_lat, lng: viaje.origen_lng });
  if (!pickup) return null;
  const reserva = (await sb('reservas?reserva_id=eq.' + encodeURIComponent(viaje.reserva_id) + '&select=*&limit=1'))?.[0];
  if (!reserva?.email_cliente) return null;
  state.context = { reserva, pickup };
  return state.context;
}

async function evaluateDriverMove(chofer) {
  const choferId = String(chofer?.id || '');
  const viajeId = chofer?.viaje_actual ? String(chofer.viaje_actual) : '';
  const position = parsePosition(chofer?.ubicacion);
  if (!choferId || !viajeId || !position) return;

  let state = driverState.get(choferId);
  if (!state || state.viajeId !== viajeId) {
    state = { viajeId, done: new Set(), minKm: Infinity };
    driverState.set(choferId, state);
  }
  const now = Date.now();
  if (state.busy || now - (state.lastEval || 0) < EVAL_GAP_MS) return;
  state.lastEval = now;
  state.busy = true;
  try {
    if (state.done.has('arrived')) return;
    const context = await loadTripContext(state, viajeId);
    if (!context) return;
    const { reserva, pickup } = context;
    const km = haversineKm(position, pickup);
    if (km > TRACK_MAX_KM) return;

    const picked = state.minKm <= 0.5 && km - state.minKm > 0.4;
    state.minKm = Math.min(state.minKm, km);

    if (km <= ARRIVED_KM) {
      const outcome = await deliver({
        reserva,
        kind: 'driver_arrived',
        build: () => payloadFor(reserva.reserva_id, pick(COPY.driver_arrived, reserva.reserva_id)(copyContext(reserva, chofer)))
      });
      if (outcome === 'sent' || outcome === 'dup') state.done.add('arrived');
      return;
    }

    if (picked) {
      // El chofer ya se alejó del punto de recogida: el cliente va a bordo, se cierra el seguimiento sin avisar.
      const closed = await claim(reserva.reserva_id, null, 'driver_arrived', null, { closed: 'left_pickup' });
      if (closed !== null) state.done.add('arrived');
      return;
    }

    if (now - (state.lastRouteAt || 0) >= ROUTE_GAP_MS) {
      state.lastRouteAt = now;
      state.route = await getRoute(position, pickup);
    }
    const route = state.route || estimateRoute(km);

    if (!state.done.has('arriving') && km <= ARRIVING_KM && route.km <= ARRIVING_KM) {
      const outcome = await deliver({
        reserva,
        kind: 'driver_arriving',
        build: () => payloadFor(reserva.reserva_id, pick(COPY.driver_arriving, reserva.reserva_id)(copyContext(reserva, chofer, route)), { image: mapImageUrl(position, pickup, route.polyline) })
      });
      if (outcome === 'sent' || outcome === 'dup') state.done.add('arriving');
      if (outcome === 'sent') return;
    }

    if (now - (state.lastTrackTry || 0) < 30_000) return;
    state.lastTrackTry = now;
    await deliver({
      reserva,
      kind: 'driver_tracking',
      cooldown: TRACK_COOLDOWN_S,
      meta: { km: Number(route.km.toFixed(2)), eta: route.minutes },
      build: () => {
        const c = copyContext(reserva, chofer, route);
        return payloadFor(reserva.reserva_id, {
          title: `${c.driver} va en camino`,
          body: `Llega en ${c.eta} min · ${c.kmText} km.${c.tail}`
        }, { silent: true, image: mapImageUrl(position, pickup, route.polyline) });
      }
    });
  } finally {
    state.busy = false;
  }
}

export function notifyCustomerOnDriverMove(chofer) {
  if (!enabled()) return;
  evaluateDriverMove(chofer).catch((error) => console.warn('[notify] seguimiento: ' + (error?.message || error)));
}

// --- avisos por horario (chofer asignado, "hoy es tu viaje", "en 1 hora") ---

export async function runScheduledNotifications() {
  if (!enabled() || ticking) return { skipped: true };
  ticking = true;
  const result = { checked: 0, sent: 0 };
  try {
    let rows;
    try {
      rows = await sb('reservas?select=*&order=timestamp.desc&limit=500');
    } catch {
      rows = await sb('reservas?select=*&limit=500');
    }
    const now = nowWall();
    for (const reserva of rows || []) {
      if (result.sent >= MAX_SENDS_PER_TICK) break;
      if (!reserva?.email_cliente || !reserva?.reserva_id || CLOSED_RESERVA.test(String(reserva.estado || ''))) continue;
      const info = pickupInfo(reserva, now);
      if (!info || info.minutesUntil < -30 || info.minutesUntil > 24 * 60) continue;
      result.checked++;
      const age = minutesSinceCreated(reserva);
      const due = [];
      if (reserva.chofer_id && info.minutesUntil > -30) due.push('driver_assigned');
      if (info.isToday && info.nowHour >= 7 && info.minutesUntil > 90 && age > 120) due.push('trip_today');
      if (info.minutesUntil > 15 && info.minutesUntil <= 60 && age > 30) due.push('trip_soon');
      for (const kind of due) {
        const outcome = await deliver({
          reserva,
          kind,
          build: () => payloadFor(reserva.reserva_id, pick(COPY[kind], reserva.reserva_id)(copyContext(reserva, null, null)))
        });
        if (outcome === 'sent') result.sent++;
      }
    }
    return result;
  } finally {
    ticking = false;
  }
}

export function startNotificationScheduler() {
  if (!enabled()) {
    console.log('[notify] avisos al cliente desactivados o sin Supabase configurado');
    return;
  }
  const run = () => runScheduledNotifications().catch((error) => console.warn('[notify] horario: ' + (error?.message || error)));
  setTimeout(run, 20_000);
  setInterval(run, 60_000);
  console.log('[notify] avisos automáticos al cliente activos');
}

export async function notifyCustomersAboutPromotion(promotion) {
  if (!enabled()) return { sent: 0, skipped: 0, failed: 0, disabled: true };
  const code = String(promotion?.code || '').trim().toUpperCase();
  const expiration = Date.parse(promotion?.expiration_date || '');
  const active = promotion?.is_public !== false
    && promotion?.is_active === true
    && Number(promotion?.uses_count || 0) < Number(promotion?.max_uses || 0)
    && Number.isFinite(expiration)
    && expiration > Date.now();
  if (!code || !active) return { sent: 0, skipped: 0, failed: 0, inactive: true };

  const discount = promotion.discount_type === 'PERCENTAGE'
    ? Number(promotion.discount_value) + '% de descuento'
    : '$' + Number(promotion.discount_value) + ' MXN de descuento';
  const ends = new Date(expiration).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  const venue = String(promotion.venue_name || 'LuxRides').trim();
  const description = String(promotion.description || '').trim();
  const title = `${promotion.icon || '🎟️'} ${venue}: nueva promoción`;
  const body = `${description} · ${discount} · Código ${code} · Vence ${ends}`;
  const results = { sent: 0, skipped: 0, failed: 0, limited: false };
  const pageSize = 500;
  const maxRecipients = 5000;

  for (let offset = 0; offset < maxRecipients; offset += pageSize) {
    let subscriptions;
    try {
      subscriptions = await sb('customer_push_subscriptions?select=user_id,subscription&order=user_id.asc', {
        headers: { Range: `${offset}-${offset + pageSize - 1}` }
      });
    } catch (error) {
      warnOnce('promo-subscriptions', 'no se pudieron leer suscripciones: ' + error.message);
      results.failed++;
      return results;
    }
    if (!subscriptions?.length) break;

    const batch = subscriptions.slice(0, pageSize);
    for (let start = 0; start < batch.length; start += 20) {
      await Promise.all(batch.slice(start, start + 20).map(async (row) => {
      const userId = String(row?.user_id || '').trim();
      if (!userId || !row?.subscription) { results.skipped++; return; }
      let claimed;
      try {
        claimed = await sb('rpc/claim_customer_promotion_push', {
          method: 'POST',
          body: JSON.stringify({ p_promo_code: code, p_user_id: userId, p_cooldown_hours: 24 })
        });
      } catch (error) {
        warnOnce('promo-claim', 'falta ejecutar el SQL de avisos promocionales: ' + error.message);
        results.failed++;
        return;
      }
      if (claimed !== true) { results.skipped++; return; }

      try {
        await enviarPush(row.subscription, {
          title,
          body,
          tag: 'luxrides-promo-' + code,
          url: '/?promociones=1',
          icon: ICON,
          badge: BADGE,
          requireInteraction: false
        });
        results.sent++;
      } catch (error) {
        results.failed++;
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await dropSubscription(userId);
          try {
            await sb('customer_promotion_push_log?promo_code=eq.' + encodeURIComponent(code) + '&user_id=eq.' + encodeURIComponent(userId), { method: 'DELETE' });
          } catch {}
        } else {
          console.warn('[notify] promo push no enviado:', error?.message || error);
        }
      }
      }));
    }

    if (batch.length < pageSize) break;
    if (offset + pageSize >= maxRecipients) results.limited = true;
  }

  return results;
}

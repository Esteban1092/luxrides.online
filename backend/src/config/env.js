import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error('Missing required env var: ' + name);
  }
  return value.trim();
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function optionalFirst(names, fallback = '') {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return fallback;
}

function csv(name) {
  const value = optional(name, '');
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(optional('PORT', '8787')),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendOrigin: optional('FRONTEND_ORIGIN', 'https://luxrides.online'),

  groqApiKey: optional('GROQ_API_KEY', ''),
  openRouterApiKeys: Array.from(new Set([
    ...csv('OPENROUTER_API_KEYS'),
    optional('OPENROUTER_API_KEY_1', ''),
    optional('OPENROUTER_API_KEY_2', ''),
    optional('OPENROUTER_API_KEY', '')
  ].map((item) => String(item || '').trim()).filter(Boolean))),
  openRouterSiteUrl: optional('OPENROUTER_SITE_URL', 'https://luxrides.online'),
  openRouterAppName: optional('OPENROUTER_APP_NAME', 'LuxRides Lovox'),
  hotelsApiKey: optional('HOTELS_API_KEY', ''),
  hotelsApiUrl: optional('HOTELS_API_URL', ''),
  stripeSecretKey: optional('STRIPE_SECRET_KEY', ''),
  stripeWebhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
  quoteSecret: optional('QUOTE_SECRET', ''),
  edgeTtsVoice: optional('EDGE_TTS_VOICE', 'es-MX-DaliaNeural'),
  edgeTtsRate: optional('EDGE_TTS_RATE', '-8%'),
  edgeTtsPitch: optional('EDGE_TTS_PITCH', '-8Hz'),
  edgeTtsVolume: optional('EDGE_TTS_VOLUME', '+0%'),

  supabaseUrl: optional('SUPABASE_URL', ''),
  supabaseServiceKey: optional('SUPABASE_SERVICE_KEY', optional('SUPABASE_ANON_KEY', '')),

  vapid: {
    publicKey: optional('VAPID_PUBLIC_KEY', ''),
    privateKey: optional('VAPID_PRIVATE_KEY', ''),
    email: optional('VAPID_EMAIL', 'luxrides@luxrides.online')
  },

  smtp: {
    host: optional('SMTP_HOST', ''),
    port: Number(optional('SMTP_PORT', '465')),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    from: optional('SMTP_FROM', 'LuxRides <luxrides@luxrides.online>')
  },

  reservationCancellationSecret: optionalFirst(
    ['RESERVATION_CANCELLATION_SECRET', 'ADMIN_SESSION_SECRET', 'SESSION_SECRET', 'QUOTE_SECRET'],
    optionalFirst(['ADMIN_PASS', 'ADMIN_PASSWORD', 'DESPACHO_ADMIN_PASS'], '')
  ),

  admin: {
    id: optionalFirst(['ADMIN_ID', 'ADMIN_USER', 'DESPACHO_ADMIN_ID'], 'admin12343'),
    pass: optionalFirst(['ADMIN_PASS', 'ADMIN_PASSWORD', 'DESPACHO_ADMIN_PASS'], '131125'),
    sessionSecret: optionalFirst(['ADMIN_SESSION_SECRET', 'SESSION_SECRET', 'QUOTE_SECRET'], optionalFirst(['ADMIN_PASS', 'ADMIN_PASSWORD', 'DESPACHO_ADMIN_PASS'], ''))
  },

  driver: {
    sessionSecret: optionalFirst(['DRIVER_SESSION_SECRET', 'ADMIN_SESSION_SECRET', 'SESSION_SECRET', 'QUOTE_SECRET'], optionalFirst(['ADMIN_PASS', 'ADMIN_PASSWORD', 'DESPACHO_ADMIN_PASS'], ''))
  },

  mayahuel: {
    pass: optional('MAYAHUEL_ADMIN_PASS', 'mayahuelgrill'),
    sessionSecret: optionalFirst(['MAYAHUEL_SESSION_SECRET', 'ADMIN_SESSION_SECRET', 'SESSION_SECRET', 'QUOTE_SECRET'], optional('MAYAHUEL_ADMIN_PASS', 'mayahuelgrill'))
  },

  ticketsAdmin: {
    pass: optional('MAYAHUEL_TICKETS_ADMIN_PASS', '13112025'),
    sessionSecret: optionalFirst(['MAYAHUEL_TICKETS_SESSION_SECRET', 'MAYAHUEL_SESSION_SECRET', 'SESSION_SECRET', 'QUOTE_SECRET'], optional('MAYAHUEL_TICKETS_ADMIN_PASS', '13112025'))
  }
};

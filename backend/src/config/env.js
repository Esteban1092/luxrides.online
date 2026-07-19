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

export const env = {
  port: Number(optional('PORT', '8787')),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendOrigin: optional('FRONTEND_ORIGIN', 'https://luxrides.online'),

  groqApiKey: required('GROQ_API_KEY'),

  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: optional('SUPABASE_SERVICE_KEY', optional('SUPABASE_ANON_KEY', '')),

  vapid: {
    publicKey: optional('VAPID_PUBLIC_KEY', ''),
    privateKey: optional('VAPID_PRIVATE_KEY', ''),
    email: optional('VAPID_EMAIL', 'luxrides@luxrides.online')
  },

  smtp: {
    host: required('SMTP_HOST'),
    port: Number(optional('SMTP_PORT', '465')),
    user: required('SMTP_USER'),
    pass: required('SMTP_PASS'),
    from: required('SMTP_FROM')
  },

  admin: {
    id: optionalFirst(['ADMIN_ID', 'ADMIN_USER', 'DESPACHO_ADMIN_ID'], 'admin12343'),
    pass: optionalFirst(['ADMIN_PASS', 'ADMIN_PASSWORD', 'DESPACHO_ADMIN_PASS'], optionalFirst(['ADMIN_ID', 'ADMIN_USER', 'DESPACHO_ADMIN_ID'], 'admin12343'))
  }
};

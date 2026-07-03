import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error('Missing required env var: ' + name);
  return value.trim();
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const env = {
  port: Number(optional('PORT', '8787')),
  frontendOrigin: optional('FRONTEND_ORIGIN', 'https://luxrides.online'),
  groqApiKey: optional('GROQ_API_KEY', ''),
  adminId: optional('ADMIN_ID', ''),
  adminPass: optional('ADMIN_PASS', ''),
  stripeSecretKey: optional('STRIPE_SECRET_KEY', ''),
  smtp: {
    host: optional('SMTP_HOST', 'smtp.hostinger.com'),
    port: Number(optional('SMTP_PORT', '465')),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    from: optional('SMTP_FROM', 'LuxRides <luxrides@luxrides.online>')
  }
};

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

export const env = {
  port: Number(optional('PORT', '8787')),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendOrigin: optional('FRONTEND_ORIGIN', 'https://luxrides.online'),

  groqApiKey: required('GROQ_API_KEY'),

  smtp: {
    host: required('SMTP_HOST'),
    port: Number(optional('SMTP_PORT', '465')),
    user: required('SMTP_USER'),
    pass: required('SMTP_PASS'),
    from: required('SMTP_FROM')
  }
};

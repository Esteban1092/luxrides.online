import { tts } from 'edge-tts';
import { env } from '../config/env.js';

const DEFAULT_VOICE_BY_LANG = {
  es: 'es-MX-DaliaNeural',
  en: 'en-US-JennyNeural',
  pt: 'pt-BR-FranciscaNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  it: 'it-IT-ElsaNeural'
};

function normalizeLang(lang) {
  const raw = String(lang || '').trim().toLowerCase();
  if (!raw) return 'es';
  return raw.split('-')[0];
}

function pickVoice(lang) {
  const base = normalizeLang(lang);
  return DEFAULT_VOICE_BY_LANG[base] || env.edgeTtsVoice || DEFAULT_VOICE_BY_LANG.es;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  return Buffer.from(String(data || ''), 'binary');
}

export async function generarVozEdge(text, lang = 'es') {
  const clean = String(text || '').trim();
  if (!clean) {
    const err = new Error('text es requerido');
    err.status = 400;
    throw err;
  }

  try {
    const audio = await tts(clean, {
      voice: pickVoice(lang),
      rate: env.edgeTtsRate,
      pitch: env.edgeTtsPitch,
      volume: env.edgeTtsVolume
    });

    const audioBase64 = toBuffer(audio).toString('base64');
    if (!audioBase64) {
      const err = new Error('Edge-TTS no devolvio audio');
      err.status = 502;
      throw err;
    }

    return { audioBase64, mimeType: 'audio/mpeg' };
  } catch (error) {
    const err = new Error('Edge-TTS error: ' + String(error?.message || error).slice(0, 300));
    err.status = Number(error?.status) || 502;
    throw err;
  }
}

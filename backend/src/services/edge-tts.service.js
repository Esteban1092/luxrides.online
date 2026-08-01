import { env } from '../config/env.js';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

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

async function synthesizeToBuffer(text, voice) {
  const dir = await mkdtemp(join(tmpdir(), 'edge-tts-'));
  const outputFile = join(dir, randomUUID() + '.mp3');
  try {
    const args = [
      '--text',
      text,
      '--voice',
      voice,
      '--rate',
      env.edgeTtsRate,
      '--pitch',
      env.edgeTtsPitch,
      '--volume',
      env.edgeTtsVolume,
      '--write-media',
      outputFile
    ];

    await execFileAsync(env.edgeTtsBin, args, {
      maxBuffer: 1024 * 1024 * 10,
      timeout: 30000
    });

    return await readFile(outputFile);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function generarVozEdge(text, lang = 'es') {
  const clean = String(text || '').trim();
  if (!clean) {
    const err = new Error('text es requerido');
    err.status = 400;
    throw err;
  }

  try {
    const voice = pickVoice(lang);
    const audio = await synthesizeToBuffer(clean, voice);
    const audioBase64 = audio.toString('base64');
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

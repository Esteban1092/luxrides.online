import { env } from '../config/env.js';

function decodeMaybeBase64(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim();
}

export async function generarVozFish(text) {
  if (!env.fishStudioApiKey) {
    const err = new Error('FISH_STUDIO_API_KEY no configurada');
    err.status = 400;
    throw err;
  }
  if (!env.fishStudioVoiceId) {
    const err = new Error('FISH_STUDIO_VOICE_ID no configurada');
    err.status = 400;
    throw err;
  }

  const res = await fetch(env.fishStudioApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.fishStudioApiKey
    },
    body: JSON.stringify({
      text,
      voice_id: env.fishStudioVoiceId,
      format: 'mp3'
    })
  });

  const contentType = String(res.headers.get('content-type') || '').toLowerCase();

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error('Fish Studio error: ' + body.slice(0, 300));
    err.status = res.status;
    throw err;
  }

  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    const audioBase64 = decodeMaybeBase64(
      data?.audio_base64 ||
      data?.audio ||
      data?.data?.audio_base64 ||
      data?.data?.audio
    );
    if (!audioBase64) {
      const err = new Error('Fish Studio no devolvio audio en JSON');
      err.status = 502;
      throw err;
    }
    return { audioBase64, mimeType: 'audio/mpeg' };
  }

  const ab = await res.arrayBuffer();
  const audioBase64 = Buffer.from(ab).toString('base64');
  return { audioBase64, mimeType: contentType.includes('audio/') ? contentType : 'audio/mpeg' };
}

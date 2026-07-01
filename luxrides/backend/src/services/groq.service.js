import { env } from '../config/env.js';

export async function completarChat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('messages must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.groqApiKey
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 800,
      temperature: 0.75
    })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || 'Groq API error');
    err.status = r.status;
    throw err;
  }

  return data?.choices?.[0]?.message?.content || '';
}

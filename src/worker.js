// VaaniDesk Worker: /api/stt aur /api/tts ka proxy. Gnani key sirf yahin (env secret).
// Audio kahin store nahi hota.

const STT_URL = 'https://api.vachana.ai/stt/v3';
const TTS_URL = 'https://api.vachana.ai/api/v1/tts/inference';
const MAX_AUDIO = 1.5 * 1024 * 1024; // ~25 sec WAV 16k mono
const MAX_TEXT = 400;
const RATE_LIMIT = 20; // per IP per minute
const RETRY_DELAYS = [400, 800, 1600];

// Best-effort per-isolate limiter (demo ke liye kaafi; global nahi hai).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(doFetch) {
  for (let i = 0; ; i++) {
    const res = await doFetch();
    if (res.status !== 429 || i >= RETRY_DELAYS.length) return res;
    await sleep(RETRY_DELAYS[i]);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function gnaniError(body, status) {
  const msg =
    (body && body.error && body.error.message) ||
    (body && body.detail && body.detail.message) ||
    (body && body.message) ||
    'Gnani error';
  return json({ error: msg, status }, status === 429 ? 429 : 502);
}

async function handleStt(request, env) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) return json({ error: 'multipart/form-data chahiye' }, 400);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_AUDIO + 64 * 1024) return json({ error: 'Audio bahut lamba hai (max ~25 sec)' }, 413);

  const form = await request.formData();
  const file = form.get('audio_file');
  if (!file || typeof file === 'string') return json({ error: 'audio_file missing' }, 400);
  if (file.size > MAX_AUDIO) return json({ error: 'Audio bahut lamba hai (max ~25 sec)' }, 413);
  const audio = await file.arrayBuffer();

  const send = (withFormat) =>
    withRetry(() => {
      const fd = new FormData();
      const type = file.type || 'audio/wav';
      const ext = /mpeg|mp3/.test(type) ? 'mp3' : /ogg/.test(type) ? 'ogg' : 'wav';
      fd.append('audio_file', new Blob([audio], { type }), 'speech.' + ext);
      fd.append('model', 'prisma-v3.0');
      fd.append('language_code', 'indic-auto');
      if (withFormat) fd.append('format', 'codemix');
      return fetch(STT_URL, { method: 'POST', headers: { 'X-API-Key-ID': env.GNANI_API_KEY }, body: fd });
    });

  let res = await send(true);
  if (res.status === 400) {
    const text = await res.clone().text();
    if (/format/i.test(text)) res = await send(false);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return gnaniError(body, res.status);
  return json({
    transcript: (body && body.transcript) || '',
    language: (body && body.detected_language_code) || null,
    gnaniMs: body && body.processing_time != null ? Math.round(body.processing_time * 1000) : null,
  });
}

async function handleTts(request, env) {
  const body = await request.json().catch(() => null);
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ error: 'text missing' }, 400);
  if (text.length > MAX_TEXT) return json({ error: `text max ${MAX_TEXT} chars` }, 400);

  const language = /[\u0B80-\u0BFF]/.test(text) ? 'ta-IN' : 'hi-en';
  const payload = {
    text,
    model: 'timbre-v3.0',
    voice: env.TTS_VOICE || 'Avinash',
    language,
    speed: 1.0,
    audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, container: 'mp3', bitrate: '64k' },
  };
  const res = await withRetry(() =>
    fetch(TTS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-Key-ID': env.GNANI_API_KEY },
      body: JSON.stringify(payload),
    })
  );
  if (!res.ok) return gnaniError(await res.json().catch(() => null), res.status);
  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') || 'audio/mpeg', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!env.GNANI_API_KEY) return json({ error: 'GNANI_API_KEY set nahi hai' }, 500);

    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (rateLimited(ip)) return json({ error: 'Bahut zyada requests. 1 minute ruko.' }, 429);

    try {
      if (url.pathname === '/api/stt') return await handleStt(request, env);
      if (url.pathname === '/api/tts') return await handleTts(request, env);
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: 'Server error' }, 500);
    }
  },
};

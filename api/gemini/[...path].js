const UPSTREAM = (process.env.GEMINI_UPSTREAM || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
const WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_CHARS = 400000;
const hits = new Map();

function limitPerWindow() {
  const value = Number(process.env.RATE_LIMIT_PER_10MIN);
  return Number.isInteger(value) && value > 0 ? value : 30;
}

function checkRate(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || [];
  const recent = entry.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limitPerWindow()) {
    return Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000));
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
  return 0;
}

function fail(res, status, message, headers = {}) {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.status(status).json({ error: { message } });
}

export default async function handler(req, res) {
  const path = [].concat(req.query.path || []).join('/');

  if (req.method === 'GET' && path === 'default') {
    return res.status(200).json({ model: process.env.DEFAULT_MODEL || null });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail(res, 503, 'Gateway is not configured');

  if (process.env.CLIENT_TOKEN && req.headers['x-aeryth-token'] !== process.env.CLIENT_TOKEN) {
    return fail(res, 401, 'Missing or wrong client token');
  }

  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const wait = checkRate(forwarded || 'unknown');
  if (wait > 0) return fail(res, 429, 'Too many requests, please slow down', { 'retry-after': String(wait) });

  const match = /^v1beta\/models(?:\/([A-Za-z0-9._-]+):(generateContent|streamGenerateContent))?$/.exec(path);
  if (!match) return fail(res, 404, 'Not found');

  const model = match[1];
  const isGenerate = Boolean(model);
  if (isGenerate && req.method !== 'POST') return fail(res, 405, 'Use POST');
  if (!isGenerate && req.method !== 'GET') return fail(res, 405, 'Use GET');

  const allowed = (process.env.ALLOWED_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
  if (isGenerate && allowed.length > 0 && !allowed.includes(model)) {
    return fail(res, 403, 'This model is not available on the free gateway');
  }

  let body;
  if (isGenerate) {
    body = JSON.stringify(req.body || {});
    if (body.length > MAX_BODY_CHARS) return fail(res, 413, 'Request is too large');
  }

  const query = match[2] === 'streamGenerateContent' ? '?alt=sse' : isGenerate ? '' : '?pageSize=200';

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}/${path}${query}`, {
      method: isGenerate ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body
    });
  } catch {
    return fail(res, 502, 'Could not reach the AI service');
  }

  res.status(upstream.status);
  res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) res.setHeader('retry-after', retryAfter);

  if (!upstream.body) return res.end();
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

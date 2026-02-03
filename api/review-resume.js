const OpenAI = require('openai');
const crypto = require('crypto');

const MIN_RESUME_LENGTH = 500;
const MAX_RESUME_LENGTH = 6000;
const MAX_BODY_SIZE = 65536; // 64KB
const RATE_LIMIT_PER_IP = 2;
const RATE_LIMIT_WINDOW_SEC = 86400;
const EMAIL_COOLDOWN_SEC = 7 * 86400;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const memoryRateLimit = new Map(); // fallback when Redis unavailable

function hashEmail(email) {
  return crypto.createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex');
}

function hashIp(ip) {
  return crypto.createHash('sha256').update((ip || '').trim()).digest('hex');
}

function getClientIp(req) {
  return req.headers['x-real-ip']?.trim()
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || '0.0.0.0';
}

const SCORE_BANDS = [
  { min: 0, max: 40, label: 'Very weak' },
  { min: 41, max: 60, label: 'Needs major revision' },
  { min: 61, max: 75, label: 'Solid with gaps' },
  { min: 76, max: 90, label: 'Strong' },
  { min: 91, max: 100, label: 'Excellent' },
];

function getBandForScore(score) {
  const s = Math.round(Number(score)) || 0;
  const band = SCORE_BANDS.find(b => s >= b.min && s <= b.max);
  return band ? band.label : 'Very weak';
}

function getReviewPrompt(resumeText) {
  const text = resumeText.slice(0, MAX_RESUME_LENGTH);
  return `You are an expert resume reviewer. Analyze the resume and respond in US English. Be structured, direct, and practical. No em dashes. No fluff or buzzwords.

RESUME TEXT:
${text}

Score bands (use these internally when scoring; then set "bandLabel" to the matching label):
- 0–40: Very weak
- 41–60: Needs major revision
- 61–75: Solid with gaps
- 76–90: Strong
- 91–100: Excellent

Respond with valid JSON only, no markdown. Use this structure:
{
  "score": <number 0-100>,
  "bandLabel": "<exact label from the score band list above, e.g. Needs major revision>",
  "summary": "<overall assessment, 15-20 words max>",
  "scoreUpgrade": "<1-2 sentences: what would increase the score by about 10 points>",
  "fixes": [
    {
      "title": "<short title>",
      "description": "<actionable fix including one micro concrete example; when possible quote or reference a phrase from the resume; avoid generic advice that could apply to any resume>"
    }
  ]
}

Rules:
- Score out of 100 and set bandLabel to the band that score falls into.
- Summary: 15-20 words.
- scoreUpgrade: specific to this resume; one concrete change that would add ~10 points.
- Give 3-5 fixes, ordered by impact (highest first).
- Each fix must: (1) include one micro concrete example, (2) when possible reference or quote phrases from the resume, (3) avoid advice that could apply to any resume without customization.
- Keep total output under 1000 tokens.`;
}

function getRawBody(req) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return Promise.reject(new Error('PAYLOAD_TOO_LARGE'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function checkRateLimitRedis(redis, ipHash) {
  const key = `rl:${ipHash}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
  if (count > RATE_LIMIT_PER_IP) return 'You have reached the daily limit for resume reviews. Please try again tomorrow.';
  return null;
}

function checkRateLimitMemory(ipHash) {
  const now = Date.now();
  const entry = memoryRateLimit.get(ipHash);
  if (!entry) {
    memoryRateLimit.set(ipHash, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_SEC * 1000 });
    return null;
  }
  if (now > entry.expiresAt) {
    memoryRateLimit.set(ipHash, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_SEC * 1000 });
    return null;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_PER_IP) {
    return 'You have reached the daily limit for resume reviews. Please try again tomorrow.';
  }
  if (memoryRateLimit.size > 10000) {
    for (const [k, v] of memoryRateLimit.entries()) {
      if (now > v.expiresAt) memoryRateLimit.delete(k);
    }
  }
  return null;
}

async function checkEmailGate(redis, email) {
  if (!redis) return null;
  const key = `eg:${hashEmail(email)}`;
  const existing = await redis.get(key);
  if (existing) return 'This email was already used for a review in the last 7 days. Please try again later.';
  await redis.set(key, '1', { ex: EMAIL_COOLDOWN_SEC });
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error. Please try again later.' });
  }

  let redis = null;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { Redis } = require('@upstash/redis');
      redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    } catch (e) {
      console.warn('Redis not available, rate/email limits skipped');
    }
  }

  const ipHash = hashIp(getClientIp(req));

  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return res.status(400).json({ error: 'Content-Type must be application/json. Paste your resume text and submit.' });
  }

  try {
    const raw = await getRawBody(req);
    let body;
    try {
      body = JSON.parse(raw.toString());
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }

    const email = (body.email || '').trim();
    const text = (body.text || '').trim();

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (!text) {
      return res.status(400).json({ error: 'Please provide your CV text.' });
    }
    if (text.length < MIN_RESUME_LENGTH) {
      return res.status(400).json({ error: `Please provide at least ${MIN_RESUME_LENGTH} characters of your CV.` });
    }
    if (text.length > MAX_RESUME_LENGTH) {
      return res.status(400).json({ error: `Resume must be at most ${MAX_RESUME_LENGTH} characters (~2 pages).` });
    }

    const rateErr = redis
      ? await checkRateLimitRedis(redis, ipHash)
      : checkRateLimitMemory(ipHash);
    if (rateErr) return res.status(429).json({ error: rateErr });

    const emailErr = await checkEmailGate(redis, email);
    if (emailErr) return res.status(429).json({ error: emailErr });

    const resumeText = text.slice(0, MAX_RESUME_LENGTH);

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume reviewer. Respond only with valid JSON. Use US English. Be structured, direct, and practical. No em dashes. No fluff or buzzwords.',
        },
        { role: 'user', content: getReviewPrompt(resumeText) },
      ],
      temperature: 0.3,
      max_tokens: 1100,
    });

    const rawResponse = completion.choices[0]?.message?.content?.trim() || '{}';
    let review;
    try {
      const cleaned = rawResponse.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '');
      review = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({
        error: 'Could not parse the AI response. Please try again.',
      });
    }

    const fixes = Array.isArray(review.fixes) ? review.fixes : (Array.isArray(review.suggestions) ? review.suggestions : []);
    review.fixes = fixes.slice(0, 5);
    if (typeof review.score !== 'number') {
      review.score = 0;
    }
    review.score = Math.min(100, Math.max(0, Math.round(review.score)));
    review.bandLabel = typeof review.bandLabel === 'string' && review.bandLabel.trim()
      ? review.bandLabel.trim()
      : getBandForScore(review.score);
    if (typeof review.scoreUpgrade !== 'string' || !review.scoreUpgrade.trim()) {
      review.scoreUpgrade = '';
    } else {
      review.scoreUpgrade = review.scoreUpgrade.trim();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(review);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Request body too large.' });
    }
    console.error('Resume review error:', err);
    return res.status(500).json({
      error: 'An error occurred while reviewing your resume. Please try again.',
    });
  }
};

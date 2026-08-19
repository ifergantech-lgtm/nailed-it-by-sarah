// POST /api/login  { email, password }  → sets a signed session cookie.
import {
  verifyPassword, signToken, sessionCookie, authConfigured, SESSION_TTL_MS
} from '../lib/auth.js';

// Best-effort in-memory throttle. Serverless instances are recycled, so this
// is not a hard guarantee, but it slows down repeated guesses against a warm
// instance. Combined with a strong password + the artificial delay below,
// it's a reasonable defence for a single-owner admin with no database.
const attempts = new Map(); // ip -> { count, first }
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function tooMany(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!authConfigured()) {
    return res.status(500).json({
      error: 'The admin isn’t set up yet. Please contact your developer.'
    });
  }

  const ip = clientIp(req);
  if (tooMany(ip)) {
    return res.status(429).json({
      error: 'Too many attempts. Please wait a few minutes and try again.'
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Bad request' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const okEmail = email === String(process.env.ADMIN_EMAIL).trim().toLowerCase();
  const okPass = verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);

  if (!okEmail || !okPass) {
    recordFailure(ip);
    await delay(400); // slow down guessing; keeps timing roughly uniform
    return res.status(401).json({ error: 'Wrong email or password.' });
  }

  attempts.delete(ip);
  const exp = Date.now() + SESSION_TTL_MS;
  const token = signToken({ sub: email, exp }, process.env.SESSION_SECRET);
  res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
  return res.status(200).json({ ok: true });
}

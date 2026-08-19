// Self-hosted auth for the Nailed it by Sarah admin.
// No third-party auth service, no database — a hashed password lives in a
// Vercel environment variable, and the logged-in session is a short signed
// cookie. Uses only Node's built-in crypto (no npm dependencies).

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export const SESSION_COOKIE = 'nibs_session';

// How long a login lasts before Sarah has to sign in again.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// === Password hashing (scrypt) ===
// Stored format: "scrypt:<saltHex>:<hashHex>". Generate one with
// `node scripts/hash-password.mjs` and paste it into ADMIN_PASSWORD_HASH.

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const parts = String(stored).split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  let ref;
  try {
    ref = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  const test = scryptSync(password, salt, ref.length);
  return test.length === ref.length && timingSafeEqual(test, ref);
}

// === Signed session token (HMAC-SHA256) ===

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// === Cookies ===

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i < 0) return;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function sessionCookie(token, maxAgeSec) {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`
  ].join('; ');
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Returns the session payload ({ sub, exp }) if the request carries a valid,
// unexpired, correctly-signed session cookie — otherwise null.
export function getSession(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = parseCookies(req)[SESSION_COOKIE];
  return verifyToken(token, secret);
}

// True when all required auth env vars are present.
export function authConfigured() {
  return Boolean(
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD_HASH &&
    process.env.SESSION_SECRET
  );
}

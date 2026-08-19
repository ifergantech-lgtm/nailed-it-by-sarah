#!/usr/bin/env node
// One-time helper: turn a plain password into the hash you paste into the
// ADMIN_PASSWORD_HASH environment variable in Vercel.
//
// Usage:
//   node scripts/hash-password.mjs "the-password-you-want"
//
// It prints the value for ADMIN_PASSWORD_HASH and a fresh SESSION_SECRET.
// Nothing is stored on disk and the plain password is never saved anywhere.

import { hashPassword } from '../lib/auth.js';
import { randomBytes } from 'node:crypto';

const pw = process.argv[2];
if (!pw) {
  console.error('\nUsage: node scripts/hash-password.mjs "your-password"\n');
  process.exit(1);
}
if (pw.length < 8) {
  console.error('\nPlease choose a password of at least 8 characters.\n');
  process.exit(1);
}

console.log('\nPaste these into Vercel → Settings → Environment Variables:\n');
console.log('ADMIN_PASSWORD_HASH =');
console.log('  ' + hashPassword(pw));
console.log('\nSESSION_SECRET =');
console.log('  ' + randomBytes(32).toString('hex'));
console.log('\n(Also set ADMIN_EMAIL to the email Sarah will log in with.)\n');

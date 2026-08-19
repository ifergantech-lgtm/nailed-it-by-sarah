// GET /api/session → { authed, email } when logged in, 401 otherwise.
import { getSession } from '../lib/auth.js';

export default async function handler(req, res) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ authed: false });
  return res.status(200).json({ authed: true, email: s.sub });
}

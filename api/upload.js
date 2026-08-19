// POST /api/upload  { image: "data:image/jpeg;base64,...", ext? }
// Auth: valid session cookie. Validates the image (magic bytes + size),
// commits it to images/gallery/ in the repo, and returns its public path.
//
// Images are resized/compressed in the browser before upload (see admin.html),
// so the server just validates and stores. No image library needed.

import { getSession } from '../lib/auth.js';
import { ghPut } from '../lib/github.js';

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB safety ceiling (client sends ~<400 KB)

// Detect real image type from the first bytes — never trust the declared MIME.
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function rand() {
  return Math.random().toString(36).slice(2, 8);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Please log in again.' });
  if (!process.env.GH_TOKEN) return res.status(500).json({ error: 'Server misconfigured: GH_TOKEN not set' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const dataUrl = String(body.image || '');
    const m = dataUrl.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
    if (!m) return res.status(400).json({ error: 'That doesn’t look like an image file.' });

    const base64 = m[1];
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'The image is empty.' });
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({ error: 'This photo is too large. Please choose a smaller one.' });
    }

    const ext = sniff(buf);
    if (!ext) return res.status(400).json({ error: 'Please upload a JPG, PNG or WEBP image.' });

    const path = `images/gallery/g-${Date.now()}-${rand()}.${ext}`;
    await ghPut(path, base64, null, `Add gallery image ${path} via admin`);

    return res.status(200).json({ ok: true, path: '/' + path });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'This photo couldn’t be uploaded. Please try again.' });
  }
}

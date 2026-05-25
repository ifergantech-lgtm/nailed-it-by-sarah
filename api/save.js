// Vercel serverless function — commits Sarah's admin changes to GitHub.
// Env vars required (set in Vercel dashboard):
//   ADMIN_PASSWORD  — password Sarah types into the admin
//   GH_TOKEN        — GitHub fine-grained PAT with "Contents: Write" on this repo
//   GH_OWNER        — github username (default: ifergantech-lgtm)
//   GH_REPO         — repo name (default: nailed-it-by-sarah)
//   GH_BRANCH       — branch (default: master)

const OWNER  = process.env.GH_OWNER  || 'ifergantech-lgtm';
const REPO   = process.env.GH_REPO   || 'nailed-it-by-sarah';
const BRANCH = process.env.GH_BRANCH || 'master';

async function ghGet(path) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: {
      'Authorization': `Bearer ${process.env.GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'nailed-it-by-sarah-admin'
    }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function ghPut(path, contentBase64, sha, message) {
  const body = { message, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${process.env.GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'nailed-it-by-sarah-admin',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`GitHub PUT ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// === Auto-translation via MyMemory (free, no API key) ===
// Translates a single English string to a target language.
// Returns the original string on failure so the site never goes blank.
async function translateOne(text, targetLang) {
  if (!text || targetLang === 'en') return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}&de=ifergantech@gmail.com`;
    const r = await fetch(url);
    if (!r.ok) return text;
    const j = await r.json();
    const out = j?.responseData?.translatedText;
    if (!out || typeof out !== 'string') return text;
    // MyMemory sometimes returns the input verbatim or with quota warnings
    if (/MYMEMORY WARNING|QUOTA/i.test(out)) return text;
    return out;
  } catch (e) {
    console.warn('translate failed:', targetLang, e.message);
    return text;
  }
}

// Take an English string and return { he, en, fr, es, ar }.
async function expandToAllLangs(en) {
  if (!en || typeof en !== 'string') return en; // pass-through (already an object or empty)
  const [he, fr, es, ar] = await Promise.all([
    translateOne(en, 'he'),
    translateOne(en, 'fr'),
    translateOne(en, 'es'),
    translateOne(en, 'ar')
  ]);
  return { he, en, fr, es, ar };
}

async function geocode(street, city) {
  // Nominatim — free OpenStreetMap geocoder. Requires a User-Agent.
  const q = encodeURIComponent(`${street}, ${city}`);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
    headers: { 'User-Agent': 'nailed-it-by-sarah-admin (https://nailed-it-by-sarah.vercel.app)' }
  });
  if (!r.ok) return null;
  const arr = await r.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
}

function extractShortcode(url) {
  if (!url || typeof url !== 'string') return '';
  // matches /p/SHORTCODE/, /reel/SHORTCODE/, /reels/SHORTCODE/
  const m = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : url.trim();
}

function validateData(d) {
  if (!d || typeof d !== 'object') throw new Error('data missing');
  if (!d.phone || !d.phone.intl) throw new Error('phone.intl missing');
  if (!d.address || !d.address.street || !d.address.city) throw new Error('address incomplete');
  if (!d.hours || !d.hours.display) throw new Error('hours missing');
  if (!Array.isArray(d.services)) throw new Error('services must be array');
  if (!Array.isArray(d.gallery) || d.gallery.length !== 8) throw new Error('gallery must be array of 8');
  if (!Array.isArray(d.reels) || d.reels.length !== 2) throw new Error('reels must be array of 2');
}

export default async function handler(req, res) {
  // CORS for the admin page (same origin in practice, but be explicit)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { password, data } = body;

    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'Server misconfigured: ADMIN_PASSWORD not set' });
    }
    if (!process.env.GH_TOKEN) {
      return res.status(500).json({ error: 'Server misconfigured: GH_TOKEN not set' });
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'סיסמה שגויה / Wrong password' });
    }

    validateData(data);

    // Normalize gallery shortcodes (accept full URLs or bare shortcodes)
    data.gallery = data.gallery.map((g, i) => ({
      shortcode: extractShortcode(g.shortcode || g.url || ''),
      image: g.image || `/images/nail${i + 1}.jpg`
    }));

    // Normalize reels (accept full URLs or bare shortcodes)
    data.reels = data.reels.map(r => extractShortcode(r));

    // Keep the raw English strings for geocoding + mapsQuery before we expand to all languages.
    const streetEn = typeof data.address.street === 'string' ? data.address.street : (data.address.street?.en || '');
    const cityEn   = typeof data.address.city   === 'string' ? data.address.city   : (data.address.city?.en   || '');
    const hoursEn  = typeof data.hours.display  === 'string' ? data.hours.display  : (data.hours.display?.en  || '');

    // Geocode address if street+city are present (refresh lat/lng each save)
    try {
      const geo = await geocode(streetEn, cityEn);
      if (geo) {
        data.address.lat = geo.lat;
        data.address.lng = geo.lng;
      }
    } catch (e) {
      console.warn('geocode failed:', e.message);
    }

    // Build mapsQuery for the iframe (always English so Google Maps resolves it reliably)
    data.address.mapsQuery = `${streetEn}, ${cityEn}`;

    // Auto-translate English → HE / FR / ES / AR for the 3 free-text fields.
    // If translation fails for a language we fall back to the English value.
    try {
      const [streetAll, cityAll, hoursAll] = await Promise.all([
        expandToAllLangs(streetEn),
        expandToAllLangs(cityEn),
        expandToAllLangs(hoursEn)
      ]);
      if (streetAll) data.address.street  = streetAll;
      if (cityAll)   data.address.city    = cityAll;
      if (hoursAll)  data.hours.display   = hoursAll;
    } catch (e) {
      console.warn('translation step failed:', e.message);
    }

    // Stamp updatedAt
    data.updatedAt = new Date().toISOString();

    // Commit data.json
    const current = await ghGet('data.json');
    const newContent = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64');
    await ghPut(
      'data.json',
      newContent,
      current ? current.sha : null,
      `Update site content via admin (${new Date().toISOString()})`
    );

    return res.status(200).json({
      ok: true,
      message: 'נשמר. השינוי יעלה לאוויר תוך כדקה / Saved. Live in ~1 min.',
      url: 'https://nailed-it-by-sarah.vercel.app'
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Save failed' });
  }
}

// POST /api/save  { data }  → commits data.json to GitHub.
// Auth: valid session cookie (set by /api/login). See lib/auth.js.
//
// Env vars: ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SESSION_SECRET (auth) +
//           GH_TOKEN / GH_OWNER / GH_REPO / GH_BRANCH (GitHub).

import { getSession } from '../lib/auth.js';
import { ghGet, ghPut } from '../lib/github.js';

// === Auto-translation via MyMemory (free, no API key) ===
async function translateOne(text, targetLang) {
  if (!text || targetLang === 'en') return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}&de=ifergantech@gmail.com`;
    const r = await fetch(url);
    if (!r.ok) return text;
    const j = await r.json();
    const out = j?.responseData?.translatedText;
    if (!out || typeof out !== 'string') return text;
    if (/MYMEMORY WARNING|QUOTA/i.test(out)) return text;
    return out;
  } catch (e) {
    console.warn('translate failed:', targetLang, e.message);
    return text;
  }
}

async function expandToAllLangs(en) {
  if (!en || typeof en !== 'string') return en;
  const [he, fr, es, ar] = await Promise.all([
    translateOne(en, 'he'), translateOne(en, 'fr'),
    translateOne(en, 'es'), translateOne(en, 'ar')
  ]);
  return { he, en, fr, es, ar };
}

// Re-translate only when the English text actually changed.
async function resolveName(existing, nameEn) {
  const en = String(nameEn || '').trim();
  if (!en) return existing || { he: '', en: '', fr: '', es: '', ar: '' };
  if (existing && typeof existing === 'object' && existing.en === en) return existing;
  return expandToAllLangs(en);
}

async function geocode(street, city) {
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
  const m = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : url.trim();
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'item';
}

function uniqueId(base, used, i) {
  let id = base;
  while (used.has(id)) id = `${base}-${i}`;
  used.add(id);
  return id;
}

function validateData(d) {
  if (!d || typeof d !== 'object') throw new Error('data missing');
  if (!d.phone || !d.phone.intl) throw new Error('phone.intl missing');
  if (!d.address || !d.address.street || !d.address.city) throw new Error('address incomplete');
  if (!d.hours || !d.hours.display) throw new Error('hours missing');
  if (!Array.isArray(d.serviceCategories)) throw new Error('serviceCategories must be an array');
  if (!Array.isArray(d.services)) throw new Error('services must be an array');
  if (!Array.isArray(d.gallery)) throw new Error('gallery must be an array');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Please log in again.' });
  if (!process.env.GH_TOKEN) return res.status(500).json({ error: 'Server misconfigured: GH_TOKEN not set' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { data } = body;
    validateData(data);

    // --- Service categories ---
    const usedCat = new Set();
    data.serviceCategories = await Promise.all(data.serviceCategories.map(async (c, i) => ({
      id: uniqueId(String(c.id || slugify(c.nameEn || c.name?.en || 'cat')), usedCat, i),
      order: Number(c.order) || i + 1,
      name: await resolveName(c.name, c.nameEn ?? c.name?.en)
    })));

    // --- Services ---
    const usedSvc = new Set();
    data.services = await Promise.all(data.services.map(async (s, i) => ({
      id: uniqueId(String(s.id || slugify(s.nameEn || s.name?.en || 'service')), usedSvc, i),
      category: String(s.category || ''),
      order: Number(s.order) || i + 1,
      published: s.published !== false,
      i18nKey: s.i18nKey || `srv.${slugify(s.nameEn || s.name?.en || 'service')}`,
      price: String(s.price || '').trim(),
      name: await resolveName(s.name, s.nameEn ?? s.name?.en)
    })));

    // --- Gallery (variable length; uploaded images or Instagram embeds) ---
    const usedImg = new Set();
    data.gallery = (data.gallery || []).map((g, i) => ({
      id: uniqueId(String(g.id || `img-${i + 1}`), usedImg, i),
      image: String(g.image || '').trim(),
      shortcode: extractShortcode(g.shortcode || g.url || ''),
      alt: String(g.alt || '').trim(),
      order: Number(g.order) || i + 1,
      published: g.published !== false
    })).filter((g) => g.image || g.shortcode);

    // --- Reels ---
    data.reels = (data.reels || []).map((r) => extractShortcode(r));

    // --- Testimonials (text kept as-is, not translated) ---
    const usedT = new Set();
    data.testimonials = (data.testimonials || []).map((t, i) => {
      const name = String(t.name || '').trim();
      return {
        id: uniqueId(String(t.id || slugify(name || 'review')), usedT, i),
        name,
        initials: String(t.initials || name.charAt(0) || '★').toUpperCase().slice(0, 2),
        text: String(t.text || '').trim(),
        order: Number(t.order) || i + 1,
        published: t.published !== false
      };
    }).filter((t) => t.text);

    // --- Promotions (text translated when changed) ---
    const usedP = new Set();
    data.promotions = await Promise.all((data.promotions || []).map(async (p, i) => ({
      id: uniqueId(String(p.id || `promo-${i + 1}`), usedP, i),
      text: await resolveName(p.text, p.textEn ?? (typeof p.text === 'string' ? p.text : p.text?.en)),
      order: Number(p.order) || i + 1,
      published: p.published !== false
    })));

    // --- About (translated when changed) ---
    if (data.about && typeof data.about === 'object') {
      const a = data.about;
      const [eyebrow, title, bio] = await Promise.all([
        resolveName(a.eyebrow, a.eyebrowEn ?? (typeof a.eyebrow === 'string' ? a.eyebrow : a.eyebrow?.en)),
        resolveName(a.title,   a.titleEn   ?? (typeof a.title   === 'string' ? a.title   : a.title?.en)),
        resolveName(a.bio,     a.bioEn     ?? (typeof a.bio     === 'string' ? a.bio     : a.bio?.en))
      ]);
      data.about = { eyebrow, title, bio };
    }

    // --- Contact extras (plain strings) ---
    if (data.contact && typeof data.contact === 'object') {
      data.contact = {
        email: String(data.contact.email || '').trim(),
        waMessage: String(data.contact.waMessage || '').trim(),
        tiktok: String(data.contact.tiktok || '').trim(),
        facebook: String(data.contact.facebook || '').trim()
      };
    }

    // --- Address + hours: geocode & translate (English is the source) ---
    const streetEn = typeof data.address.street === 'string' ? data.address.street : (data.address.street?.en || '');
    const cityEn   = typeof data.address.city   === 'string' ? data.address.city   : (data.address.city?.en   || '');
    const hoursEn  = typeof data.hours.display   === 'string' ? data.hours.display  : (data.hours.display?.en  || '');
    try {
      const geo = await geocode(streetEn, cityEn);
      if (geo) { data.address.lat = geo.lat; data.address.lng = geo.lng; }
    } catch (e) { console.warn('geocode failed:', e.message); }
    data.address.mapsQuery = `${streetEn}, ${cityEn}`;
    try {
      const [streetAll, cityAll, hoursAll] = await Promise.all([
        expandToAllLangs(streetEn), expandToAllLangs(cityEn), expandToAllLangs(hoursEn)
      ]);
      if (streetAll) data.address.street = streetAll;
      if (cityAll)   data.address.city   = cityAll;
      if (hoursAll)  data.hours.display   = hoursAll;
    } catch (e) { console.warn('translation step failed:', e.message); }

    data.updatedAt = new Date().toISOString();

    // --- Commit data.json ---
    const current = await ghGet('data.json');
    const newContent = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64');
    await ghPut('data.json', newContent, current ? current.sha : null,
      `Update site content via admin (${data.updatedAt})`);

    return res.status(200).json({
      ok: true,
      message: 'Saved. Your changes will be live in about a minute.',
      url: 'https://nailed-it-by-sarah.vercel.app'
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Save failed' });
  }
}

# Nailed it by Sarah — website + self-service CMS

Marketing site for **Nailed it by Sarah**, a gel-nail studio in Gan Yavne, plus a
self-service admin so Sarah can manage her own content — services, prices,
gallery photos, opening hours, contact details, promotions and reviews — without
a developer.

**Live:** https://nailed-it-by-sarah.vercel.app · **Admin:** `/admin`

## Architecture (no database, no paid services)

Everything runs on **GitHub + Vercel** only.

| Layer | How it works |
|-------|--------------|
| Frontend | Static HTML/CSS/JS, no framework, no build step |
| Content "database" | `data.json`, committed to this GitHub repo |
| Image storage | Photos committed to `images/gallery/` in the repo (resized in-browser before upload) |
| API | Vercel serverless functions in `api/` |
| Auth | Email + scrypt-hashed password in Vercel env; HMAC-signed HttpOnly session cookie |
| Publish | Saving commits to GitHub → GitHub Action redeploys (~1 min) |

When Sarah saves, the browser calls a serverless function that commits the change
to GitHub. A GitHub Action redeploys the site, and the page renders the new
content. No database to run, back up, or pay for — GitHub keeps the full version
history of both content and images, which doubles as the backup.

## Project layout

```
index.html      Site markup (static fallback content)
script.js       Site logic + data overlay (renderPriceBoard / renderGallery / renderReviews / …)
styles.css      Styles
admin.html      Self-service admin (login + managers), self-contained
data.json       Editable content (services, gallery, hours, contact, about, promotions, testimonials)
lib/
  auth.js       Password hashing + signed session cookies (Node crypto, no deps)
  github.js     GitHub Contents API read/write
api/
  login.js      POST — email+password → session cookie
  logout.js     POST — clear session
  session.js    GET  — is the caller logged in?
  save.js       POST — commit data.json (cookie-authed; translates changed text; geocodes)
  upload.js     POST — validate + commit a gallery image (cookie-authed)
scripts/
  hash-password.mjs   One-time: generate ADMIN_PASSWORD_HASH + SESSION_SECRET
images/         Site + gallery images
```

## What Sarah can manage from `/admin`

- **Services** — add, rename, re-price, reorder, hide, delete (names auto-translated to 5 languages)
- **Gallery** — upload photos from her phone, reorder, hide, delete; or embed Instagram posts
- **Opening hours**, **contact** (phone, email, WhatsApp message, Instagram, TikTok, Facebook)
- **About** text, **Promotions** banner, **Reviews**

Content is multilingual (HE/EN/FR/ES/AR). Free-text is written in English and
auto-translated on save (MyMemory), with the original always kept as a fallback.

## Setup & deployment

See **[SETUP.md](SETUP.md)** for the one-time environment-variable setup
(password hash, session secret, GitHub token). Deployment is automatic on push to
`master` via `.github/workflows/deploy.yml`; or run `vercel --prod`.

Local preview (static only — the `/api` functions need Vercel to run):

```bash
npx serve site -l 3456
```

## Security

- Passwords stored only as salted scrypt hashes; sessions are signed, HttpOnly,
  Secure cookies (30-day expiry).
- Every admin API route verifies the session server-side.
- Image uploads are validated by magic-bytes + size, never by file extension.
- No secrets in the repo — only in Vercel environment variables.

## Known follow-ups

- JSON-LD structured data in `index.html` is static; if Sarah changes phone/hours/
  prices, the visible page updates but the JSON-LD stays until re-synced.

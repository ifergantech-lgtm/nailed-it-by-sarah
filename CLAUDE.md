# Nailed It by Sarah — Project Notes

## What this is
Nail salon website for Sarah M (Gan Yavne, Israel). Static HTML/CSS/JS site with a Vercel serverless function powering a self-service admin panel.

## Live URL
**https://nailed-it-by-sarah.vercel.app** (NOT the `-blond` variant — that's an old mistake)

## Admin URL (private — noindex)
**https://nailed-it-by-sarah.vercel.app/admin** — Sarah edits prices / hours / address / phone / services / gallery / reels here without touching code.

## Local path
`C:\Users\Simon\nailed-it-by-sarah`

## Deploy command
```bash
cd "C:/Users/Simon/nailed-it-by-sarah"
vercel --prod
```
(Auto-deploy also fires on push to `master` via `.github/workflows/deploy.yml`.)

## Tech stack
- Plain HTML / CSS / JavaScript (no framework, no build step)
- Static site hosted on Vercel
- One Vercel Serverless Function (`/api/save.js`) — Node 18+, native fetch, no deps
- Editable content lives in `data.json` (commited by admin → re-deploys via GitHub Action)

## Structure
```
index.html        ← Site
script.js         ← Site logic + DATA OVERLAY from data.json
styles.css        ← Site styles
admin.html        ← Self-contained admin UI (HTML + inline CSS + JS)
data.json         ← Editable content (prices, hours, phone, address, services, gallery, reels)
sitemap.xml
robots.txt        ← Disallows /admin and /api
vercel.json       ← Cache headers, /admin rewrite
package.json      ← `"type": "module"` for the serverless function
api/
  save.js         ← Validates password, geocodes address, commits data.json to GitHub
images/
  nail1-8.jpg     ← Gallery defaults (used if data.gallery[i].shortcode is empty)
  about1-3.jpg    ← About section photos
```

## How the admin works
1. Sarah opens `/admin` on her phone, logs in with **email + password**.
   - `POST /api/login` verifies against `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`
     (scrypt) and sets an HMAC-signed, HttpOnly session cookie (`SESSION_SECRET`).
   - The session lasts 30 days; `/api/session` resumes it, `/api/logout` clears it.
2. Forms pre-fill from current `data.json`.
3. On save, browser POSTs to `/api/save` (cookie-authenticated — no password in
   body) → function:
   - Requires a valid session cookie (`getSession` in `lib/auth.js`)
   - Assigns ids/order to services & categories; auto-translates any service or
     category **name that changed** (English → HE/FR/ES/AR via MyMemory)
   - Geocodes address via Nominatim; translates address/hours
   - Commits new `data.json` to GitHub using `GH_TOKEN`
4. GitHub Action redeploys (~30–60 s).
5. Site fetches new `data.json`; `applySiteData()` → `renderPriceBoard()` rebuilds
   the whole price list from data (names, prices, categories, order, visibility).

## Services are data-driven
The price board in `index.html` is a static fallback; when `data.json` loads,
`renderPriceBoard()` in `script.js` rebuilds it from `data.serviceCategories` +
`data.services`. Each service has `{ id, category, order, published, price,
name:{he,en,fr,es,ar} }`. This is what makes add/remove/reorder possible.

## Required Vercel env vars
| Name | Purpose |
|------|---------|
| `ADMIN_EMAIL`         | Email Sarah logs in with |
| `ADMIN_PASSWORD_HASH` | scrypt hash from `scripts/hash-password.mjs` |
| `SESSION_SECRET`      | random hex — signs the session cookie |
| `GH_TOKEN`            | GitHub fine-grained PAT — `Contents: Write` on `ifergantech-lgtm/nailed-it-by-sarah` |
| `GH_OWNER`            | `ifergantech-lgtm` (default fallback in code) |
| `GH_REPO`             | `nailed-it-by-sarah` (default fallback in code) |
| `GH_BRANCH`           | `master` (default fallback in code) |

`ADMIN_PASSWORD` (old single-password scheme) is retired. Full setup steps in
`SETUP.md`. Set env vars at:
https://vercel.com/tamars-projects-a5b1ebfe/nailed-it-by-sarah/settings/environment-variables

## Caveats (read before changing)
- **Schemas (JSON-LD) don't auto-sync** with Sarah's edits — they're hardcoded in `index.html`. If she changes phone/address/hours/prices, the visible DOM updates but JSON-LD stays stale. To re-sync, manually edit index.html or run a sync script.
- **Translations**: hours/address display is taken from `data.json` and shown identically in all 5 languages (no per-language transliteration). If you want EN/FR/etc. specific text, extend data.json with `address.streetEn` etc.
- **Gallery override**: when Sarah pastes an IG post URL, the corresponding tile becomes an Instagram embed iframe (not a background-image collage tile). Visual changes accordingly.
- **CDN caching**: `data.json` is served with `no-cache` headers (via `vercel.json`) so changes appear immediately after deploy.

## Status
Awaiting content from Sarah:
- Real bio text (currently placeholder in `script.js` `about.bio`)
- Real gallery photos (currently `/images/nail1-8.jpg` defaults)
- Real reels (currently default shortcodes in `data.json`)

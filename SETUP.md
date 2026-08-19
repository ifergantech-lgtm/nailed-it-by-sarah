# Admin setup — Nailed it by Sarah

The admin at **`/admin`** lets Sarah manage the site herself. It logs in with an
email + password (no GitHub account, no third-party login) and saves changes by
committing `data.json` to this GitHub repo, which redeploys the site in ~1 minute.

Everything runs on the two accounts you already have: **GitHub + Vercel**. No
database, no paid services.

## One-time setup (Gabriel)

### 1. Generate the password + session secret

From the `site/` folder, run:

```bash
node scripts/hash-password.mjs "the-password-sarah-will-use"
```

It prints an `ADMIN_PASSWORD_HASH` and a fresh `SESSION_SECRET`. The plain
password is never stored — only the hash goes into Vercel.

### 2. Set the environment variables in Vercel

Vercel → your project → **Settings → Environment Variables** (Production).
Add these five:

| Name | Value |
|------|-------|
| `ADMIN_EMAIL` | the email Sarah types to log in (e.g. `sarah@example.com`) |
| `ADMIN_PASSWORD_HASH` | the `scrypt:…` value printed by the script |
| `SESSION_SECRET` | the long random hex value printed by the script |
| `GH_TOKEN` | GitHub **fine-grained PAT** with **Contents: Write** on `ifergantech-lgtm/nailed-it-by-sarah` |
| `GH_OWNER` / `GH_REPO` / `GH_BRANCH` | optional — default to `ifergantech-lgtm` / `nailed-it-by-sarah` / `master` |

> The old `ADMIN_PASSWORD` variable is no longer used — you can delete it.

### 3. Create the GitHub token (`GH_TOKEN`)

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate:
- Repository access: only `ifergantech-lgtm/nailed-it-by-sarah`
- Permissions: **Contents → Read and write**
- Copy the token into `GH_TOKEN` in Vercel.

### 4. Redeploy

Trigger a redeploy (push to `master`, or Vercel → Deployments → Redeploy) so the
new environment variables take effect. Then open `/admin`, log in, and save a
test change.

## How Sarah uses it

1. Open **`nailed-it-by-sarah.vercel.app/admin`** on her phone.
2. Log in with her email + password (stays logged in for 30 days).
3. Edit contact, hours, address, and **services** (add / rename / re-price /
   reorder / hide / delete), then tap **Save & publish**.
4. Changes appear on the site in about a minute.

## Security notes

- Password is stored only as a salted **scrypt hash**; sessions are HMAC-signed,
  HttpOnly, Secure cookies (30-day expiry).
- Every admin API route checks the session server-side — hiding `/admin` is not
  the protection.
- Login has basic brute-force throttling (10 tries / 15 min per IP) plus a delay
  on wrong attempts.
- No secrets live in the repo — only in Vercel environment variables.

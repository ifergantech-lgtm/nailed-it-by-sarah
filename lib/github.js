// GitHub "database": read/write files in the repo via the Contents API.
// Shared by /api/save.js (data.json) and /api/upload.js (gallery images).

export const OWNER  = process.env.GH_OWNER  || 'ifergantech-lgtm';
export const REPO   = process.env.GH_REPO   || 'nailed-it-by-sarah';
export const BRANCH = process.env.GH_BRANCH || 'master';

function headers() {
  return {
    'Authorization': `Bearer ${process.env.GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'nailed-it-by-sarah-admin'
  };
}

export async function ghGet(path) {
  const r = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`,
    { headers: headers() }
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function ghPut(path, contentBase64, sha, message) {
  const body = { message, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`,
    { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) throw new Error(`GitHub PUT ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

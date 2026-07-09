// Vercel serverless function: writes a full page's HTML to the GitHub repo
// so the static site picks up the change on the next auto-deploy.
// Used by js/admin-edit.js's "Save Page" inline editor.
//
// Only GITHUB_TOKEN needs to be set in Vercel project settings — it's a real
// secret and can't safely live in source. Everything else below is hardcoded
// to match the values already public in the client-side admin code.
const ADMIN_KEY = '123456';
const GITHUB_OWNER = 'opticallyyoursthane-crypto';
const GITHUB_REPO = 'optically-yours';
const GITHUB_BRANCH = 'main';

const ALLOWED_FILES = [
  'index.html', 'about.html', 'products.html', 'services.html',
  'blogs.html', 'contact.html',
  'blog-astigmatism.html', 'blog-hyperopia.html', 'blog-myopia.html', 'blog-presbyopia.html',
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { file, html } = req.body || {};
  if (!ALLOWED_FILES.includes(file)) {
    res.status(400).json({ error: 'Unknown or disallowed file' });
    return;
  }
  if (typeof html !== 'string' || !html.trim()) {
    res.status(400).json({ error: '"html" must be a non-empty string' });
    return;
  }

  const { GITHUB_TOKEN } = process.env;
  const branch = GITHUB_BRANCH;
  if (!GITHUB_TOKEN) {
    res.status(500).json({ error: 'Server is missing GITHUB_TOKEN configuration' });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${file}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'optically-yours-admin',
  };

  try {
    const currentRes = await fetch(`${apiUrl}?ref=${branch}`, { headers: ghHeaders });
    let sha;
    if (currentRes.status === 200) {
      const current = await currentRes.json();
      sha = current.sha;
    } else if (currentRes.status !== 404) {
      const errBody = await currentRes.text();
      res.status(502).json({ error: `GitHub read failed: ${errBody}` });
      return;
    }

    const content = Buffer.from(html, 'utf-8').toString('base64');

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update ${file} via admin inline editor`,
        content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      res.status(502).json({ error: `GitHub write failed: ${errBody}` });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected error' });
  }
};

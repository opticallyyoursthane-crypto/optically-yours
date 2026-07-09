// Vercel serverless function: writes data/offers.json to the GitHub repo
// so the static site picks up the change on the next auto-deploy.
//
// Only GITHUB_TOKEN needs to be set in Vercel project settings — it's a real
// secret and can't safely live in source. Everything else below is hardcoded
// to match the values already public in the client-side admin code.
const ADMIN_KEY = '181275';
const GITHUB_OWNER = 'opticallyyoursthane-crypto';
const GITHUB_REPO = 'optically-yours';
const GITHUB_BRANCH = 'main';

const FILE_PATH = 'data/offers.json';

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

  const { offers } = req.body || {};
  if (!Array.isArray(offers)) {
    res.status(400).json({ error: '"offers" must be an array' });
    return;
  }

  for (const offer of offers) {
    if (!offer || typeof offer.title !== 'string' || !offer.title.trim()) {
      res.status(400).json({ error: 'Each offer requires a non-empty "title"' });
      return;
    }
    if (typeof offer.image !== 'string' || !offer.image.trim()) {
      res.status(400).json({ error: 'Each offer requires an "image"' });
      return;
    }
  }

  const { GITHUB_TOKEN } = process.env;
  const branch = GITHUB_BRANCH;
  if (!GITHUB_TOKEN) {
    res.status(500).json({ error: 'Server is missing GITHUB_TOKEN configuration' });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'optically-yours-admin',
  };

  try {
    // Fetch current file sha (required by GitHub to update an existing file).
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

    const content = Buffer.from(JSON.stringify(offers, null, 2) + '\n', 'utf-8').toString('base64');

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update offers via admin panel',
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

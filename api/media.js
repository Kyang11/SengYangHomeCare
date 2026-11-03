const { requireRole, send, readJson } = require('./_lib/auth');
const versioned = require('./_lib/versioned');
const PREFIX = 'cms/media/';
const SLOTS = ['logo', 'homeImage', 'aboutImage', ...Array.from({ length: 11 }, (_, i) => 'video-' + (i + 1))];

function cleanAsset(key, entry) {
  if (!entry || typeof entry !== 'object') return null;
  const url = String(entry.url || '').trim();
  if (url.length > 2000 || /[\s<>"'`\\]/.test(url)) return null;
  if (url && !url.startsWith('https://') && !/^\/api\/image\?p=cms%2Fimages%2F[a-z0-9._%-]+$/i.test(url)) return null;
  if (url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) return null;
      if (key.startsWith('video-')) {
        const youtube = /^(www\.)?(youtube\.com|youtu\.be)$/.test(parsed.hostname);
        const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
        if (youtube ? !/^[\w-]{11}$/.test(id || '') : !/\.(mp4|webm)$/i.test(parsed.pathname)) return null;
      }
    } catch (_) { return null; }
  }
  if (key.startsWith('video-') && url && !url.startsWith('https://')) return null;
  return { url, alt: String(entry.alt || '').slice(0, 300) };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const { data } = await versioned.readLatest(PREFIX);
      return send(res, 200, { assets: data?.assets || {} }, 'no-store');
    } catch (_) { return send(res, 200, { assets: {}, error: 'storage-unavailable' }); }
  }
  if (req.method !== 'PUT') return send(res, 405, { error: 'Method not allowed.' });
  const user = await requireRole(req, res, ['admin', 'editor']);
  if (!user) return;
  const body = await readJson(req);
  if (!body.assets || typeof body.assets !== 'object') return send(res, 400, { error: 'Missing assets.' });
  const assets = {};
  for (const key of Object.keys(body.assets)) {
    if (!SLOTS.includes(key)) return send(res, 400, { error: 'Unknown media slot.' });
    const value = cleanAsset(key, body.assets[key]);
    if (!value) return send(res, 400, { error: 'Invalid URL for ' + key + '. Use HTTPS images, hosted MP4/WebM, or a YouTube watch link.' });
    assets[key] = value;
  }
  try {
    await versioned.update(PREFIX, () => ({ assets: {} }), doc => {
      Object.assign(doc.assets, assets);
      doc.updatedAt = new Date().toISOString();
      doc.updatedBy = user.username;
    });
    return send(res, 200, { ok: true });
  } catch (_) { return send(res, 503, { error: 'Media could not be saved. Check private storage setup.' }); }
};
module.exports.cleanAsset = cleanAsset;

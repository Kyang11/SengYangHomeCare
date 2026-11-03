const { requireRole, send, readJson } = require('./_lib/auth');
const { loadContent, saveChanges } = require('./_lib/store');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const fresh = /[?&]fresh=1/.test(req.url || '');
    try {
      // Visitors get a copy cached for at most ~15 seconds after a save.
      // Editors ask for ?fresh=1 and always get the latest version.
      const { content } = await loadContent(fresh);
      return send(res, 200, content, fresh ? 'no-store' : 'public, max-age=0, s-maxage=10');
    } catch (e) {
      console.error('content GET failed:', e.message);
      return send(res, 200, { pages: {}, error: 'storage-unavailable' }, 'no-store');
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const user = await requireRole(req, res, ['admin', 'editor']);
    if (!user) return;
    const body = await readJson(req);
    if (!body || typeof body.changes !== 'object') return send(res, 400, { error: 'No changes sent.' });
    try {
      const { content, count } = await saveChanges(body.changes, user.username);
      return send(res, 200, { ok: true, saved: count, content });
    } catch (e) {
      console.error('content save failed:', e);
      return send(res, 500, { error: e.message || 'Save failed.' });
    }
  }

  return send(res, 405, { error: 'Method not allowed.' });
};

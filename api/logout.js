const { clearSession, send } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  clearSession(req, res);
  return send(res, 200, { ok: true });
};

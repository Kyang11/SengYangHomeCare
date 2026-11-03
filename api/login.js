const { getSecret, setSession, hasCsrfHeader, send, readJson } = require('./_lib/auth');
const users = require('./_lib/users');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  if (!hasCsrfHeader(req)) return send(res, 403, { error: 'Missing request header.' });
  try { getSecret(); }
  catch (e) { return send(res, 500, { error: 'Login is not configured on the server: ' + e.message }); }

  const body = await readJson(req);
  if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 64 || body.password.length > 200) return send(res, 401, { error: 'Invalid username or password.' });
  let user = null;
  try { user = await users.checkLogin(body.username, body.password); }
  catch (e) { console.error('Login service unavailable.'); return send(res, 500, { error: 'Login failed on the server. Please try again.' }); }

  if (!user) {
    await new Promise(r => setTimeout(r, 600)); // slow down guessing
    const hint = users.hasAnyEnvUser() ? '' : ' (No built-in admin is set up yet: follow the secure bootstrap steps in README.md.)';
    return send(res, 401, { error: 'Invalid username or password.' + hint });
  }
  setSession(req, res, user);
  return send(res, 200, { ok: true, user: user.username, name: user.name, role: user.role });
};

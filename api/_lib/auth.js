// Session + request helpers. Users live in ./users.js.
const crypto = require('crypto');
const users = require('./users');

const COOKIE = 'syh_session';
const SESSION_HOURS = 12;

// Explicit independent signing key. Fail closed until the owner configures it.
function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  throw new Error('Complete the secure bootstrap setup in README.md.');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) { try { out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); } catch (_) { /* Invalid cookie is ignored. */ } }
  });
  return out;
}

function isSecure(req) {
  return (req.headers['x-forwarded-proto'] || '').includes('https');
}

function setSession(req, res, user) {
  const maxAge = SESSION_HOURS * 3600;
  const token = sign({ u: user.username, pv: user.pv, exp: Date.now() + maxAge * 1000 });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`);
}

function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? '; Secure' : ''}`);
}

// Returns { username, name, role, builtIn } or null. Re-checks the user list on
// every call, so removed users and changed passwords take effect right away.
async function getSessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  let data;
  try { data = verify(token); } catch (e) { return null; }
  if (!data) return null;
  try { return await users.sessionUser(data.u, data.pv); } catch (e) { return null; }
}

// Mutating requests must carry this header. Browsers cannot send a custom
// header cross-site without a CORS preflight (which we never allow), so this
// blocks CSRF on top of SameSite=Lax.
function hasCsrfHeader(req) {
  return req.headers['x-syh-cms'] === '1';
}

// roles: which roles may call this endpoint, e.g. ['admin','editor'].
async function requireRole(req, res, roles) {
  if (!hasCsrfHeader(req)) { send(res, 403, { error: 'Missing request header.' }); return null; }
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    try { if (new URL(origin).host !== host) { send(res, 403, { error: 'Invalid request origin.' }); return null; } }
    catch (_) { send(res, 403, { error: 'Invalid request origin.' }); return null; }
  }
  const user = await getSessionUser(req);
  if (!user) { send(res, 401, { error: 'Not logged in.' }); return null; }
  if (roles && !roles.includes(user.role)) { send(res, 403, { error: 'Your account does not have permission to do that.' }); return null; }
  return user;
}

function send(res, status, obj, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 4500000) { data = ''; req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = {
  getSecret, setSession, clearSession, getSessionUser, requireRole, hasCsrfHeader, send, readJson,
};

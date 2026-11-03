// Login users, stored in Vercel Blob (no database).
//
// Two kinds of users:
//  1. An owner-activated admin with an offline scrypt hash. It works even if
//     the Blob store is empty, so you can never lock yourself out.
//  2. Users added in the admin dashboard. Saved in Blob with scrypt-hashed
//     passwords. The file name has a random suffix and is never linked anywhere.
const crypto = require('crypto');
const versioned = require('./versioned');

const ROLES = ['admin', 'editor', 'viewer'];
const MAX_USERS = 50;
const USERNAME_RE = /^[a-z0-9][a-z0-9@._+-]{2,63}$/;

/* ── Built-in (env) admins ── */

// Only a hashed bootstrap password is accepted. An email alone grants no access.
function envUsers() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  return USERNAME_RE.test(email) && /^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(hash) ? { [email]: hash } : {};
}

/* ── Password hashing ── */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

function checkHash(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  if (!/^[A-Za-z0-9_-]{22}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return false;
  const want = Buffer.from(parts[2], 'base64url');
  const got = crypto.scryptSync(String(password), parts[1], want.length, { N: 16384, r: 8, p: 1 });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }

// Short fingerprint of the current password. It goes into the session cookie,
// so changing a password (or removing a user) ends their existing sessions.
function fingerprint(secretish) { return sha('pv:' + secretish).toString('base64url').slice(0, 12); }

/* ── Blob storage (versioned, see versioned.js) ── */

// New users file versions: cms/private/users/v-<time>-<random>.json
const USERS_PREFIX = 'cms/private/users/';
const LEGACY_PREFIX = 'cms/private/users-'; // old single-file format

async function legacyUsers() {
  try {
    const old = await versioned.listAll(LEGACY_PREFIX);
    return old.length ? await versioned.readJsonBlob(old[old.length - 1].url) : null;
  } catch (e) { return null; }
}

let cache = null; // { at, data }

async function loadStored(fresh) {
  if (!fresh && cache && Date.now() - cache.at < 5000) return cache;
  const { data } = await versioned.readLatest(USERS_PREFIX, legacyUsers);
  const clean = data && Array.isArray(data.users) ? data : { users: [] };
  cache = { at: Date.now(), data: clean };
  return cache;
}

async function mutate(fn) {
  let out;
  const { doc } = await versioned.update(USERS_PREFIX, () => ({ users: [] }), d => {
    if (!Array.isArray(d.users)) d.users = [];
    out = fn(d);
  }, legacyUsers);
  cache = { at: Date.now(), data: doc };
  return out;
}

/* ── Public helpers ── */

function publicUser(u) {
  return { username: u.username, name: u.name || '', role: u.role, createdAt: u.createdAt || null,
           createdBy: u.createdBy || null, builtIn: !!u.builtIn };
}

// Everyone who can log in: env admins first, then stored users.
async function allUsers() {
  const env = envUsers();
  const list = Object.keys(env).map(u => ({ username: u, name: '', role: 'admin', builtIn: true }));
  let stored = [];
  try { stored = (await loadStored(false)).data.users; } catch (e) { stored = []; }
  stored.forEach(u => { if (!env[u.username]) list.push(u); });
  return list;
}

// Returns the user (without password) or null.
async function checkLogin(username, password) {
  const name = String(username || '').trim().toLowerCase();
  const env = envUsers();
  if (env[name] !== undefined) {
    return checkHash(password || '', env[name]) ? { username: name, name: '', role: 'admin', builtIn: true, pv: fingerprint(env[name]) } : null;
  }
  let stored = [];
  try { stored = (await loadStored(true)).data.users; } catch (e) { stored = []; }
  const u = stored.find(x => x.username === name);
  if (!u) { hashPassword('timing-equalizer'); return null; }
  return checkHash(password || '', u.hash) ? { ...publicUser(u), pv: fingerprint(u.hash) } : null;
}

// Looks up a session's user and confirms the password hasn't changed since login.
async function sessionUser(username, pv) {
  const env = envUsers();
  if (env[username] !== undefined) {
    return fingerprint(env[username]) === pv ? { username, name: '', role: 'admin', builtIn: true } : null;
  }
  const stored = (await loadStored(true)).data.users;
  const u = stored.find(x => x.username === username);
  return u && fingerprint(u.hash) === pv ? publicUser(u) : null;
}

/** @param {{username?:string, name?:string, role?:string, password?:string}} input */
function validate({ username, name, role, password }, isNew) {
  if (isNew) {
    if (!USERNAME_RE.test(username || '')) return 'Username must be 3–64 characters: letters, numbers, @ . _ + - (an email address works).';
  }
  if (role !== undefined && !ROLES.includes(role)) return 'Role must be admin, editor or viewer.';
  if (password !== undefined && password !== null && password !== '') {
    if (String(password).length < 14) return 'Password must be at least 14 characters.';
    if (String(password).length > 200) return 'Password is too long.';
  } else if (isNew) {
    return 'Password is required.';
  }
  if (name !== undefined && String(name).length > 80) return 'Name is too long.';
  return null;
}

async function createUser(input, by) {
  const username = String(input.username || '').trim().toLowerCase();
  const data = { username, name: String(input.name || '').trim(), role: input.role || 'editor', password: input.password };
  const err = validate(data, true);
  if (err) throw userError(err);
  if (envUsers()[username] !== undefined) throw userError('That username is already a built-in admin.');
  return mutate(store => {
    if (store.users.some(u => u.username === username)) throw userError('That username already exists.');
    if (store.users.length >= MAX_USERS) throw userError('User limit reached (' + MAX_USERS + ').');
    const u = { username, name: data.name, role: data.role, hash: hashPassword(data.password),
                createdAt: new Date().toISOString(), createdBy: by };
    store.users.push(u);
    return publicUser(u);
  });
}

async function updateUser(input, by) {
  const username = String(input.username || '').trim().toLowerCase();
  if (envUsers()[username] !== undefined) throw userError('Built-in admins are managed in Vercel (ADMIN_PASSWORD_HASH).');
  const err = validate({ name: input.name, role: input.role, password: input.password }, false);
  if (err) throw userError(err);
  if (username === by && input.role && input.role !== 'admin') throw userError('You cannot remove your own admin role.');
  return mutate(store => {
    const u = store.users.find(x => x.username === username);
    if (!u) throw userError('User not found.');
    if (input.name !== undefined) u.name = String(input.name).trim();
    if (input.role !== undefined) u.role = input.role;
    if (input.password) u.hash = hashPassword(input.password);
    u.updatedAt = new Date().toISOString();
    u.updatedBy = by;
    return publicUser(u);
  });
}

async function deleteUser(username, by) {
  username = String(username || '').trim().toLowerCase();
  if (envUsers()[username] !== undefined) throw userError('Built-in admins are managed in Vercel (ADMIN_PASSWORD_HASH).');
  if (username === by) throw userError('You cannot remove yourself.');
  return mutate(store => {
    const before = store.users.length;
    store.users = store.users.filter(u => u.username !== username);
    if (store.users.length === before) throw userError('User not found.');
    return true;
  });
}

async function changeOwnPassword(username, current, next) {
  if (envUsers()[username] !== undefined) throw userError('Your password is set in Vercel (ADMIN_PASSWORD_HASH). Change it there.');
  const err = validate({ password: next }, false);
  if (err || !next) throw userError(err || 'Enter a new password.');
  return mutate(store => {
    const u = store.users.find(x => x.username === username);
    if (!u || !checkHash(current || '', u.hash)) throw userError('Your current password is not correct.');
    u.hash = hashPassword(next);
    u.updatedAt = new Date().toISOString();
    return { ...publicUser(u), pv: fingerprint(u.hash) };
  });
}

function userError(msg) { return Object.assign(new Error(msg), { userFacing: true }); }

function hasAnyEnvUser() { return Object.keys(envUsers()).length > 0; }

module.exports = {
  ROLES, allUsers, checkLogin, sessionUser, createUser, updateUser, deleteUser, changeOwnPassword,
  publicUser, hasAnyEnvUser, hashPassword, checkHash,
};

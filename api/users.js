// Admin user management: list / add / change role / reset password / remove.
const { requireRole, setSession, send, readJson } = require('./_lib/auth');
const users = require('./_lib/users');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const me = await requireRole(req, res, ['admin']);
      if (!me) return;
      const list = (await users.allUsers()).map(users.publicUser);
      return send(res, 200, { users: list, me: me.username });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });

    const body = await readJson(req);

    // Any logged-in user can change their own password.
    if (body.action === 'password') {
      const me = await requireRole(req, res, null);
      if (!me) return;
      const updated = await users.changeOwnPassword(me.username, body.currentPassword, body.newPassword);
      setSession(req, res, updated); // keep this browser logged in with the new password
      return send(res, 200, { ok: true });
    }

    const me = await requireRole(req, res, ['admin']);
    if (!me) return;
    if (body.action === 'create') {
      const u = await users.createUser(body, me.username);
      return send(res, 200, { ok: true, user: u });
    }
    if (body.action === 'update') {
      const u = await users.updateUser(body, me.username);
      return send(res, 200, { ok: true, user: u });
    }
    if (body.action === 'delete') {
      await users.deleteUser(body.username, me.username);
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: 'Unknown action.' });
  } catch (e) {
    if (e.userFacing) return send(res, 400, { error: e.message });
    console.error('users API failed:', e);
    return send(res, 500, { error: 'Something went wrong saving users. Please try again.' });
  }
};

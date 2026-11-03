const { getSessionUser, send } = require('./_lib/auth');

module.exports = async (req, res) => {
  const u = await getSessionUser(req);
  if (!u) return send(res, 200, { user: null });
  return send(res, 200, { user: u.username, name: u.name, role: u.role, builtIn: u.builtIn });
};

const { requireRole, send, readJson } = require('./_lib/auth');
const storage = require('./_lib/versioned');
const prefix = 'cms/themes/';
const choices = ['navy','ocean','forest','plum','burgundy','slate','indigo','espresso','teal','charcoal'];
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { data } = await storage.readLatest(prefix);
      return send(res, 200, data || { sections: {} }, 'no-store');
    }
    if (req.method !== 'PUT') return send(res, 405, { error: 'Method not allowed.' });
    const me = await requireRole(req, res, ['admin']);
    if (!me) return;
    const { target, preset } = await readJson(req);
    if (!/^(header|footer|(?:index|about|services|training|employment|contact):s[0-9]{1,2})$/.test(target || '') || !(preset === null || choices.includes(preset))) return send(res, 400, { error: 'Choose a valid section and color template.' });
    const { doc } = await storage.update(prefix, () => ({ sections: {} }), data => {
      if (!data.sections) data.sections = {};
      if (preset === null) delete data.sections[target]; else data.sections[target] = preset;
      data.updatedBy = me.username;
    });
    return send(res, 200, doc);
  } catch (error) {
    console.error('Theme storage failed:', error.message);
    return send(res, 503, { error: 'Colors could not be saved. Please try again.' });
  }
};

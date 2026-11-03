const blob = require('@vercel/blob');
const { requireRole, send, readJson } = require('./_lib/auth');
const { ACCESS } = require('./_lib/store');

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 3 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const user = await requireRole(req, res, ['admin', 'editor']);
  if (!user) return;

  const body = await readJson(req);
  const ext = TYPES[body.contentType];
  if (!ext) return send(res, 400, { error: 'Only JPG, PNG, WebP or GIF images are allowed.' });
  const buf = Buffer.from(String(body.data || ''), 'base64');
  if (!buf.length) return send(res, 400, { error: 'Empty file.' });
  if (buf.length > MAX_BYTES) return send(res, 413, { error: 'Image is too large (max 3 MB after resizing).' });

  if (!matchesType(buf, body.contentType)) return send(res, 400, { error: 'File contents do not match the image type.' });

  const base = String(body.filename || 'image').replace(/\.[^.]*$/, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  try {
    const result = await blob.put(`cms/images/${base}.${ext}`, buf, {
      access: ACCESS,
      contentType: body.contentType,
      addRandomSuffix: true,
    });
    const url = ACCESS === 'private' ? '/api/image?p=' + encodeURIComponent(result.pathname) : result.url;
    return send(res, 200, { ok: true, url });
  } catch (e) {
    console.error('Media storage unavailable.');
    return send(res, 500, { error: 'Upload failed. Check the private storage configuration.' });
  }
};

function matchesType(buf, type) {
  if (type === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === 'image/jpeg') return buf[0] === 255 && buf[1] === 216 && buf[2] === 255;
  if (type === 'image/gif') return /^GIF8[79]a/.test(buf.subarray(0,6).toString());
  return type === 'image/webp' && buf.subarray(0,4).toString() === 'RIFF' && buf.subarray(8,12).toString() === 'WEBP';
}

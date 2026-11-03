// Serves uploaded images when the Blob store is private (BLOB_ACCESS=private).
const blob = require('@vercel/blob');
const { ACCESS } = require('./_lib/store');

module.exports = async (req, res) => {
  const m = /[?&]p=([^&]+)/.exec(req.url || '');
  const pathname = m ? decodeURIComponent(m[1]) : '';
  if (!/^cms\/images\/[a-z0-9._-]+$/i.test(pathname)) { res.statusCode = 404; return res.end('Not found'); }
  try {
    const r = await blob.get(pathname, { access: ACCESS });
    if (!r || r.statusCode !== 200) { res.statusCode = 404; return res.end('Not found'); }
    res.statusCode = 200;
    res.setHeader('Content-Type', r.blob.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    const reader = r.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (e) {
    res.statusCode = 500;
    return res.end('Error');
  }
};

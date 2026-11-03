// Test-only private Blob substitute. Not imported by production or development.
const crypto = require('node:crypto');
function installFixture() {
  const documents = new Map();
  const fake = {
    async list({ prefix }) { return { blobs: [...documents.values()].filter(x => x.pathname.startsWith(prefix)).map(({ pathname, url }) => ({ pathname, url })), hasMore: false }; },
    async put(name, value, options) {
      const pathname = name.replace(/(\.[^.]+)$/, '-' + crypto.randomBytes(6).toString('hex') + '$1');
      const doc = { pathname, url: 'https://test-blob.example/' + pathname, value: Buffer.from(value), contentType: options.contentType };
      documents.set(pathname, doc); return doc;
    },
    async get(url) {
      const pathname = url.replace('https://test-blob.example/', '');
      const doc = documents.get(pathname); if (!doc) return null;
      return { statusCode: 200, blob: { contentType: doc.contentType }, stream: new ReadableStream({ start(c) { c.enqueue(doc.value); c.close(); } }) };
    },
    async del(urls) { for (const url of Array.isArray(urls) ? urls : [urls]) documents.delete(url.replace('https://test-blob.example/', '')); }
  };
  const id = require.resolve('@vercel/blob');
  require.cache[id] = { id, filename: id, loaded: true, exports: fake };
  process.env.BLOB_ACCESS = 'private';
  process.env.SESSION_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.ADMIN_EMAIL = 'owner@example.test';
  const password = crypto.randomBytes(30).toString('base64url');
  const users = require('../api/_lib/users');
  process.env.ADMIN_PASSWORD_HASH = users.hashPassword(password);
  return { password, documents };
}
module.exports = { installFixture };

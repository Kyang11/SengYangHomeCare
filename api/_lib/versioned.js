// Versioned JSON documents in Vercel Blob.
//
// Why: public Blob files are served through a CDN cache. Overwriting one file
// and reading it back can return an OLD copy for up to a minute, which made
// saves overwrite each other. Instead, every save writes a NEW file with a
// timestamped, never-reused name, and the newest one is found with list()
// (an API call that is not cached). Each file never changes, so reading it
// through the CDN is always correct. Older versions are kept as backups.
const blob = require('@vercel/blob');

const ACCESS = 'private';
function ensurePrivate() {
  if (process.env.BLOB_ACCESS !== 'private') throw new Error('A dedicated private Blob store is required.');
}
const KEEP = 20; // how many old versions to keep as backups

async function streamToString(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function listAll(prefix) {
  ensurePrivate();
  const out = [];
  let cursor;
  do {
    const r = await blob.list({ prefix, cursor, limit: 1000 });
    out.push(...(r.blobs || []));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  // Names start with a zero-padded timestamp, so sorting by name = by time.
  out.sort((a, b) => (a.pathname < b.pathname ? -1 : a.pathname > b.pathname ? 1 : 0));
  return out;
}

async function readJsonBlob(urlOrPath) {
  ensurePrivate();
  const r = await blob.get(urlOrPath, { access: ACCESS, useCache: false });
  if (!r || r.statusCode !== 200) return null;
  try { return JSON.parse(await streamToString(r.stream)); } catch (e) { return null; }
}

// Returns { data, version, versions } — data is null when nothing is saved yet.
async function readLatest(prefix, legacy) {
  const versions = await listAll(prefix);
  const latest = versions[versions.length - 1];
  if (latest) return { data: await readJsonBlob(latest.url), version: latest.pathname, versions };
  // One-time migration from the old single-file format.
  if (legacy) {
    const old = await legacy();
    if (old) return { data: old, version: null, versions };
  }
  return { data: null, version: null, versions };
}

async function writeNew(prefix, data, previous) {
  ensurePrivate();
  const stamp = String(Date.now()).padStart(15, '0');
  const result = await blob.put(`${prefix}v-${stamp}.json`, JSON.stringify(data), {
    access: ACCESS,
    contentType: 'application/json',
    addRandomSuffix: true,           // unique, unguessable name
    cacheControlMaxAge: 31536000,    // safe: this file never changes
  });
  // Prune old backups (best effort).
  const old = (previous || []).slice(0, Math.max(0, (previous || []).length - (KEEP - 1)));
  if (old.length) { try { await blob.del(old.map(b => b.url)); } catch (e) { /* ignore */ } }
  return result;
}

// Load newest → change → save as a new version. If someone else saved in the
// meantime, redo the change on top of their version so nothing is lost.
async function update(prefix, empty, change, legacy) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, version, versions } = await readLatest(prefix, legacy);
    const doc = data ? JSON.parse(JSON.stringify(data)) : empty();
    const result = change(doc);
    const written = await writeNew(prefix, doc, versions);
    // Did another save land between our read and our write?
    const after = await listAll(prefix);
    const between = after.filter(b => (!version || b.pathname > version) && b.pathname !== written.pathname && b.pathname < written.pathname);
    if (!between.length) return { doc, result };
    try { await blob.del(written.url); } catch (e) { /* ignore */ }
  }
  throw new Error('Could not save because someone else saved at the same time. Please try again.');
}

module.exports = { ACCESS, readLatest, readJsonBlob, update, listAll };

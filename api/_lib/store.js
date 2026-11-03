// Site content storage in Vercel Blob (no database).
// One JSON file holds every edit; uploaded images are separate blobs.
const sanitizeHtml = require('sanitize-html');
const versioned = require('./versioned');

const PREFIX = 'cms/content/';           // versioned saves: cms/content/v-<time>-<random>.json
const LEGACY_PATH = 'cms/content.json';  // old single-file format (read once for migration)
const ACCESS = versioned.ACCESS;
const MAX_FIELD = 20000;
const MAX_TOTAL = 1024 * 1024;

function emptyContent() { return { pages: {}, updatedAt: null, updatedBy: null }; }

function normalize(c) {
  return c && typeof c === 'object' && c.pages && typeof c.pages === 'object' ? c : emptyContent();
}

async function legacy() {
  try { return await versioned.readJsonBlob(LEGACY_PATH); } catch (e) { return null; }
}

// Small per-instance memo so busy pages don't list() on every request.
let memo = null;
async function loadContent(fresh) {
  if (!fresh && memo && Date.now() - memo.at < 5000) return { content: memo.content };
  const { data } = await versioned.readLatest(PREFIX, legacy);
  const content = normalize(data);
  memo = { at: Date.now(), content };
  return { content };
}

/* ── Sanitizing ── */

const HTML_OPTIONS = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'a', 'span', 'img', 'small', 'sup', 'sub', 'mark'],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'class'],
    span: ['class'],
    em: ['class'],
    strong: ['class'],
    img: ['src', 'alt', 'class', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tag, attribs) => {
      if (attribs.target === '_blank') attribs.rel = 'noopener';
      return { tagName: 'a', attribs };
    },
  },
};

function cleanHtml(html) {
  return sanitizeHtml(String(html || ''), HTML_OPTIONS).slice(0, MAX_FIELD);
}

function cleanUrl(url, isImage) {
  const u = String(url || '').trim();
  if (!u || u.length > 2000) return null;
  if (/^https:\/\//i.test(u)) return u;
  if (!isImage && /^(http:\/\/|mailto:|tel:)/i.test(u)) return u;
  // Relative paths / anchors: no scheme, not protocol-relative, no odd characters
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//') || /[\s"'<>\\`]/.test(u)) return null;
  return u;
}

function str(v) { return typeof v === 'string' ? v.slice(0, MAX_FIELD) : ''; }

// Keys: t:N = text block {o, h}; i:N = image {o, s, alt}; a:N = link {o, href}
function cleanEntry(key, e) {
  if (!e || typeof e !== 'object') return null;
  const type = key.split(':')[0];
  if (type === 't') return { o: str(e.o), h: cleanHtml(e.h) };
  if (type === 'i') {
    const s = cleanUrl(e.s, true);
    return s ? { o: str(e.o), s, alt: str(e.alt).slice(0, 300) } : null;
  }
  if (type === 'a') {
    const href = cleanUrl(e.href, false);
    return href ? { o: str(e.o), href } : null;
  }
  return null;
}

const SCOPE_RE = /^[a-z0-9_-]{1,40}$/i;
const KEY_RE = /^[tia]:\d{1,4}$/;

// changes = { scope: { key: entry | null } }  (null = reset to original)
function applyChanges(content, changes) {
  let count = 0;
  Object.keys(changes || {}).forEach(scope => {
    if (!SCOPE_RE.test(scope) || ['__proto__', 'constructor', 'prototype'].includes(scope)) return;
    const pageChanges = changes[scope];
    if (!pageChanges || typeof pageChanges !== 'object') return;
    const page = content.pages[scope] || (content.pages[scope] = {});
    Object.keys(pageChanges).forEach(key => {
      if (!KEY_RE.test(key)) return;
      const v = pageChanges[key];
      if (v === null) { delete page[key]; count++; return; }
      const clean = cleanEntry(key, v);
      if (clean) { page[key] = clean; count++; }
    });
    if (!Object.keys(page).length) delete content.pages[scope];
  });
  return count;
}

async function saveChanges(changes, user) {
  let count = 0;
  const { doc } = await versioned.update(PREFIX, emptyContent, content => {
    content = normalize(content);
    count = applyChanges(content, changes);
    content.updatedAt = new Date().toISOString();
    content.updatedBy = user;
    if (JSON.stringify(content).length > MAX_TOTAL) throw new Error('Content is too large.');
  }, legacy);
  memo = { at: Date.now(), content: doc };
  return { content: doc, count };
}

module.exports = { ACCESS, loadContent, saveChanges, applyChanges, cleanHtml, cleanUrl };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('navigation reuses the saved logo and reveals only the loaded business image', async () => {
  const asset = { url: '/api/image?p=cms%2Fimages%2Flogo.png', alt: 'Business logo' };
  const el = { tagName: 'IMG', dataset: { media: 'logo' }, style: {}, complete: false,
    getAttribute(name) { return this[name]; } };
  const stored = new Map([['site-logo-v1', JSON.stringify(asset)]]);
  let respond;
  const response = new Promise(resolve => { respond = resolve; });
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/media.js'), 'utf8'), {
    document: { querySelectorAll: () => [el] },
    sessionStorage: { getItem: key => stored.get(key), setItem: (k, v) => stored.set(k, v), removeItem: k => stored.delete(k) },
    fetch: () => response,
  });
  assert.equal(el.src, asset.url);
  assert.equal(el.style.visibility, 'hidden');
  el.onload();
  assert.equal(el.style.visibility, 'visible');
  respond({ json: async () => ({ assets: { logo: asset } }) });
  await new Promise(resolve => setImmediate(resolve));
  el.onload();
  assert.equal(el.style.visibility, 'visible');
  assert.equal(el.src, asset.url);
  el.onerror();
  assert.equal(el.style.visibility, 'hidden');
});

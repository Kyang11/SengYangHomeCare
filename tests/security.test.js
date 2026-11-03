const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installFixture } = require('./fixture');
const fixture = installFixture();
const { createServer } = require('../scripts/server');
const { cleanHtml, cleanUrl } = require('../api/_lib/store');
const { cleanAsset } = require('../api/media');
const crypto = require('node:crypto');

test('sanitization rejects executable HTML, protocols and invalid media', () => {
  assert.equal(cleanHtml('<img src=x onerror="alert(1)"><script>alert(1)</script><b>safe</b>').includes('onerror'), false);
  assert.equal(cleanUrl('javascript:alert(1)'), null);
  assert.equal(cleanAsset('logo', { url: '//evil.test/a.png' }), null);
  assert.equal(cleanAsset('video-1', { url: 'https://example.com/page.html' }), null);
  assert.equal(cleanAsset('video-1', { url: 'https://www.youtube.com/watch?v=abcdefghijk' }).url.includes('youtube'), true);
});

test('real HTTP auth, permissions, private media, saves and session revocation', async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  async function api(path, method = 'GET', body, auth = true, header = true) {
    return fetch(base + '/api/' + path, { method, headers: { 'Content-Type': 'application/json', ...(header ? { 'X-SYH-CMS': '1' } : {}), ...(auth && cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  }
  try {
    assert.equal((await api('content', 'PUT', { changes: {} }, false)).status, 401);
    assert.equal((await api('users', 'POST', {}, false)).status, 401);
    assert.equal((await api('media', 'PUT', { assets: {} }, false)).status, 401);
    assert.equal((await api('upload', 'POST', {}, false)).status, 401);
    assert.equal((await api('login', 'POST', {}, false, false)).status, 403);
    assert.equal((await fetch(base + '/.env.local')).status, 404);
    assert.equal((await fetch(base + '/api/_lib/users')).status, 404);
    const oldHash = process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_PASSWORD_HASH;
    assert.equal((await require('../api/_lib/users').checkLogin(process.env.ADMIN_EMAIL, fixture.password)), null);
    process.env.ADMIN_PASSWORD_HASH = oldHash;
    const login = await api('login', 'POST', { username: process.env.ADMIN_EMAIL, password: fixture.password });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly; SameSite=Lax/); cookie = setCookie.split(';')[0];
    assert.equal((await (await api('me')).json()).role, 'admin');
    const changes = { index: { 't:0': { o: 'original', h: '<strong>Published</strong><script>bad()</script>' } } };
    assert.equal((await api('content', 'PUT', { changes })).status, 200);
    assert.equal((await (await api('content?fresh=1', 'GET', null, false)).json()).pages.index['t:0'].h, '<strong>Published</strong>');
    assert.equal((await api('upload', 'POST', { contentType: 'image/png', data: Buffer.from('not an image').toString('base64') })).status, 400);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';
    const uploaded = await (await api('upload', 'POST', { contentType: 'image/png', filename: 'logo.png', data: png })).json();
    assert.match(uploaded.url, /^\/api\/image/);
    assert.equal((await fetch(base + uploaded.url)).status, 200);
    assert.equal((await fetch(base + '/api/image?p=cms%2Fprivate%2Fusers.json')).status, 404);
    assert.equal((await api('media', 'PUT', { assets: { logo: { url: uploaded.url, alt: 'New logo' } } })).status, 200);
    assert.equal((await (await api('media')).json()).assets.logo.alt, 'New logo');
    const viewerPassword = crypto.randomBytes(24).toString('hex');
    assert.equal((await api('users', 'POST', { action: 'create', username: 'viewer@example.test', password: viewerPassword, role: 'viewer' })).status, 200);
    const adminCookie = cookie;
    const viewerLogin = await api('login', 'POST', { username: 'viewer@example.test', password: viewerPassword }); cookie = viewerLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await api('content', 'PUT', { changes })).status, 403);
    assert.equal((await api('media', 'PUT', { assets: {} })).status, 403);
    assert.equal((await api('users')).status, 403);
    const viewerCookie = cookie; cookie = adminCookie;
    assert.equal((await api('users', 'POST', { action: 'delete', username: 'viewer@example.test' })).status, 200);
    cookie = viewerCookie; assert.equal((await (await api('me')).json()).user, null);
    cookie = adminCookie;
    const blocked = await fetch(base + '/api/media', { method: 'PUT', headers: { Cookie: cookie, 'X-SYH-CMS': '1', Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(blocked.status, 403);
    process.env.ADMIN_PASSWORD_HASH = require('../api/_lib/users').hashPassword(crypto.randomBytes(24).toString('hex'));
    assert.equal((await (await api('me')).json()).user, null);
    for (const doc of fixture.documents.values()) assert.equal(doc.value.includes(fixture.password), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

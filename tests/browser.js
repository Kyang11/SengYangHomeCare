const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installFixture } = require('./fixture');
const fixture = installFixture();
const { createServer } = require('../scripts/server');
async function main() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const artifacts = path.resolve(__dirname, '..', 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 950 });
      for (const name of ['index', 'about', 'services', 'training', 'employment', 'contact', 'admin']) {
        const response = await page.goto(base + '/' + name + '.html'); assert.equal(response.status(), 200);
        await page.waitForFunction(() => !document.documentElement.classList.contains('cms-pending'));
        assert.equal(await page.locator('h1,h2').first().isVisible(), true);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        assert.equal(overflow, false, name + ' overflows at ' + width);
        if (name === 'index' && width !== 768) {
          await page.screenshot({ path: path.join(artifacts, 'home-' + width + '.png'), fullPage: true });
          await page.screenshot({ path: path.join(artifacts, 'home-viewport-' + width + '.png') });
        }
      }
    }
    await page.goto(base + '/index.html'); await page.locator('#navToggle').click();
    assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#primaryNav a[href="services.html"]').click(); await page.waitForURL('**/services.html');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '/admin.html'); await page.locator('#adminUser').fill('owner@example.test'); await page.locator('#adminPass').fill(fixture.password); await page.locator('#adminLoginBtn').click();
    await page.locator('#adminApp').waitFor({ state: 'visible' });
    await page.locator('[data-panel=media]').click(); await page.locator('#media-logo').waitFor();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
    await page.getByLabel('Upload Shared logo').setInputFiles({ name: 'test-logo.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => document.getElementById('media-logo').value.startsWith('/api/image'));
    await page.locator('#alt-logo').fill('Sample uploaded logo');
    await page.locator('#media-video-1').fill('https://www.youtube.com/watch?v=abcdefghijk');
    await page.locator('#alt-video-1').fill('Sample configured video');
    await page.getByRole('button', { name: 'Save media', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('mediaMessage').textContent.includes('Media saved'));
    await page.screenshot({ path: path.join(artifacts, 'admin-media.png'), fullPage: true });
    await page.goto(base + '/index.html?edit=1'); await page.locator('h1[contenteditable=true]').waitFor();
    await page.locator('h1').fill('Sample care, edited in the browser.');
    await page.locator('.logo-text').first().fill('Seng Yang Home Care · Edited sample');
    await page.locator('.site-footer .foot-blurb').fill('Sample shared footer edited from admin.');
    await page.locator('[data-act=save]').click();
    await page.waitForFunction(() => document.querySelector('[data-act=save]').disabled);
    const visitor = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const publicPage = await visitor.newPage();
    await publicPage.goto(base + '/index.html'); await publicPage.waitForFunction(() => document.querySelector('h1').textContent.includes('edited in the browser'));
    assert.equal(await publicPage.locator('[data-media=logo]').first().getAttribute('alt'), 'Sample uploaded logo');
    await publicPage.goto(base + '/about.html'); await publicPage.waitForFunction(() => document.querySelector('.foot-blurb').textContent.includes('edited from admin'));
    assert.match(await publicPage.locator('.logo-text').first().textContent(), /Edited sample/);
    await publicPage.goto(base + '/training.html'); await publicPage.waitForFunction(() => document.querySelector('[data-media="video-1"]').dataset.video === 'abcdefghijk');
    publicPage.once('dialog', dialog => dialog.accept()); await publicPage.locator('[data-media="video-2"]').click();
    assert.equal(await publicPage.locator('#videoModal').evaluate(el => el.classList.contains('open')), false);
    await page.goto(base + '/index.html?edit=1'); await page.locator('h1[contenteditable=true]').waitFor(); await page.locator('h1').click(); await page.locator('[data-act=reset]').click(); await page.locator('[data-act=save]').click();
    await page.waitForFunction(() => document.querySelector('[data-act=save]').disabled);
    await publicPage.goto(base + '/index.html'); await publicPage.waitForFunction(() => document.querySelector('h1').textContent.includes('Compassionate care'));
    await page.locator('[data-act=logout]').click(); await page.waitForFunction(() => !document.querySelector('.cms-bar'));
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: 7 pages at 3 widths; mobile menu; login/logout; image upload; video setup; content/header/footer publish; reset; independent visitor verification.');
    await visitor.close(); await context.close();
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

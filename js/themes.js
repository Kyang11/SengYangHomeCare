(function () {
  'use strict';
  var palettes = {
    navy: ['Midnight Navy', '#142b4a', '#203e63', '#c4dcff'],
    ocean: ['Ocean Blue', '#123e63', '#1b527b', '#c6e8ff'],
    forest: ['Forest Green', '#173e32', '#255341', '#c9ead7'],
    plum: ['Royal Plum', '#432348', '#59345e', '#efcff3'],
    burgundy: ['Burgundy', '#541f33', '#6c3045', '#ffd4df'],
    slate: ['Modern Slate', '#293746', '#3c4b5d', '#d6e6f5'],
    indigo: ['Deep Indigo', '#29275b', '#403b77', '#ddd9ff'],
    espresso: ['Warm Espresso', '#402d24', '#594035', '#f4ddc6'],
    teal: ['Deep Teal', '#124344', '#20595a', '#c6edec'],
    charcoal: ['Charcoal', '#26292f', '#3d424b', '#e0e5ed']
  };
  var page = location.pathname.split('/').pop().replace(/\.html$/i, '') || 'index';
  if (page === 'admin') return;
  var targets = [];
  function target(el, key, name) { if (el) targets.push({ el: el, key: key, name: name }); }
  target(document.querySelector('.site-header'), 'header', 'Header (all pages)');
  document.querySelectorAll('main > section').forEach(function (el, i) {
    var heading = el.querySelector('h1,h2,h3');
    target(el, page + ':s' + i, heading ? heading.textContent.trim().slice(0, 65) : 'Section ' + (i + 1));
  });
  target(document.querySelector('.site-footer'), 'footer', 'Footer (all pages)');
  var saved = { sections: {} };
  var style = document.createElement('style');
  style.textContent = '.color-section{background:var(--section-bg)!important;color:#fff!important;--teal-900:var(--section-bg);--teal-700:var(--section-panel)}' +
    '.color-section :is(h1,h2,h3,h4,h5,p,li,label,.eyebrow,.logo-text,.logo-text small,.crumbs,.crumbs a,.accent,em){color:#fff!important}' +
    '.color-section :is(a,.footer-grid a:hover){color:var(--section-accent)}' +
    '.color-section :is(.hero-bg){background:transparent!important}' +
    '.color-section :is(.hero-card,.svc-card,.train-card,.service-block,.employment-hero-card,.application-shell,.application-form,.app-panel,.form,.contact-card,[class*="card"],.form-section,.form-section-head,.form-check,.file-drop,.employment-step,.employment-stat,.app-tabs,.app-tab,.app-intro,.form-demo-note){background:var(--section-panel)!important;color:#fff!important}' +
    '.color-section :is(input,textarea,select){background:#fff!important;color:#18263a!important}' +
    '.color-section :is(.btn,.btn-primary,.btn-nav){background:#fff!important;color:#18263a!important;border-color:#fff!important}' +
    '.color-section .nav{background:var(--section-bg)}.color-section .nav a{color:#fff!important}' +
    '.color-section .nav a:hover,.color-section .nav a.active{background:var(--section-panel)!important;color:#fff!important}' +
    '.color-section .nav a.btn-nav{background:#fff!important;color:#18263a!important}' +
    '.color-section :focus-visible{outline-color:var(--section-accent)!important}' +
    '.color-tools{position:fixed;right:16px;bottom:90px;z-index:11000;background:#fff;color:#18263a;border:1px solid #bbc8da;border-radius:16px;padding:16px;box-shadow:0 8px 32px #0004;width:min(360px,calc(100vw - 32px));max-height:75vh;overflow:auto;font:15px/1.5 system-ui}' +
    '.color-tools[hidden]{display:none}.color-tools label{display:block;font-weight:700;margin:8px 0}.color-tools select{width:100%;padding:10px;color:#18263a;background:#fff}.color-options{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0}.color-options button{border:3px solid transparent;border-radius:8px;padding:10px;color:#fff;cursor:pointer}.color-options button[aria-pressed=true]{border-color:#ffcc55}.color-actions{display:flex;gap:8px}.color-actions button,.color-launch{padding:10px;border:1px solid #bccada;border-radius:8px;cursor:pointer;background:#142b4a;color:#fff}.color-launch{position:fixed;right:16px;bottom:20px;z-index:10999}.color-tools button:focus-visible{outline:3px solid #2459c4;outline-offset:2px}';
  document.head.appendChild(style);
  function apply(data) {
    targets.forEach(function (t) {
      var palette = palettes[(data.sections || {})[t.key]];
      t.el.classList.toggle('color-section', !!palette);
      if (palette) {
        t.el.style.setProperty('--section-bg', palette[1]);
        t.el.style.setProperty('--section-panel', palette[2]);
        t.el.style.setProperty('--section-accent', palette[3]);
      }
    });
  }
  var ready = fetch('/api/themes').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (data) { saved = data; apply(saved); }).catch(function () {});
  fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (me) {
    if (me.role !== 'admin') return;
    return ready.then(function () {
      var launch = document.createElement('button'); launch.className = 'color-launch'; launch.textContent = 'Section colors'; launch.type = 'button';
      var panel = document.createElement('aside'); panel.className = 'color-tools'; panel.hidden = true; panel.setAttribute('aria-label', 'Section colors'); panel.setAttribute('data-no-edit', '');
      panel.innerHTML = '<strong>Section color templates</strong><label for="color-target">Choose a section</label><select id="color-target"></select><div class="color-options"></div><div class="color-actions"><button type="button" data-color-save>Save colors</button><button type="button" data-color-reset>Original colors</button><button type="button" data-color-close>Close</button></div><div role="status" aria-live="polite"></div>';
      var select = panel.querySelector('select'), options = panel.querySelector('.color-options'), selected = null;
      targets.forEach(function (t) { var option = document.createElement('option'); option.value = t.key; option.textContent = t.name; select.appendChild(option); });
      function refresh() { options.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.palette === selected)); }); }
      function preview() { var data = { sections: Object.assign({}, saved.sections) }; data.sections[select.value] = selected; apply(data); refresh(); }
      Object.keys(palettes).forEach(function (key) { var b = document.createElement('button'); b.type = 'button'; b.dataset.palette = key; b.textContent = palettes[key][0]; b.style.background = palettes[key][1]; b.onclick = function () { selected = key; preview(); }; options.appendChild(b); });
      function choose() { apply(saved); selected = (saved.sections || {})[select.value] || null; refresh(); panel.querySelector('[role=status]').textContent = ''; }
      select.onchange = choose;
      launch.onclick = function () { panel.hidden = !panel.hidden; if (!panel.hidden) choose(); else apply(saved); };
      panel.querySelector('[data-color-close]').onclick = function () { panel.hidden = true; apply(saved); launch.focus(); };
      panel.querySelector('[data-color-reset]').onclick = function () { selected = null; preview(); };
      panel.querySelector('[data-color-save]').onclick = async function () {
        var button = this; button.disabled = true; select.disabled = true;
        options.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        try {
          var response = await fetch('/api/themes', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-SYH-CMS': '1' }, body: JSON.stringify({ target: select.value, preset: selected }) });
          var data = await response.json(); if (!response.ok) throw new Error(data.error || 'Save failed');
          saved = data; apply(saved); panel.querySelector('[role=status]').textContent = 'Colors saved for all visitors.';
        } catch (error) { panel.querySelector('[role=status]').textContent = error.message; }
        finally { button.disabled = false; select.disabled = false; options.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); }
      };
      document.body.appendChild(launch); document.body.appendChild(panel); choose();
    });
  }).catch(function () {});
})();

(function () {
  'use strict';
  var form = document.getElementById('mediaForm');
  if (!form) return;
  var message = document.getElementById('mediaMessage');
  var fields = document.getElementById('mediaFields');
  var slots = [['logo', 'Shared logo'], ['homeImage', 'Home photo'], ['aboutImage', 'About / team photo']];
  for (var i = 1; i <= 11; i++) slots.push(['video-' + i, 'Training video ' + i]);
  var pending = {};
  function request(path, method, body) {
    return fetch('/api/' + path, { method: method || 'GET', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-SYH-CMS': '1' }, body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Request failed.'); return d; }); });
  }
  slots.forEach(function (slot) {
    var key = slot[0];
    var box = document.createElement('div'); box.className = 'media-field';
    var label = document.createElement('label'); label.htmlFor = 'media-' + key; label.textContent = slot[1]; box.appendChild(label);
    var url = document.createElement('input'); url.type = 'text'; url.id = 'media-' + key; url.placeholder = 'HTTPS URL — blank restores placeholder'; box.appendChild(url);
    var altLabel = document.createElement('label'); altLabel.htmlFor = 'alt-' + key; altLabel.textContent = key.startsWith('video-') ? 'Video description' : 'Image description (alt text)'; box.appendChild(altLabel);
    var alt = document.createElement('input'); alt.type = 'text'; alt.id = 'alt-' + key; alt.maxLength = 300; box.appendChild(alt);
    if (!key.startsWith('video-')) {
      var upload = document.createElement('input'); upload.type = 'file'; upload.accept = 'image/jpeg,image/png,image/webp,image/gif'; upload.setAttribute('aria-label', 'Upload ' + slot[1]); box.appendChild(upload);
      upload.addEventListener('change', async function () {
        var file = upload.files[0]; if (!file) return;
        if (file.size > 3 * 1024 * 1024) { message.textContent = 'Image too large. Maximum 3 MB.'; return; }
        message.textContent = 'Uploading image…';
        var reader = new FileReader();
        reader.onload = async function () {
          try {
            var result = await request('upload', 'POST', { filename: file.name, contentType: file.type, data: String(reader.result).split(',')[1] });
            url.value = result.url; pending[key] = true; message.textContent = 'Image uploaded. Choose Save media to publish it.';
          } catch (e) { message.textContent = e.message; }
        };
        reader.readAsDataURL(file);
      });
    }
    url.addEventListener('input', function () { pending[key] = true; });
    alt.addEventListener('input', function () { pending[key] = true; });
    fields.appendChild(box);
  });
  async function load() {
    try {
      var data = await request('media');
      slots.forEach(function (slot) {
        var a = (data.assets || {})[slot[0]] || {};
        document.getElementById('media-' + slot[0]).value = a.url || '';
        document.getElementById('alt-' + slot[0]).value = a.alt || '';
      });
      if (data.error) message.textContent = 'Storage is not configured. Follow README.md to enable publishing.';
    } catch (e) { message.textContent = e.message; }
  }
  form.addEventListener('submit', async function (e) {
    e.preventDefault(); var assets = {};
    Object.keys(pending).forEach(function (key) { assets[key] = { url: document.getElementById('media-' + key).value, alt: document.getElementById('alt-' + key).value }; });
    var button = form.querySelector('button[type=submit]'); button.disabled = true;
    try { await request('media', 'PUT', { assets: assets }); pending = {}; message.textContent = 'Media saved. Changes appear on the public pages.'; }
    catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.querySelector('[data-panel=media]').addEventListener('click', load);
  window.addEventListener('beforeunload', function (e) { if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = ''; } });
})();

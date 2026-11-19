(function () {
  'use strict';
  var logoKey = 'site-logo-v1';
  function showLogo(el, asset) {
    var url = asset.url;
    el.style.visibility = 'hidden';
    el.onload = function () { if (el.getAttribute('src') === url) el.style.visibility = 'visible'; };
    el.onerror = function () { el.style.visibility = 'hidden'; };
    el.src = url;
    if (asset.alt) el.alt = asset.alt;
    if (el.complete && el.naturalWidth) el.style.visibility = 'visible';
  }
  try {
    var cachedLogo = JSON.parse(sessionStorage.getItem(logoKey));
    if (cachedLogo && typeof cachedLogo.url === 'string' && /^(\/api\/image\?|https:\/\/)/.test(cachedLogo.url)) {
      document.querySelectorAll('img[data-media="logo"]').forEach(function (el) { showLogo(el, cachedLogo); });
    }
  } catch (_) { /* Storage can be disabled. */ }
  fetch('/api/media').then(function (r) { return r.json(); }).then(function (data) {
    try {
      if (data.assets && data.assets.logo && data.assets.logo.url) sessionStorage.setItem(logoKey, JSON.stringify(data.assets.logo));
      else sessionStorage.removeItem(logoKey);
    } catch (_) { /* Storage can be disabled. */ }
    document.querySelectorAll('[data-media]').forEach(function (el) {
      var asset = (data.assets || {})[el.dataset.media];
      if (!asset || !asset.url) {
        if (el.dataset.media === 'logo') el.style.visibility = 'hidden';
        return;
      }
      if (el.tagName === 'IMG' && el.dataset.media === 'logo') { showLogo(el, asset); return; }
      if (el.tagName === 'IMG') {
        el.src = asset.url;
        if (asset.alt) el.alt = asset.alt;
      } else if (el.classList.contains('video-btn')) {
        var url = new URL(asset.url);
        if (/^(www\.)?(youtube\.com|youtu\.be)$/.test(url.hostname)) {
          el.dataset.video = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
        } else { el.dataset.videoSrc = asset.url; }
        var text = el.querySelector('p');
        if (text) text.textContent = asset.alt || 'Watch video';
      }
    });
    if (typeof updateVideoWatchStatus === 'function') updateVideoWatchStatus();
  }).catch(function () { /* Keep static placeholders when offline/unconfigured. */ });
})();

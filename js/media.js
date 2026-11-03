(function () {
  'use strict';
  fetch('/api/media').then(function (r) { return r.json(); }).then(function (data) {
    document.querySelectorAll('[data-media]').forEach(function (el) {
      var asset = (data.assets || {})[el.dataset.media];
      if (!asset || !asset.url) return;
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

/* Seng Yang Home Care — inline content editor.
 *
 * Visitors: loads saved edits from /api/content and applies them to the page.
 * Logged-in admins: shows an edit bar to change text, links and images in place.
 *
 * How edits are matched to the page: every editable block gets a key based on
 * its position (t:0, t:1 … for text, i:N for images, a:N for links). Each saved
 * edit also stores the block's ORIGINAL text. If a developer later changes the
 * HTML so the block no longer matches, the old edit is skipped instead of
 * landing in the wrong place.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  function reveal() { root.classList.remove('cms-pending'); }

  var page = (function () {
    var p = location.pathname.replace(/\/+$/, '').split('/').pop() || 'index';
    return p.replace(/\.html$/i, '') || 'index';
  })();
  if (page === 'admin') { reveal(); return; }

  var TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,th,td,dt,dd,.eyebrow,a.btn,.trust-item strong,.trust-item span,.card-icon,.svc-icon';
  var FOOTER_SEL = 'h5,p,a';
  var SKIP = 'form, button, #quizApp, .video-modal, [data-no-edit], .cms-bar, script, style, noscript';
  var BLOCKERS = '[id],input,select,textarea,button,iframe,form,svg,video,audio';
  var SINGLE_LINE = /^(H[1-6]|A|SPAN|STRONG|LI|TD|TH|DT|DD)$/;

  var registry = [];  // {type, el, scope, key, orig, origHtml, origSrc, origHref}
  var byEl = new Map();
  var dirty = new Set();
  var user = null;
  var editing = false;
  var bar = null;
  var lastImage = null;
  var fileInput = null;

  /* ── Helpers ── */
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function sig(el) {
    var t = norm(el.textContent);
    return t || norm(el.innerHTML);
  }
  function api(path, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign({ 'X-SYH-CMS': '1' }, opts.headers || {});
    if (opts.json !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }
    return fetch('/api/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ('Request failed (' + r.status + ')'));
        return data;
      });
    });
  }

  /* ── Build the list of editable things (from the untouched page) ── */
  function collect() {
    var regions = [];
    var main = document.querySelector('main');
    var foot = document.querySelector('.site-footer');
    var head = document.querySelector('.site-header');
    if (head) regions.push({ el: head, scope: '_header', sel: '.logo-text, nav a' });
    if (main) regions.push({ el: main, scope: page, sel: TEXT_SEL });
    if (foot) regions.push({ el: foot, scope: '_footer', sel: FOOTER_SEL + ',.logo-text,.foot-bottom > span' });

    regions.forEach(function (region) {
      var cands = Array.prototype.filter.call(region.el.querySelectorAll(region.sel), function (el) {
        if (el.closest(SKIP) || el.id) return false;
        if (el.querySelector(BLOCKERS)) return false;
        return norm(el.textContent) || el.querySelector('img');
      });
      // Keep only the outermost block (a <strong> inside a <p> is edited with the <p>).
      var texts = cands.filter(function (el) {
        return !cands.some(function (other) { return other !== el && other.contains(el); });
      });
      texts.forEach(function (el, i) {
        add({ type: 't', el: el, scope: region.scope, key: 't:' + i, orig: sig(el), origHtml: el.innerHTML });
      });

      var insideText = function (node) { return texts.some(function (t) { return t !== node && t.contains(node); }); };

      var imgs = Array.prototype.filter.call(region.el.querySelectorAll('img'), function (img) {
        return !img.hasAttribute('data-media') && !img.closest(SKIP) && !insideText(img);
      });
      imgs.forEach(function (img, i) {
        add({ type: 'i', el: img, scope: region.scope, key: 'i:' + i, orig: img.getAttribute('src') || '',
              origSrc: img.getAttribute('src') || '', origAlt: img.getAttribute('alt') || '' });
      });

      var links = Array.prototype.filter.call(region.el.querySelectorAll('a[href]'), function (a) {
        return !a.closest(SKIP) && !insideText(a);
      });
      links.forEach(function (a, i) {
        add({ type: 'a', el: a, scope: region.scope, key: 'a:' + i, orig: a.getAttribute('href') || '',
              origHref: a.getAttribute('href') || '' });
      });
    });
  }
  function add(item) {
    registry.push(item);
    if (!byEl.has(item.el)) byEl.set(item.el, {});
    byEl.get(item.el)[item.type] = item;
  }
  function find(type, el) { var m = byEl.get(el); return m ? m[type] : null; }
  function id(item) { return item.scope + '|' + item.key; }

  /* ── Apply saved content ── */
  function apply(content) {
    var pages = (content && content.pages) || {};
    registry.forEach(function (item) {
      var e = (pages[item.scope] || {})[item.key];
      if (!e || e.o !== item.orig) return; // missing or stale
      if (item.type === 't' && typeof e.h === 'string') item.el.innerHTML = e.h;
      if (item.type === 'i' && e.s) { item.el.src = e.s; if (e.alt) item.el.alt = e.alt; }
      if (item.type === 'a' && e.href) item.el.setAttribute('href', e.href);
    });
  }

  function loadContent(fresh) {
    return api('content' + (fresh ? '?fresh=1' : ''), { method: 'GET' }).then(apply);
  }

  /* ── Edit mode ── */
  function injectStyles() {
    var css = '' +
      '.cms-editing [data-cms-t]{outline:1px dashed rgba(73,107,85,.45);outline-offset:3px;border-radius:3px;cursor:text;transition:outline-color .15s}' +
      '.cms-editing [data-cms-t]:hover{outline:2px dashed #496b55}' +
      '.cms-editing [data-cms-t]:focus{outline:2px solid #86516a;background:rgba(255,255,255,.55)}' +
      '.cms-editing [data-cms-dirty]{outline-color:#86516a !important}' +
      '.cms-editing img{cursor:pointer}' +
      '.cms-editing img:hover{outline:3px solid #86516a;outline-offset:2px}' +
      '.cms-editing img.cms-selected{outline:3px solid #496b55;outline-offset:2px}' +
      '.cms-editing main a,.cms-editing .site-footer a{cursor:text}' +
      '.cms-bar{position:fixed;left:12px;right:12px;bottom:18px;margin:0 auto;width:max-content;z-index:9999;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;' +
        'max-width:calc(100vw - 24px);box-sizing:border-box;padding:8px 10px;background:#263f36;color:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:500 14px/1.2 "Plus Jakarta Sans",system-ui,sans-serif}' +
      '.cms-bar button{font:inherit;color:#fff;background:rgba(255,255,255,.1);border:0;border-radius:9px;padding:8px 12px;cursor:pointer;white-space:nowrap}' +
      '.cms-bar button:hover{background:rgba(255,255,255,.2)}' +
      '.cms-bar button:disabled{opacity:.45;cursor:default}' +
      '.cms-bar .cms-primary{background:#86516a}.cms-bar .cms-primary:hover{background:#6f3d55}' +
      '.cms-bar .cms-who{opacity:.8;padding:0 6px;font-size:13px}' +
      '.cms-bar .cms-sep{width:1px;height:22px;background:rgba(255,255,255,.2)}' +
      '.cms-bar [data-edit-only]{display:none}.cms-editing .cms-bar [data-edit-only]{display:inline-block}' +
      '.cms-editing .cms-bar [data-view-only]{display:none}' +
      '.cms-toast{position:fixed;left:50%;bottom:96px;max-width:calc(100vw - 32px);transform:translateX(-50%);z-index:10000;background:#1a1f24;color:#fff;padding:10px 16px;border-radius:10px;font:500 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.2)}' +
      '.cms-toast.err{background:#b3412a}' +
      '.cms-editing body{padding-bottom:110px}' +
      '@media (max-width:720px){.cms-bar{bottom:10px;gap:4px;padding:6px}.cms-bar button{padding:7px 9px;font-size:13px}.cms-bar .cms-who,.cms-bar .cms-sep{display:none !important}}';
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  var toastTimer;
  function toast(msg, isErr) {
    var t = document.querySelector('.cms-toast');
    if (!t) { t = document.createElement('div'); t.className = 'cms-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, isErr ? 6000 : 2500);
  }

  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'cms-bar';
    bar.innerHTML =
      '<span class="cms-who"></span>' +
      '<button type="button" class="cms-primary" data-act="edit" data-view-only>✎ Edit this page</button>' +
      '<button type="button" data-act="bold" data-edit-only title="Bold (Ctrl+B)"><b>B</b></button>' +
      '<button type="button" data-act="italic" data-edit-only title="Italic (Ctrl+I)"><i>I</i></button>' +
      '<button type="button" data-act="link" data-edit-only title="Add or change a link">Link</button>' +
      '<button type="button" data-act="image" data-edit-only title="Replace the selected image, or insert one at the cursor">Image</button>' +
      '<button type="button" data-act="reset" data-edit-only title="Put the selected block back to the original">Reset block</button>' +
      '<span class="cms-sep" data-edit-only></span>' +
      '<button type="button" class="cms-primary" data-act="save" data-edit-only disabled>Save</button>' +
      '<button type="button" data-act="done" data-edit-only>Done</button>' +
      '<span class="cms-sep"></span>' +
      '<button type="button" data-act="admin">Dashboard</button>' +
      '<button type="button" data-act="logout">Log out</button>';
    bar.querySelector('.cms-who').textContent = 'Signed in as ' + user;
    // Keep the text selection when clicking toolbar buttons.
    bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'edit') startEditing();
      else if (act === 'bold') document.execCommand('bold');
      else if (act === 'italic') document.execCommand('italic');
      else if (act === 'link') editLink();
      else if (act === 'image') pickImage();
      else if (act === 'reset') resetBlock();
      else if (act === 'save') save();
      else if (act === 'done') stopEditing();
      else if (act === 'admin') location.href = 'admin.html';
      else if (act === 'logout') logout();
    });
    document.body.appendChild(bar);
  }

  function updateSaveButton() {
    if (!bar) return;
    var btn = bar.querySelector('[data-act="save"]');
    btn.disabled = dirty.size === 0;
    btn.textContent = dirty.size ? 'Save (' + dirty.size + ')' : 'Save';
  }

  function markDirty(item) {
    dirty.add(item);
    if (item.el) item.el.setAttribute('data-cms-dirty', '');
    updateSaveButton();
  }

  function setEditParam(on) {
    try {
      var url = new URL(location.href);
      if (on) url.searchParams.set('edit', '1'); else url.searchParams.delete('edit');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) { /* ignore */ }
  }

  function startEditing() {
    if (editing) return;
    editing = true;
    setEditParam(true);
    root.classList.add('cms-editing');
    registry.forEach(function (item) {
      if (item.type !== 't') return;
      item.el.setAttribute('contenteditable', 'true');
      item.el.setAttribute('data-cms-t', '');
      item.el.setAttribute('spellcheck', 'true');
    });
  }

  function stopEditing() {
    if (dirty.size && !confirm('You have unsaved changes. Discard them?')) return;
    if (dirty.size) { dirty.clear(); setEditParam(false); location.reload(); return; }
    editing = false;
    setEditParam(false);
    root.classList.remove('cms-editing');
    registry.forEach(function (item) {
      if (item.type !== 't') return;
      item.el.removeAttribute('contenteditable');
      item.el.removeAttribute('data-cms-t');
      item.el.removeAttribute('spellcheck');
    });
    if (lastImage) lastImage.classList.remove('cms-selected');
    lastImage = null;
  }

  function currentBlock() {
    var sel = window.getSelection();
    var node = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    if (node && node.nodeType === 3) node = node.parentNode;
    var el = node && node.closest ? node.closest('[data-cms-t]') : null;
    if (!el && document.activeElement && document.activeElement.hasAttribute &&
        document.activeElement.hasAttribute('data-cms-t')) el = document.activeElement;
    return el ? find('t', el) : null;
  }

  function resetBlock() {
    var item = currentBlock();
    if (!item && lastImage) item = find('i', lastImage);
    if (!item) { toast('Click inside a block (or an image) first.'); return; }
    if (item.type === 't') item.el.innerHTML = item.origHtml;
    if (item.type === 'i') { item.el.setAttribute('src', item.origSrc); item.el.setAttribute('alt', item.origAlt); }
    markDirty(item);
    toast('Block reset. Click Save to keep it.');
  }

  function editLink() {
    var block = currentBlock();
    if (!block) { toast('Click inside the text you want to link first.'); return; }
    var sel = window.getSelection();
    var node = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    if (node && node.nodeType === 3) node = node.parentNode;
    var innerA = node && node.closest ? node.closest('a') : null;

    // 1) Link inside the text block (saved as part of the block's HTML)
    if (innerA && block.el.contains(innerA) && innerA !== block.el) {
      var url1 = prompt('Link address (leave empty to remove the link):', innerA.getAttribute('href') || '');
      if (url1 === null) return;
      if (!url1.trim()) { innerA.replaceWith.apply(innerA, Array.prototype.slice.call(innerA.childNodes)); }
      else innerA.setAttribute('href', url1.trim());
      markDirty(block);
      return;
    }
    // 2) The block is itself a link or sits inside a link card (e.g. buttons, training cards)
    var outerA = block.el.closest('a');
    var linkItem = outerA ? find('a', outerA) : null;
    if (linkItem) {
      var url2 = prompt('Where should this link go?', outerA.getAttribute('href') || '');
      if (url2 === null || !url2.trim()) return;
      outerA.setAttribute('href', url2.trim());
      markDirty(linkItem);
      return;
    }
    // 3) New link on the selected text
    if (sel.isCollapsed) { toast('Select some text first, then click Link.'); return; }
    var url3 = prompt('Link address (e.g. https://… , contact.html, tel:6515551234):', 'https://');
    if (!url3 || !url3.trim() || url3.trim() === 'https://') return;
    document.execCommand('createLink', false, url3.trim());
    markDirty(block);
  }

  /* ── Images ── */
  var pendingInsert = null;

  function pickImage() {
    if (lastImage && document.contains(lastImage)) { pendingInsert = null; openPicker(); return; }
    var block = currentBlock();
    if (!block) { toast('Click an image to replace it, or click in text to insert a new image.'); return; }
    var sel = window.getSelection();
    pendingInsert = { block: block, range: sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
    openPicker();
  }

  function openPicker() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (f) handleFile(f);
      });
      document.body.appendChild(fileInput);
    }
    fileInput.click();
  }

  function shrink(file) {
    // GIFs keep their animation, so send them as-is.
    if (file.type === 'image/gif') return Promise.resolve(file);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var max = 1800;
        var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') return resolve(b);
          c.toBlob(function (j) { j ? resolve(j) : reject(new Error('Could not read image.')); }, 'image/jpeg', 0.85);
        }, 'image/webp', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')); };
      img.src = url;
    });
  }

  function toBase64(b) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(b);
    });
  }

  function handleFile(file) {
    var target = lastImage && document.contains(lastImage) ? lastImage : null;
    var insert = target ? null : pendingInsert;
    toast('Uploading image…');
    shrink(file).then(function (b) {
      if (b.size > 3 * 1024 * 1024) throw new Error('Image is too large (max 3 MB).');
      return toBase64(b).then(function (data) {
        return api('upload', { method: 'POST', json: { filename: file.name, contentType: b.type, data: data } });
      });
    }).then(function (res) {
      if (target) {
        target.setAttribute('src', res.url);
        var item = find('i', target);
        if (item) markDirty(item);
        else {
          var parent = target.closest('[data-cms-t]');
          if (parent) markDirty(find('t', parent));
        }
      } else if (insert) {
        var alt = prompt('Short description of the image (for screen readers):', '') || '';
        var img = document.createElement('img');
        img.src = res.url;
        img.alt = alt;
        img.style.maxWidth = '—';
        var range = insert.range;
        if (range && insert.block.el.contains(range.startContainer)) {
          range.collapse(false);
          range.insertNode(img);
        } else {
          insert.block.el.appendChild(img);
        }
        markDirty(insert.block);
      } else {
        toast('Click an image or a spot in the text first, then try again.', true);
        return;
      }
      toast('Image added. Click Save to publish.');
    }).catch(function (err) { toast(err.message || 'Upload failed.', true); });
  }

  /* ── Save ── */
  function save() {
    if (!dirty.size) return;
    var changes = {};
    dirty.forEach(function (item) {
      var scope = changes[item.scope] || (changes[item.scope] = {});
      var val;
      if (item.type === 't') {
        val = item.el.innerHTML === item.origHtml ? null : { o: item.orig, h: item.el.innerHTML };
      } else if (item.type === 'i') {
        var src = item.el.getAttribute('src') || '';
        val = src === item.origSrc ? null : { o: item.orig, s: src, alt: item.el.getAttribute('alt') || '' };
      } else if (item.type === 'a') {
        var href = item.el.getAttribute('href') || '';
        val = href === item.origHref ? null : { o: item.orig, href: href };
      }
      scope[item.key] = val;
    });
    var btn = bar.querySelector('[data-act="save"]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    var sent = 0;
    Object.keys(changes).forEach(function (s) { sent += Object.keys(changes[s]).length; });
    api('content', { method: 'PUT', json: { changes: changes } }).then(function (res) {
      if (res && typeof res.saved === 'number' && res.saved < sent) {
        updateSaveButton();
        toast('Only ' + res.saved + ' of ' + sent + ' changes were saved. Please try Save again.', true);
        return;
      }
      dirty.forEach(function (item) { item.el && item.el.removeAttribute('data-cms-dirty'); });
      dirty.clear();
      updateSaveButton();
      toast('Saved and published. Visitors see it within about 15 seconds.');
    }).catch(function (err) {
      updateSaveButton();
      if (/logged in/i.test(err.message)) toast('Your login expired. Open the Dashboard in a new tab, log in, then click Save again.', true);
      else toast('Save failed: ' + err.message, true);
    });
  }

  function logout() {
    if (dirty.size && !confirm('You have unsaved changes. Log out anyway?')) return;
    dirty.clear();
    api('logout', { method: 'POST' }).catch(function () {}).then(function () { location.href = location.pathname; });
  }

  /* ── Editing event wiring ── */
  function wireEvents() {
    document.addEventListener('input', function (e) {
      if (!editing) return;
      var el = e.target.closest && e.target.closest('[data-cms-t]');
      if (el) markDirty(find('t', el));
    });

    // In edit mode, clicking links edits them instead of navigating; clicking images selects them.
    document.addEventListener('click', function (e) {
      if (!editing || e.target === fileInput || e.target.closest('.cms-bar')) return;
      var img = e.target.closest('img');
      if (lastImage) lastImage.classList.remove('cms-selected');
      lastImage = null;
      if (img && (find('i', img) || img.closest('[data-cms-t]'))) {
        e.preventDefault();
        lastImage = img;
        img.classList.add('cms-selected');
        toast('Image selected. Click "Image" to replace it.');
        return;
      }
      var a = e.target.closest('a');
      if (!a) return;
      // Header menu and logo still navigate, and the next page opens in edit mode too.
      if (a.closest('.site-header')) {
        if (e.target.closest('[data-cms-t]')) { e.preventDefault(); return; }
        var href = a.getAttribute('href') || '';
        if (a.classList.contains('nav-login') || /^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return;
        e.preventDefault();
        var url = new URL(href, location.href);
        url.searchParams.set('edit', '1');
        location.href = url.pathname + url.search + url.hash; // unsaved changes trigger the leave-page warning
        return;
      }
      // Links inside the page content are edited (use the Link button), not followed.
      e.preventDefault();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (!editing) return;
      var el = e.target.closest && e.target.closest('[data-cms-t]');
      if (!el) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && dirty.size) { e.preventDefault(); save(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!SINGLE_LINE.test(el.tagName) || e.shiftKey) document.execCommand('insertLineBreak');
      }
      if (e.key === 'Escape') el.blur();
    });

    // Paste as plain text so Word/Google Docs formatting doesn't break the design.
    document.addEventListener('paste', function (e) {
      if (!editing || !(e.target.closest && e.target.closest('[data-cms-t]'))) return;
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    window.addEventListener('beforeunload', function (e) {
      if (dirty.size) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function setNavLogin() {
    var link = document.querySelector('.nav-login');
    if (link && user) { link.textContent = 'Admin'; link.title = 'Signed in as ' + user; }
  }

  /* ── Start ── */
  collect();

  var contentReady = loadContent(false).catch(function () {}).then(reveal);

  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : { user: null }; })
    .catch(function () { return { user: null }; })
    .then(function (me) {
      user = me && me.user;
      if (!user) return;
      setNavLogin();
      // Viewers can sign in to the dashboard but cannot edit the site.
      if (me.role !== 'admin' && me.role !== 'editor') return;
      injectStyles();
      buildBar();
      wireEvents();
      // Editors always see the newest saved version.
      return contentReady.then(function () { return loadContent(true).catch(function () {}); }).then(function () {
        if (/[?&]edit=1/.test(location.search)) startEditing();
      });
    });
})();

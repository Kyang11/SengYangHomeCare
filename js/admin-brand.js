// Read the public header brand without replacing the admin navigation.
(function () {
  'use strict';
  fetch('/api/content').then(function (response) {
    if (!response.ok) throw new Error('Brand unavailable');
    return response.json();
  }).then(function (content) {
    var entry = ((content.pages || {})._header || {})['t:0'];
    if (!entry || typeof entry.h !== 'string') return;
    var template = document.createElement('template');
    template.innerHTML = entry.h;
    template.content.querySelectorAll('small,script,style').forEach(function (el) { el.remove(); });
    var name = template.content.textContent.trim();
    if (!name) return;
    document.querySelectorAll('[data-admin-brand]').forEach(function (el) { el.textContent = name; });
    document.title = 'Admin — ' + name;
  }).catch(function () { /* Retain the business name when offline. */ });
})();

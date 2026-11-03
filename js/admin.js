(function() {

/* ── Helpers ── */
function get(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || def; }
  catch(e) { return def; }
}
function set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/* ── Elements ── */
var loginEl = document.getElementById('adminLogin');
var appEl = document.getElementById('adminApp');
var loginUser = document.getElementById('adminUser');
var loginPass = document.getElementById('adminPass');
var loginBtn = document.getElementById('adminLoginBtn');
var loginErr = document.getElementById('adminLoginError');
var logoutBtn = document.getElementById('adminLogoutBtn');
var tabs = document.querySelectorAll('.admin-tab');
var panels = document.querySelectorAll('.admin-panel');

/* ── Auth (server-side: /api/login, users set in Vercel env ADMIN_PASSWORD_HASH) ── */
function apiCall(path, method, body) {
  return fetch('/api/' + path, {
    method: method || 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-SYH-CMS': '1' },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) {
    return r.json().catch(function() { return {}; }).then(function(d) {
      if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
      return d;
    });
  });
}

function showApp(me) {
  currentUser = me;
  document.body.setAttribute('data-role', me.role || 'viewer');
  loginEl.style.display = 'none';
  appEl.style.display = 'flex';
  var who = document.getElementById('adminWho');
  if (who) who.textContent = (me.name || me.user) + ' · ' + (ROLE_LABEL[me.role] || me.role);
  // Non-admins can't open User Management.
  var active = document.querySelector('.admin-tab.active');
  if (active && active.classList.contains('admin-only') && me.role !== 'admin') {
    document.querySelector('.admin-tab[data-panel="dashboard"]').click();
  }
  refreshAll();
}

function showLogin() {
  loginEl.style.display = 'flex';
  appEl.style.display = 'none';
  loginUser.focus();
}

function checkAuth() {
  apiCall('me').then(function(d) {
    if (d.user) showApp(d); else showLogin();
  }).catch(showLogin);
}

loginBtn.onclick = function() {
  var u = loginUser.value.trim();
  var p = loginPass.value;
  if (!u || !p) { loginErr.textContent = 'Enter your username and password.'; loginErr.style.display = 'block'; return; }
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';
  apiCall('login', 'POST', { username: u, password: p }).then(function(d) {
    loginErr.style.display = 'none';
    loginPass.value = '';
    return apiCall('me').then(showApp);
  }).catch(function(err) {
    loginErr.textContent = err.message;
    loginErr.style.display = 'block';
  }).then(function() {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  });
};

logoutBtn.onclick = function() {
  apiCall('logout', 'POST').catch(function() {}).then(function() {
    currentUser = null;
    document.body.removeAttribute('data-role');
    showLogin();
  });
};

loginUser.onkeydown = function(e) { if (e.key === 'Enter') loginBtn.click(); };
loginPass.onkeydown = function(e) { if (e.key === 'Enter') loginBtn.click(); };

/* ── Tab Switching ── */
tabs.forEach(function(tab) {
  tab.onclick = function(e) {
    e.preventDefault();
    tabs.forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    panels.forEach(function(p) { p.classList.remove('active'); });
    var panel = document.getElementById('panel-' + tab.getAttribute('data-panel'));
    if (panel) panel.classList.add('active');
    refreshPanel(tab.getAttribute('data-panel'));
  };
});

/* ── Dashboard ── */
function refreshDashboard() {
  var results = get('quizResults', []);
  var quizzes = get('customQuizzes', []);
  var submissions = get('formSubmissions', []);
  document.getElementById('statResults').textContent = results.length;
  document.getElementById('statPassed').textContent = results.filter(function(r) { return r.passed; }).length;
  document.getElementById('statQuizzes').textContent = quizzes.length;
  document.getElementById('statSubmissions').textContent = submissions.length;

  var recentResults = results.slice(-5).reverse();
  var recentSubs = submissions.slice(-5).reverse();
  var container = document.getElementById('dashboardRecentResults');

  var html = '';

  if (recentSubs.length) {
    html += '<h3 style="font-size:0.85rem;color:var(--ink-soft);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Recent Form Submissions</h3>';
    html += '<table class="admin-table"><thead><tr><th>Type</th><th>Name</th><th>Date</th></tr></thead><tbody>';
    recentSubs.forEach(function(s) {
      var d = new Date(s.submitted);
      var name = s.type === 'employee' ? (s.emp_name || 'N/A') : (s.cl_name || s.cl_contact || 'N/A');
      html += '<tr><td><span class="badge ' + (s.type === 'employee' ? 'badge-editor' : 'badge-viewer') + '">' + (s.type === 'employee' ? 'Employee' : 'Client') + '</span></td><td>' + esc(name) + '</td><td>' + d.toLocaleDateString() + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  if (recentResults.length) {
    html += '<h3 style="font-size:0.85rem;color:var(--ink-soft);margin:20px 0 8px;text-transform:uppercase;letter-spacing:0.04em;">Recent Quiz Results</h3>';
    html += '<table class="admin-table"><thead><tr><th>Name</th><th>Score</th><th>Date</th><th>Status</th></tr></thead><tbody>';
    recentResults.forEach(function(r) {
      var d = new Date(r.date);
      html += '<tr><td>' + esc(r.name) + '</td><td>' + r.score + '/' + r.total + ' (' + r.pct + '%)</td><td>' + d.toLocaleDateString() + '</td><td><span class="badge ' + (r.passed ? 'badge-pass' : 'badge-fail') + '">' + (r.passed ? 'Passed' : 'Failed') + '</span></td></tr>';
    });
    html += '</tbody></table>';
  }

  if (!recentSubs.length && !recentResults.length) {
    html = '<p style="color:var(--ink-soft);">No activity yet.</p>';
  }

  container.innerHTML = html;
}

/* ── Users (server-side, stored in Vercel Blob) ── */
var currentUser = null;
var cachedUsers = [];

function msg(id, text, isErr, html) {
  var el = document.getElementById(id);
  if (!el) return;
  if (!text) { el.style.display = 'none'; return; }
  if (html) el.innerHTML = text; else el.textContent = text;
  el.className = 'admin-msg' + (isErr ? ' err' : '');
  el.style.display = 'block';
}

function randomPassword() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var arr = new Uint32Array(12);
  window.crypto.getRandomValues(arr);
  var out = '';
  for (var i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8);
}

var ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

function loadUsers() {
  if (!currentUser || currentUser.role !== 'admin') return;
  apiCall('users').then(function(d) {
    cachedUsers = d.users || [];
    document.getElementById('statUsers').textContent = cachedUsers.length;
    renderUsers();
  }).catch(function(err) {
    document.getElementById('userList').innerHTML = '<p style="color:var(--coral);">' + esc(err.message) + '</p>';
  });
}

function renderUsers() {
  var container = document.getElementById('userList');
  if (!cachedUsers.length) { container.innerHTML = '<p style="color:var(--ink-soft);">No users yet.</p>'; return; }
  var html = '<table class="admin-table"><thead><tr><th>Name</th><th>Sign-in</th><th>Role</th><th>Added</th><th>Action</th></tr></thead><tbody>';
  cachedUsers.forEach(function(u, idx) {
    var isMe = currentUser && u.username === currentUser.user;
    html += '<tr><td>' + esc(u.name || '—') + (isMe ? ' <span style="color:var(--ink-soft);font-size:0.85rem;">(you)</span>' : '') + '</td>';
    html += '<td>' + esc(u.username) + '</td><td>';
    if (u.builtIn) {
      html += '<span class="badge badge-admin">Admin</span> <span class="badge badge-builtin" title="Set in Vercel → ADMIN_PASSWORD_HASH">Built-in</span>';
    } else if (isMe) {
      html += '<span class="badge badge-' + u.role + '">' + ROLE_LABEL[u.role] + '</span>';
    } else {
      html += '<select data-role-idx="' + idx + '" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-family:inherit;">';
      ['admin', 'editor', 'viewer'].forEach(function(r) {
        html += '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + ROLE_LABEL[r] + '</option>';
      });
      html += '</select>';
    }
    html += '</td><td>' + (u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—') + '</td><td class="user-actions">';
    if (!u.builtIn && !isMe) {
      html += '<button class="btn btn-sm btn-outline" data-reset-idx="' + idx + '">Reset password</button>';
      html += '<button class="btn btn-sm btn-danger" data-remove-idx="' + idx + '">Remove</button>';
    } else {
      html += '<span style="color:var(--ink-soft);font-size:0.85rem;">' + (u.builtIn ? 'Managed in Vercel' : '—') + '</span>';
    }
    html += '</td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

document.getElementById('userList').addEventListener('change', function(e) {
  var sel = e.target.closest('[data-role-idx]');
  if (!sel) return;
  var u = cachedUsers[+sel.getAttribute('data-role-idx')];
  apiCall('users', 'POST', { action: 'update', username: u.username, role: sel.value }).then(function() {
    logContent('User role changed', u.username + ' → ' + sel.value);
    msg('userMsg', u.username + ' is now ' + ROLE_LABEL[sel.value] + '.');
    loadUsers();
  }).catch(function(err) { msg('userMsg', err.message, true); loadUsers(); });
});

document.getElementById('userList').addEventListener('click', function(e) {
  var reset = e.target.closest('[data-reset-idx]');
  var remove = e.target.closest('[data-remove-idx]');
  if (reset) {
    var u = cachedUsers[+reset.getAttribute('data-reset-idx')];
    var pw = prompt('New password for ' + u.username + ' (min 14 characters):', randomPassword());
    if (!pw) return;
    apiCall('users', 'POST', { action: 'update', username: u.username, password: pw }).then(function() {
      logContent('Password reset', 'Reset password for ' + u.username);
      msg('userMsg', 'Password for <strong>' + esc(u.username) + '</strong> changed to <code>' + esc(pw) + '</code>. Share it with them privately.', false, true);
    }).catch(function(err) { msg('userMsg', err.message, true); });
  }
  if (remove) {
    var r = cachedUsers[+remove.getAttribute('data-remove-idx')];
    if (!confirm('Remove ' + r.username + '? They will be signed out and can no longer sign in.')) return;
    apiCall('users', 'POST', { action: 'delete', username: r.username }).then(function() {
      logContent('User removed', 'Removed ' + r.username);
      msg('userMsg', r.username + ' was removed.');
      loadUsers();
    }).catch(function(err) { msg('userMsg', err.message, true); });
  }
});

document.getElementById('genPassBtn').onclick = function() {
  document.getElementById('userPassInput').value = randomPassword();
};

document.getElementById('addUserBtn').onclick = function() {
  var name = document.getElementById('userNameInput').value.trim();
  var username = document.getElementById('userEmailInput').value.trim();
  var role = document.getElementById('userRoleInput').value;
  var password = document.getElementById('userPassInput').value;
  if (!username || !password) { msg('userMsg', 'Enter an email/username and a password.', true); return; }
  var btn = document.getElementById('addUserBtn');
  btn.disabled = true;
  apiCall('users', 'POST', { action: 'create', name: name, username: username, role: role, password: password }).then(function(d) {
    logContent('User added', 'Added ' + d.user.username + ' as ' + role);
    msg('userMsg', 'Added <strong>' + esc(d.user.username) + '</strong> as ' + ROLE_LABEL[role] + '. Password: <code>' + esc(password) + '</code> — share it with them privately. They sign in at <strong>' + esc(location.origin) + '/admin</strong>.', false, true);
    document.getElementById('userNameInput').value = '';
    document.getElementById('userEmailInput').value = '';
    document.getElementById('userPassInput').value = '';
    loadUsers();
  }).catch(function(err) { msg('userMsg', err.message, true); }).then(function() { btn.disabled = false; });
};

/* ── My Account ── */
function refreshAccount() {
  if (!currentUser) return;
  document.getElementById('accountInfo').innerHTML = 'Signed in as <strong>' + esc(currentUser.user) + '</strong> · Role: <strong>' + ROLE_LABEL[currentUser.role] + '</strong>';
  document.getElementById('accountPwForm').style.display = currentUser.builtIn ? 'none' : 'block';
  if (currentUser.builtIn) msg('accountMsg', 'You are a built-in admin. Your password is set in Vercel (Settings → Environment Variables → ADMIN_PASSWORD_HASH).');
}

document.getElementById('changePassBtn').onclick = function() {
  var cur = document.getElementById('curPassInput').value;
  var next = document.getElementById('newPassInput').value;
  apiCall('users', 'POST', { action: 'password', currentPassword: cur, newPassword: next }).then(function() {
    document.getElementById('curPassInput').value = '';
    document.getElementById('newPassInput').value = '';
    msg('accountMsg', 'Password changed.');
  }).catch(function(err) { msg('accountMsg', err.message, true); });
};

/* ── Content Log ── */
function logContent(action, detail) {
  var log = get('contentLog', []);
  log.push({ action: action, detail: detail, timestamp: new Date().toISOString() });
  set('contentLog', log);
}

function refreshContentLog() {
  var log = get('contentLog', []);
  var container = document.getElementById('contentLog');
  if (!log.length) {
    container.innerHTML = '<p style="color:var(--ink-soft);">No changes tracked yet.</p>';
    return;
  }
  var html = '<table class="admin-table"><thead><tr><th>Action</th><th>Detail</th><th>Date/Time</th></tr></thead><tbody>';
  log.slice().reverse().forEach(function(entry) {
    var d = new Date(entry.timestamp);
    html += '<tr><td>' + esc(entry.action) + '</td><td>' + esc(entry.detail) + '</td><td>' + d.toLocaleString() + '</td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

/* ── Quiz Manager ── */
function refreshQuizList() {
  var quizzes = get('customQuizzes', []);
  var container = document.getElementById('quizList');
  if (!quizzes.length) {
    container.innerHTML = '<p style="color:var(--ink-soft);">No custom quizzes created yet.</p>';
    return;
  }
  var html = '<table class="admin-table"><thead><tr><th>Title</th><th>Questions</th><th>Created</th><th>Action</th></tr></thead><tbody>';
  quizzes.forEach(function(q, idx) {
    var d = new Date(q.created);
    html += '<tr><td>' + esc(q.title) + '</td><td>' + (q.questions ? q.questions.length : 0) + '</td><td>' + d.toLocaleDateString() + '</td>';
    html += '<td><button class="btn btn-sm btn-outline" onclick="editQuiz(' + idx + ')">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteQuiz(' + idx + ')">Delete</button></td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

window.deleteQuiz = function(idx) {
  if (!confirm('Delete this quiz?')) return;
  var quizzes = get('customQuizzes', []);
  if (quizzes[idx]) { quizzes.splice(idx, 1); set('customQuizzes', quizzes);
    logContent('Quiz deleted', 'Deleted quiz #' + (idx+1)); refreshQuizList(); refreshDashboard(); }
};

var editingQuizIdx = -1;

window.editQuiz = function(idx) {
  var quizzes = get('customQuizzes', []);
  var q = quizzes[idx];
  if (!q) return;
  editingQuizIdx = idx;
  document.getElementById('quizEditorCard').style.display = 'block';
  document.getElementById('quizEditorTitle').textContent = q.title;
  var container = document.getElementById('quizEditor');
  container.innerHTML = '';
  var questions = q.questions || [];
  questions.forEach(function(qu, qi) {
    var div = document.createElement('div');
    div.className = 'quiz-editor-question';
    div.innerHTML = '<input type="text" class="qe-question" value="' + esc(qu.question) + '" placeholder="Question text" />';
    div.innerHTML += '<div class="options-row">';
    for (var oi = 0; oi < 4; oi++) {
      div.innerHTML += '<input type="text" class="qe-opt" value="' + esc(qu.options && qu.options[oi] ? qu.options[oi] : '') + '" placeholder="Option ' + (oi+1) + '" />';
    }
    div.innerHTML += '</div>';
    div.innerHTML += '<select class="correct-select"><option value="">Select correct answer</option>';
    for (var si = 0; si < 4; si++) {
      div.innerHTML += '<option value="' + si + '"' + (qu.correct === si ? ' selected' : '') + '>Option ' + (si+1) + '</option>';
    }
    div.innerHTML += '</select>';
    container.appendChild(div);
  });
};

document.getElementById('createQuizBtn').onclick = function() {
  var title = document.getElementById('quizTitleInput').value.trim();
  var count = parseInt(document.getElementById('quizQuestionCount').value, 10);
  if (!title || !count || count < 1) { alert('Enter a title and number of questions.'); return; }
  var questions = [];
  for (var i = 0; i < count; i++) {
    questions.push({ question: '', options: ['', '', '', ''], correct: -1 });
  }
  var quizzes = get('customQuizzes', []);
  quizzes.push({ title: title, questions: questions, created: new Date().toISOString() });
  set('customQuizzes', quizzes);
  logContent('Quiz created', 'Created "' + title + '" with ' + count + ' questions');
  document.getElementById('quizTitleInput').value = '';
  document.getElementById('quizQuestionCount').value = '';
  refreshQuizList();
  refreshDashboard();
  editQuiz(quizzes.length - 1);
};

document.getElementById('saveQuizBtn').onclick = function() {
  if (editingQuizIdx < 0) return;
  var quizzes = get('customQuizzes', []);
  var q = quizzes[editingQuizIdx];
  if (!q) return;
  var questionEls = document.querySelectorAll('.quiz-editor-question');
  var questions = [];
  questionEls.forEach(function(el) {
    var qText = el.querySelector('.qe-question').value.trim();
    var optEls = el.querySelectorAll('.qe-opt');
    var opts = [];
    optEls.forEach(function(oe) { opts.push(oe.value.trim()); });
    var correct = parseInt(el.querySelector('.correct-select').value, 10);
    questions.push({ question: qText, options: opts, correct: isNaN(correct) ? -1 : correct });
  });
  q.questions = questions;
  set('customQuizzes', quizzes);
  logContent('Quiz saved', 'Saved "' + q.title + '" (' + questions.length + ' questions)');
  alert('Quiz saved!');
  refreshQuizList();
};

/* ── Training Results ── */
function refreshResults() {
  var results = get('quizResults', []);
  var container = document.getElementById('resultsList');
  if (!results.length) {
    container.innerHTML = '<p style="color:var(--ink-soft);">No quiz results yet.</p>';
    return;
  }
  var html = '<table class="admin-table"><thead><tr><th>Name</th><th>Score</th><th>Date</th><th>Status</th><th>Certificate</th></tr></thead><tbody>';
  results.forEach(function(r, idx) {
    var d = new Date(r.date);
    html += '<tr><td>' + esc(r.name) + '</td><td>' + r.score + '/' + r.total + ' (' + r.pct + '%)</td><td>' + d.toLocaleDateString() + '</td>';
    html += '<td><span class="badge ' + (r.passed ? 'badge-pass' : 'badge-fail') + '">' + (r.passed ? 'Passed' : 'Failed') + '</span></td>';
    html += '<td class="cert-actions">';
    if (r.passed) {
      html += '<button class="btn btn-sm btn-outline" onclick="downloadCert(' + idx + ')">Download</button>';
    } else {
      html += '<span style="color:var(--ink-soft);font-size:0.85rem;">N/A</span>';
    }
    html += '</td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

window.downloadCert = function(idx) {
  var results = get('quizResults', []);
  var r = results[idx];
  if (!r || !r.passed) return;
  var name = r.name;
  var certHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Certificate of Completion</title>';
  certHtml += '<style>body{font-family:Georgia,serif;text-align:center;padding:80px 40px;background:#faf8f2;color:#1a1f24;}';
  certHtml += '.cert{border:4px double #496b55;max-width:700px;margin:0 auto;padding:60px 40px;background:#fff;}';
  certHtml += 'h1{font-size:2.2rem;color:#263f36;margin-bottom:8px;}h2{font-size:1.5rem;color:#496b55;font-weight:400;margin-bottom:32px;}';
  certHtml += '.name{font-size:2rem;color:#263f36;border-bottom:2px solid #dedfce;display:inline-block;padding:0 30px 10px;margin:24px 0;}';
  certHtml += 'p{color:#4a5560;font-size:1.1rem;line-height:1.6;}.date{color:#496b55;font-size:1rem;margin-top:40px;}</style></head><body>';
  certHtml += '<div class="cert"><h1>Certificate of Completion</h1><h2>Seng Yang Home Care</h2>';
  certHtml += '<p>This certifies that</p><div class="name">' + esc(name) + '</div>';
  certHtml += '<p>has successfully completed the PCA Training Program<br>with a score of ' + r.pct + '% (' + r.score + '/' + r.total + ')</p>';
  certHtml += '<p class="date">' + new Date(r.date).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) + '</p></div></body></html>';
  var blob = new Blob([certHtml], {type:'text/html'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'SYH_Certificate_' + name.replace(/\s+/g,'_') + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ── Documents ── */
function refreshDocuments() {
  var docs = get('appDocuments', []);
  var submissions = get('formSubmissions', []);
  var container = document.getElementById('documentsList');

  if (!docs.length && !submissions.length) {
    container.innerHTML = '<p style="color:var(--ink-soft);">No documents or form submissions yet.</p>';
    return;
  }

  var html = '';

  if (submissions.length) {
    html += '<h3 style="margin: 0 0 12px 0; font-size: 1rem;">Form Submissions</h3>';
    html += '<table class="admin-table"><thead><tr><th>Type</th><th>Name / Contact</th><th>Date</th><th>Action</th></tr></thead><tbody>';
    submissions.forEach(function(s, idx) {
      var dt = new Date(s.submitted);
      var typeLabel = s.type === 'employee' ? 'Employee' : 'Client';
      var name = s.type === 'employee' ? (s.emp_name || 'N/A') : (s.cl_name || s.cl_contact || 'N/A');
      var email = s.type === 'employee' ? s.emp_email : s.cl_email;
      html += '<tr><td><span class="badge ' + (s.type === 'employee' ? 'badge-editor' : 'badge-viewer') + '">' + typeLabel + '</span></td>';
      html += '<td>' + esc(name) + '<br><span style="font-size:0.8rem;color:var(--ink-soft);">' + esc(email || '') + '</span></td>';
      html += '<td>' + dt.toLocaleDateString() + '</td>';
      html += '<td><button class="btn btn-sm btn-outline" onclick="viewSubmission(' + idx + ')">View</button> <button class="btn btn-sm btn-danger" onclick="deleteSubmission(' + idx + ')">Delete</button></td></tr>';
    });
    html += '</tbody></table>';
  }

  if (docs.length) {
    html += '<h3 style="margin: 24px 0 12px 0; font-size: 1rem;">Uploaded Documents</h3>';
    html += '<table class="admin-table"><thead><tr><th>Title</th><th>Submitted By</th><th>Date</th><th>File</th><th>Action</th></tr></thead><tbody>';
    docs.forEach(function(d, idx) {
      var dt = new Date(d.date);
      html += '<tr><td>' + esc(d.title) + '</td><td>' + esc(d.author) + '</td><td>' + dt.toLocaleDateString() + '</td>';
      html += '<td>' + esc(d.fileName) + ' (' + d.fileSize + ')</td>';
      html += '<td><button class="btn btn-sm btn-outline" onclick="downloadDoc(' + idx + ')">Download</button> <button class="btn btn-sm btn-danger" onclick="deleteDoc(' + idx + ')">Delete</button></td></tr>';
    });
    html += '</tbody></table>';
  }

  container.innerHTML = html;
}

window.viewSubmission = function(idx) {
  var submissions = get('formSubmissions', []);
  var s = submissions[idx];
  if (!s) return;
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Submission Details</title>';
  html += '<style>body{font-family:system-ui,sans-serif;padding:40px;background:#faf8f2;color:#1a1f24;}</style></head><body>';
  html += '<h1 style="color:#263f36;">' + (s.type === 'employee' ? 'Employee Application' : 'Client Intake') + '</h1>';
  html += '<table style="width:—;border-collapse:collapse;">';
  Object.keys(s).forEach(function(k) {
    if (k === 'type') return;
    var val = s[k];
    if (Array.isArray(val)) val = val.join(', ');
    html += '<tr style="border-bottom:1px solid #dedfce;"><td style="padding:10px 12px;font-weight:600;width:200px;">' + esc(k) + '</td><td style="padding:10px 12px;">' + esc(val) + '</td></tr>';
  });
  html += '</table></body></html>';
  var blob = new Blob([html], {type:'text/html'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (s.type === 'employee' ? 'Employee_' : 'Client_') + (s.submitted || Date.now()) + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

window.deleteSubmission = function(idx) {
  if (!confirm('Delete this submission?')) return;
  var submissions = get('formSubmissions', []);
  if (submissions[idx]) { submissions.splice(idx, 1); set('formSubmissions', submissions);
    logContent('Submission deleted', 'Deleted ' + submissions[idx].type + ' submission'); refreshDocuments(); }
};

window.downloadDoc = function(idx) {
  var docs = get('appDocuments', []);
  var d = docs[idx];
  if (!d) return;
  var byteChars = atob(d.data);
  var byteNums = new Array(byteChars.length);
  for (var i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  var byteArr = new Uint8Array(byteNums);
  var blob = new Blob([byteArr], {type: d.mimeType || 'application/octet-stream'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = d.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

window.deleteDoc = function(idx) {
  if (!confirm('Delete this document?')) return;
  var docs = get('appDocuments', []);
  if (docs[idx]) { docs.splice(idx, 1); set('appDocuments', docs);
    logContent('Document deleted', 'Deleted "' + docs[idx].title + '"'); refreshDocuments(); }
};

document.getElementById('uploadDocBtn').onclick = function() {
  var title = document.getElementById('docTitleInput').value.trim();
  var author = document.getElementById('docAuthorInput').value.trim();
  var fileInput = document.getElementById('docFileInput');
  if (!title || !author || !fileInput.files.length) { alert('Please fill in all fields and select a file.'); return; }
  var file = fileInput.files[0];
  var reader = new FileReader();
  reader.onload = function(e) {
    var data = e.target.result.split(',')[1];
    var docs = get('appDocuments', []);
    docs.push({
      title: title,
      author: author,
      date: new Date().toISOString(),
      fileName: file.name,
      fileSize: (file.size / 1024).toFixed(1) + ' KB',
      mimeType: file.type,
      data: data
    });
    set('appDocuments', docs);
    logContent('Document uploaded', author + ' uploaded "' + title + '" (' + file.name + ')');
    document.getElementById('docTitleInput').value = '';
    document.getElementById('docAuthorInput').value = '';
    document.getElementById('docFileInput').value = '';
    refreshDocuments();
  };
  reader.readAsDataURL(file);
};

/* ── Helpers ── */
function esc(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function refreshAll() {
  refreshDashboard();
  loadUsers();
  refreshAccount();
  refreshContentLog();
  refreshQuizList();
  refreshResults();
  refreshDocuments();
}

function refreshPanel(name) {
  switch (name) {
    case 'dashboard': refreshDashboard(); break;
    case 'users': loadUsers(); break;
    case 'account': refreshAccount(); break;
    case 'content': refreshContentLog(); break;
    case 'quizzes': refreshQuizList(); break;
    case 'results': refreshResults(); break;
    case 'documents': refreshDocuments(); break;
  }
}

/* ── Init ── */
checkAuth();

})();

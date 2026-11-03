// Mobile nav toggle
const toggle = document.getElementById('navToggle');
const nav = document.getElementById('primaryNav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', false);
  }));
}

// Sticky header shadow on scroll
const header = document.getElementById('siteHeader');
const handleScroll = () => {
  if (window.scrollY > 8) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
};
window.addEventListener('scroll', handleScroll, { passive: true });
handleScroll();

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Reveal-on-scroll
if ('IntersectionObserver' in window) {
  const targets = document.querySelectorAll('.service-card, .why-item, .train-card, .doc-card, .hero-card, .section-head, .contact-card, .service-block, .employment-intro, .employment-step, .employment-forms-shell, .employment-docs');
  targets.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  targets.forEach(el => io.observe(el));
}

// Video modal & tracking
const videoBtns = document.querySelectorAll('.video-btn');
const videoModal = document.getElementById('videoModal');
const videoIframe = document.getElementById('videoIframe');
const localVideo = document.getElementById('localVideo');
const videoClose = document.getElementById('videoModalClose');

// Video metadata - titles for each video
// Get watched videos from localStorage
function getWatchedVideos() {
  return JSON.parse(localStorage.getItem('watchedVideos') || '[]');
}

function markVideoWatched(videoId) {
  const watched = getWatchedVideos();
  if (!watched.includes(videoId)) {
    watched.push(videoId);
    localStorage.setItem('watchedVideos', JSON.stringify(watched));
  }
}

function getWatchedVideoTitles() {
  const watched = getWatchedVideos();
  return Array.from(document.querySelectorAll('.video-btn')).filter(btn => watched.includes(btn.dataset.videoSrc || btn.dataset.video)).map(btn => btn.querySelector('h4').textContent);
}

function getCurrentVideoIds() {
  return Array.prototype.map.call(document.querySelectorAll('.video-btn'), function(btn) {
    return btn.getAttribute('data-video-src') || btn.getAttribute('data-video');
  }).filter(Boolean);
}

let closeModal = null;

if (videoBtns.length && videoModal && videoIframe && videoClose) {
  videoBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const youtubeId = btn.getAttribute('data-video');
      const localSrc = btn.getAttribute('data-video-src');
      const videoKey = localSrc || youtubeId;
      if (!videoKey) { alert('Video placeholder: an editor can add this video in Admin → Media Library.'); return; }
      videoModal.classList.add('open');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        if (localSrc && localVideo) {
          videoIframe.style.display = 'none';
          videoIframe.src = '';
          localVideo.style.display = 'block';
          localVideo.src = localSrc;
          localVideo.play().catch(() => {});
        } else {
          if (localVideo) {
            localVideo.pause();
            localVideo.removeAttribute('src');
            localVideo.load();
            localVideo.style.display = 'none';
          }
          videoIframe.style.display = 'block';
          videoIframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`;
        }
      });
      // Mark video as watched when opened
      markVideoWatched(videoKey);
    });
  });

  closeModal = () => {
    videoModal.classList.remove('open');
    videoIframe.src = '';
    if (localVideo) {
      localVideo.pause();
      localVideo.removeAttribute('src');
      localVideo.load();
      localVideo.style.display = 'none';
    }
    videoIframe.style.display = 'block';
    document.body.style.overflow = '';
  };

  videoClose.addEventListener('click', closeModal);
  videoModal.addEventListener('click', e => {
    if (e.target === videoModal || e.target.classList.contains('video-modal-overlay')) {
      closeModal();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && videoModal.classList.contains('open')) {
      closeModal();
    }
  });
}

// Update video watch status on training page
function updateVideoWatchStatus() {
  var statusEl = document.getElementById('videoWatchStatus');
  var videoBtns = document.querySelectorAll('.video-btn');
  if (!statusEl || !videoBtns.length) return;

  var watched = getWatchedVideos();
  var videoIds = getCurrentVideoIds();
  var total = videoIds.length;
  var watchedCount = videoIds.filter(function(id) { return watched.includes(id); }).length;

  if (watchedCount === 0) {
    statusEl.innerHTML = '<span style="color: var(--coral);">⚠</span> You must watch at least one video before taking the quiz.';
    statusEl.style.color = 'var(--coral)';
  } else if (watchedCount < total) {
    statusEl.innerHTML = 'Watched <strong>' + watchedCount + ' of ' + total + '</strong> videos. You can take the quiz now.';
    statusEl.style.color = 'var(--teal-700)';
  } else {
    statusEl.innerHTML = '<span style="color: var(--teal-700);">✓</span> All <strong>' + total + '</strong> videos watched. Ready for quiz!';
    statusEl.style.color = 'var(--teal-700)';
  }

  // Add visual indicators to video buttons
  videoBtns.forEach(btn => {
    var videoId = btn.getAttribute('data-video-src') || btn.getAttribute('data-video');
    var indicator = btn.querySelector('.watch-indicator');
    if (watched.includes(videoId)) {
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'watch-indicator';
        indicator.style.cssText = 'position:absolute;top:12px;right:12px;width:20px;height:20px;border-radius:50%;background:#2e7d32;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;';
        indicator.textContent = '✓';
        btn.style.position = 'relative';
        btn.appendChild(indicator);
      }
    } else if (indicator) {
      indicator.remove();
    }
  });
}

// Run on page load
updateVideoWatchStatus();

// Also update when video modal closes
if (closeModal) {
  var originalCloseModal = closeModal;
  closeModal = function() {
    originalCloseModal();
    updateVideoWatchStatus();
  };
}

// Quiz - single quiz covering all training videos
(function() {
  try {
    var quizStart = document.getElementById('quizStart');
    var quizQuestions = document.getElementById('quizQuestions');
    var quizResults = document.getElementById('quizResults');
    var quizStartBtn = document.getElementById('quizStartBtn');
    var quizName = document.getElementById('quizName');
    var quizQuestionText = document.getElementById('quizQuestionText');
    var quizOptions = document.getElementById('quizOptions');
    var quizPrevBtn = document.getElementById('quizPrevBtn');
    var quizNextBtn = document.getElementById('quizNextBtn');
    var quizSubmitBtn = document.getElementById('quizSubmitBtn');
    var quizProgress = document.getElementById('quizProgress');
    var quizBarFill = document.getElementById('quizBarFill');
    var quizScoreNum = document.getElementById('quizScoreNum');
    var quizScoreTotal = document.getElementById('quizScoreTotal');
    var quizResultMsg = document.getElementById('quizResultMsg');
    var quizReviewBtn = document.getElementById('quizReviewBtn');
    var quizRestartBtn = document.getElementById('quizRestartBtn');
    var quizReviewList = document.getElementById('quizReviewList');

    if (!quizStart || !quizStartBtn) return;
    if (typeof QUIZ_DATA === 'undefined' || !QUIZ_DATA.length) {
      quizStartBtn.textContent = 'Quiz data unavailable';
      quizStartBtn.disabled = true;
      return;
    }

    var currentQ = 0;
    var answers = [];
    for (var ai = 0; ai < QUIZ_DATA.length; ai++) answers.push(null);
    var reviewed = false;

    function renderQuestion(idx) {
      var q = QUIZ_DATA[idx];
      quizQuestionText.textContent = q.question;
      quizProgress.textContent = 'Question ' + (idx + 1) + ' of ' + QUIZ_DATA.length;
      quizBarFill.style.width = ((idx + 1) / QUIZ_DATA.length * 100) + '%';
      quizOptions.innerHTML = '';

      for (var oi = 0; oi < q.options.length; oi++) {
        (function(optIdx) {
          var label = document.createElement('label');
          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'quizOpt';
          radio.value = optIdx;
          if (answers[idx] === optIdx) radio.checked = true;
          if (reviewed) {
            radio.disabled = true;
            if (optIdx === q.correct) label.className = 'correct';
            if (optIdx === answers[idx] && answers[idx] !== q.correct) label.className = 'wrong';
            if (optIdx === answers[idx]) label.className = 'selected';
          }
          radio.onclick = function() {
            if (!reviewed) {
              answers[idx] = optIdx;
              var allLabels = document.querySelectorAll('#quizOptions label');
              for (var li = 0; li < allLabels.length; li++) allLabels[li].className = '';
              label.className = 'selected';
            }
          };
          label.appendChild(radio);
          label.appendChild(document.createTextNode(' ' + q.options[optIdx]));
          quizOptions.appendChild(label);
        })(oi);
      }

      quizPrevBtn.disabled = (idx === 0);
      quizNextBtn.style.display = (idx < QUIZ_DATA.length - 1) ? 'inline-block' : 'none';
      quizSubmitBtn.style.display = (idx === QUIZ_DATA.length - 1) ? 'inline-block' : 'none';
      if (reviewed) {
        quizPrevBtn.disabled = false;
        quizNextBtn.style.display = 'inline-block';
        quizSubmitBtn.style.display = 'none';
      }
    }

    function showResults() {
      var correctAnswers = [
        3,0,2,1,3,3,0,1,2,0,2,2,1,1,0,2,1,0,2,1,3,3,3,1,1,3,0,0,0,2,0,1,2,0,1,0,3,3,1,0,1,
        1,0,2,3,1,2,0,1,2,3,
        0,1,2,0,3,1,2,0,3,1,
        2,0,1,3,0,2,1,0,3,2
      ];
      var score = 0;
      for (var i = 0; i < QUIZ_DATA.length; i++) {
        if (answers[i] === correctAnswers[i]) score++;
        QUIZ_DATA[i].correct = correctAnswers[i];
      }
      quizQuestions.style.display = 'none';
      quizResults.style.display = 'block';
      quizScoreNum.textContent = score;
      if (quizScoreTotal) quizScoreTotal.textContent = '/ ' + QUIZ_DATA.length;
      var pct = Math.round(score / QUIZ_DATA.length * 100);
      var name = (quizName.value || '').trim() || 'trainee';
      if (pct >= 70) quizResultMsg.textContent = 'Great job, ' + name + '! You passed with ' + pct + '%.';
      else if (pct >= 60) quizResultMsg.textContent = 'Good effort, ' + name + '! You scored ' + pct + '%. Review the videos and try again.';
      else quizResultMsg.textContent = 'Keep studying, ' + name + '! You scored ' + pct + '%. Watch the training videos and retry.';

      var results = JSON.parse(localStorage.getItem('quizResults') || '[]');
      results.push({
        id: Date.now(),
        name: name,
        score: score,
        total: QUIZ_DATA.length,
        pct: pct,
        date: new Date().toISOString(),
        passed: pct >= 70
      });
      localStorage.setItem('quizResults', JSON.stringify(results));

      if (pct >= 70) {
        var certBtn = document.createElement('a');
        certBtn.href = '#';
        certBtn.className = 'btn btn-primary';
        certBtn.style.marginTop = '16px';
        certBtn.textContent = 'Download Certificate';
        certBtn.onclick = function() {
          var certHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sample Practice Certificate</title>';
          certHtml += '<style>body{font-family:Georgia,serif;text-align:center;padding:80px 40px;background:#faf8f2;color:#1a1f24;}';
          certHtml += '.cert{border:4px double #496b55;max-width:700px;margin:0 auto;padding:60px 40px;background:#fff;}';
          certHtml += 'h1{font-size:2.2rem;color:#263f36;margin-bottom:8px;}h2{font-size:1.5rem;color:#496b55;font-weight:400;margin-bottom:32px;}';
          certHtml += '.name{font-size:2rem;color:#263f36;border-bottom:2px solid #dedfce;display:inline-block;padding:0 30px 10px;margin:24px 0;}';
          certHtml += 'p{color:#4a5560;font-size:1.1rem;line-height:1.6;}.date{color:#496b55;font-size:1rem;margin-top:40px;}</style></head><body>';
          certHtml += '<div class="cert"><h1>Sample Practice Certificate</h1><h2>Seng Yang Home Care</h2>';
          certHtml += '<p>This certifies that</p><div class="name">' + name.replace(/[&<>"']/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }) + '</div>';
          certHtml += '<p>has successfully completed the <strong>Sample Practice Quiz</strong><br>with a score of ' + pct + '% (' + score + '/' + QUIZ_DATA.length + ')</p>';
          certHtml += '<p class="date">' + new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) + '</p></div></body></html>';
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
        quizResults.appendChild(certBtn);
      }
    }

    function startQuiz() {
      // Check if user entered name
      var name = (quizName.value || '').trim();
      if (!name) {
        alert('Please enter your name to start the quiz.');
        quizName.focus();
        return;
      }

      // Check if user has watched at least one video
      var watchedVideos = getWatchedVideos();
      var currentVideoIds = getCurrentVideoIds();
      var currentWatchedCount = currentVideoIds.filter(function(id) { return watchedVideos.includes(id); }).length;
      if (currentWatchedCount === 0) {
        alert('Please watch at least one training video before taking the quiz.');
        return;
      }

      quizStart.style.display = 'none';
      quizQuestions.style.display = 'block';
      currentQ = 0;
      renderQuestion(0);
    }

    quizStartBtn.onclick = startQuiz;

    quizPrevBtn.onclick = function() {
      if (currentQ > 0) {
        currentQ--;
        renderQuestion(currentQ);
      }
    };

    quizNextBtn.onclick = function() {
      if (currentQ < QUIZ_DATA.length - 1) {
        if (!reviewed && answers[currentQ] === null) {
          alert('Please select an answer before proceeding.');
          return;
        }
        currentQ++;
        renderQuestion(currentQ);
      }
    };

    quizSubmitBtn.onclick = function() {
      var unanswered = 0;
      for (var i = 0; i < answers.length; i++) { if (answers[i] === null) unanswered++; }
      if (unanswered > 0 && !confirm('You have ' + unanswered + ' unanswered question(s). Submit anyway?')) return;
      showResults();
    };

    quizReviewBtn.onclick = function() {
      reviewed = true;
      quizResults.style.display = 'none';
      quizQuestions.style.display = 'block';
      currentQ = 0;
      renderQuestion(0);
      quizReviewList.innerHTML = '';
      quizReviewList.style.display = 'none';
    };

    quizRestartBtn.onclick = function() {
      for (var i = 0; i < answers.length; i++) answers[i] = null;
      reviewed = false;
      currentQ = 0;
      quizResults.style.display = 'none';
      quizStart.style.display = 'block';
      quizQuestions.style.display = 'none';
      quizName.value = '';
    };
  } catch(e) {
    console.error('Quiz init error:', e);
  }
})();

// Simple contact form handler (mailto fallback — no backend)
const form = document.getElementById('contactForm');
if (form) form.addEventListener('submit', e => { e.preventDefault(); alert('Sample contact form only. No message was sent. Configure a real contact destination before use.'); });

// ── Online Form Tabs (Employee / Client) ──
(function() {
  var tabs = document.querySelectorAll('.app-tab');
  var forms = document.querySelectorAll('.app-form');
  if (!tabs.length || !forms.length) return;

  tabs.forEach(function(tab) {
    tab.onclick = function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      forms.forEach(function(f) { f.classList.remove('active'); });
      var target = document.getElementById('form-' + tab.getAttribute('data-form'));
      if (target) target.classList.add('active');
    };
  });
})();

// ── Employee Form Submission ──
(function() {
  var empForm = document.getElementById('employeeForm');
  if (!empForm) return;
  var demoForm = typeof empForm !== 'undefined' ? empForm : clForm;
  demoForm.addEventListener('submit', function(e) { e.preventDefault(); alert('Sample form only. No information or files were saved or sent.'); });
})();

// ── Client Form Submission ──
(function() {
  var clForm = document.getElementById('clientForm');
  if (!clForm) return;
  var demoForm = typeof empForm !== 'undefined' ? empForm : clForm;
  demoForm.addEventListener('submit', function(e) { e.preventDefault(); alert('Sample form only. No information or files were saved or sent.'); });
})();

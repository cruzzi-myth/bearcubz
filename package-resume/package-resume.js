/* ============================================================
   BEλR CUBZ × MOON RACER — Industry Package
   Vanilla JS. No dependencies. No autoplay.
   - scroll reveal (IntersectionObserver, respects reduced motion)
   - sticky header shade on scroll
   - three-track sampler: native <audio>, only one plays at a time,
     custom play/pause + seek + volume, keyboard accessible
   ============================================================ */
(function () {
  'use strict';

  /* ---------- header shade ---------- */
  var head = document.getElementById('prHead');
  var onScroll = function () {
    if (head) head.classList.toggle('pr-scrolled', window.scrollY > 40);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- scroll reveal ---------- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.pr-reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('pr-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('pr-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- sampler ---------- */
  var fmt = function (s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' + r : r);
  };

  // paint the filled portion of a themed range input (cyan→pink)
  var paintRange = function (input) {
    var min = Number(input.min || 0);
    var max = Number(input.max || 100);
    var val = Number(input.value || 0);
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    input.style.background =
      'linear-gradient(90deg, var(--cyan) 0%, var(--pink) ' + pct + '%, rgba(255,255,255,.14) ' + pct + '%)';
  };

  var players = [];

  document.querySelectorAll('[data-player]').forEach(function (root) {
    var audio = root.querySelector('audio');
    var playBtn = root.querySelector('[data-play]');
    var seek = root.querySelector('[data-seek]');
    var vol = root.querySelector('[data-vol]');
    var curEl = root.querySelector('[data-cur]');
    var durEl = root.querySelector('[data-dur]');
    var card = root.closest('.pr-track');
    if (!audio || !playBtn || !seek) return;

    var seeking = false;
    var api = { audio: audio, reset: null };

    var setPlayingUI = function (on) {
      playBtn.textContent = on ? '❚❚' : '▶';
      var label = playBtn.getAttribute('aria-label') || '';
      playBtn.setAttribute('aria-label', label.replace(/^(Play|Pause) /, (on ? 'Pause ' : 'Play ')));
      if (card) card.classList.toggle('pr-track--active', on);
    };
    api.reset = function () {
      audio.pause();
    };

    playBtn.addEventListener('click', function () {
      if (audio.paused) {
        // stop every other track first — only one at a time
        players.forEach(function (p) { if (p.audio !== audio) p.reset(); });
        var pr = audio.play();
        if (pr && pr.catch) pr.catch(function () { setPlayingUI(false); });
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', function () { setPlayingUI(true); });
    audio.addEventListener('pause', function () { setPlayingUI(false); });
    audio.addEventListener('ended', function () {
      setPlayingUI(false);
      audio.currentTime = 0;
      seek.value = 0; paintRange(seek);
      if (curEl) curEl.textContent = '0:00';
    });

    audio.addEventListener('loadedmetadata', function () {
      if (durEl && isFinite(audio.duration)) durEl.textContent = fmt(audio.duration);
    });

    audio.addEventListener('timeupdate', function () {
      if (seeking || !isFinite(audio.duration) || audio.duration === 0) return;
      seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
      paintRange(seek);
      if (curEl) curEl.textContent = fmt(audio.currentTime);
    });

    var doSeek = function () {
      if (!isFinite(audio.duration) || audio.duration === 0) return;
      audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
      if (curEl) curEl.textContent = fmt(audio.currentTime);
    };
    seek.addEventListener('input', function () { seeking = true; paintRange(seek); });
    seek.addEventListener('change', function () { doSeek(); seeking = false; });

    if (vol) {
      var applyVol = function () {
        audio.volume = Number(vol.value) / 100;
        audio.muted = audio.volume === 0;
        paintRange(vol);
      };
      vol.addEventListener('input', applyVol);
      applyVol();
    }

    paintRange(seek);
    players.push(api);
  });
})();

/* ==========================================================================
   Adwait Chavan — site behaviour
   No dependencies. Everything degrades gracefully without JS.
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var lerp = function (a, b, n) { return a + (b - a) * n; };

  /* ---------------------------------------------------------------- theme */
  (function theme() {
    var root = document.documentElement;
    var saved = null;
    try { saved = localStorage.getItem('ac-theme'); } catch (e) {}
    // The design is cream-first; dark is opt-in via the toggle, not the OS.
    root.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');

    var btn = $('#themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      var meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#16130F' : '#F2EDE4');
      try { localStorage.setItem('ac-theme', next); } catch (e) {}
    });
  }());

  /* ------------------------------------------------------------ preloader */
  (function preloader() {
    var el = document.getElementById('loader');
    if (!el) return;
    var out = $('#loaderCount');
    var bar = $('#loaderBar');
    var total = reduced ? 150 : 900;
    var t0 = Date.now();
    var timer = null;
    var done = false;

    document.body.classList.add('is-locked');

    function finish() {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      if (out) out.textContent = '100';
      if (bar) bar.style.width = '100%';
      el.classList.add('is-done');
      document.body.classList.remove('is-locked');
      window.setTimeout(function () { if (el.parentNode) el.remove(); }, reduced ? 200 : 1500);
    }

    function tick() {
      var t = Math.min(1, (Date.now() - t0) / total);
      var eased = 1 - Math.pow(1 - t, 3); // decelerate into 100
      var n = Math.round(eased * 100);
      if (out) out.textContent = n;
      if (bar) bar.style.width = n + '%';
      if (t >= 1) finish();
    }

    // setInterval (not rAF) so a backgrounded tab still completes the intro
    timer = window.setInterval(tick, 40);
    tick();
    // hard safety net: never let the overlay trap the page
    window.setTimeout(finish, total + 1200);
    window.addEventListener('pageshow', tick);
  }());

  /* ------------------------------------------------------- split headings */
  $$('[data-split]').forEach(function (el) {
    var lines = $$(':scope > span', el);
    if (!lines.length) return;
    $$('br', el).forEach(function (br) { br.remove(); });
    lines.forEach(function (span) {
      var line = document.createElement('span');
      line.className = 'line';
      var inner = document.createElement('i');
      el.insertBefore(line, span);
      line.appendChild(inner);
      inner.appendChild(span);
    });
  });

  /* --------------------------------------------------- reveal on scroll  */
  /* Driven by scroll position rather than IntersectionObserver. IO looked
     tidier, but it silently stopped delivering entries after the first batch
     in several environments, which left every section below the fold stuck at
     opacity:0. A rect check on a rAF-throttled scroll handler always works,
     costs a handful of reads per frame, and each queue empties as it goes. */

  var revealQueue = $$('.reveal, [data-split], .signature');
  var barQueue    = $$('.bar');
  var countQueue  = $$('[data-count]');

  function fillBar(b) {
    var i = $('.bar__track i', b);
    if (i) i.style.width = (b.getAttribute('data-val') || 0) + '%';
  }

  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    if (reduced) { el.textContent = target.toFixed(dec); return; }
    var t0 = performance.now();
    (function step(now) {
      var t = Math.min(1, (now - t0) / 1500);
      el.textContent = (target * (1 - Math.pow(1 - t, 4))).toFixed(dec);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(dec);
    }(t0));
  }

  if (reduced) {
    revealQueue.forEach(function (el) { el.classList.add('is-in'); });
    barQueue.forEach(fillBar);
    countQueue.forEach(runCount);
    revealQueue = []; barQueue = []; countQueue = [];
  } else {
    // markup ships the final figures so they read correctly without JS
    countQueue.forEach(function (n) {
      n.textContent = (0).toFixed(parseInt(n.getAttribute('data-dec') || '0', 10));
    });
    barQueue.forEach(function (b) {
      var i = $('.bar__track i', b);
      if (i) i.style.width = '0%';
    });
  }

  /* Sweep each queue, acting on whatever has come far enough up the screen.
     Splice as we go, so an element is only ever handled once. */
  function sweep() {
    var vh = window.innerHeight;
    var i, r, el;

    for (i = revealQueue.length - 1; i >= 0; i--) {
      el = revealQueue[i];
      r = el.getBoundingClientRect();
      if (r.top < vh * 0.88 && r.bottom > 0) {
        revealQueue.splice(i, 1);
        (function (node) {
          var d = parseInt(node.getAttribute('data-delay') || '0', 10);
          window.setTimeout(function () { node.classList.add('is-in'); }, d);
        }(el));
      }
    }
    for (i = barQueue.length - 1; i >= 0; i--) {
      r = barQueue[i].getBoundingClientRect();
      if (r.top < vh * 0.85 && r.bottom > 0) { fillBar(barQueue[i]); barQueue.splice(i, 1); }
    }
    for (i = countQueue.length - 1; i >= 0; i--) {
      r = countQueue[i].getBoundingClientRect();
      if (r.top < vh * 0.85 && r.bottom > 0) { runCount(countQueue[i]); countQueue.splice(i, 1); }
    }
  }

  /* Called straight from the scroll handler rather than deferred into rAF:
     rAF is throttled or suspended in enough situations (background tabs,
     prerender, capture tooling) that it isn't safe for something as load-
     bearing as "is this content visible". sweep() only reads geometry, and
     each queue drains as it goes, so it stays cheap. */
  function onScroll() {
    if (!revealQueue.length && !barQueue.length && !countQueue.length) return;
    sweep();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', onScroll);
  sweep();
  // catch late layout shifts (web fonts, images settling) without a scroll
  window.setTimeout(sweep, 400);
  window.setTimeout(sweep, 1600);

  /* ------------------------------------------------- kinetic hero word  */
  (function kineticWord() {
    var stage = $('#giant');
    if (!stage) return;
    var words = $$('.gword', stage);
    if (words.length < 2 || reduced) return;

    var i = 0;
    var timer = null;

    function advance() {
      var current = words[i];
      i = (i + 1) % words.length;
      var next = words[i];
      current.classList.remove('is-active');
      current.classList.add('is-out');
      next.classList.remove('is-out');
      // force a reflow so the incoming word starts from below rather than
      // inheriting the outgoing transform mid-flight
      void next.offsetWidth;
      next.classList.add('is-active');
    }

    function start() { if (!timer) timer = window.setInterval(advance, 3200); }
    function stop() { window.clearInterval(timer); timer = null; }

    // don't animate while the tab is hidden — it just burns frames
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    window.setTimeout(start, 1400);
  }());

  /* ---------------------------------------------------- travel slides  */
  (function slideshow() {
    $$('[data-slideshow]').forEach(function (stage) {
      var slides = $$('.slide', stage);
      var dots = $$('.slides__dot', stage);
      if (slides.length < 2) return;

      var i = 0;
      var timer = null;
      var HOLD = 4200;

      function play(slide) {
        var v = $('video', slide);
        if (!v) return;
        // preload="none" means the source isn't fetched until we ask for it
        if (!v.getAttribute('data-loaded')) { v.setAttribute('data-loaded', '1'); v.load(); }
        var p = v.play();
        if (p && p.catch) p.catch(function () {}); // autoplay refusal is fine
      }
      function pause(slide) {
        var v = $('video', slide);
        if (v) { try { v.pause(); } catch (e) {} }
      }

      function show(n) {
        if (n === i) return;
        pause(slides[i]);
        slides[i].classList.remove('is-active');
        if (dots[i]) dots[i].classList.remove('is-active');
        i = n;
        slides[i].classList.add('is-active');
        if (dots[i]) dots[i].classList.add('is-active');
        play(slides[i]);
      }

      function next() { show((i + 1) % slides.length); }
      function start() { if (!timer && !reduced) timer = window.setInterval(next, HOLD); }
      function stop() { window.clearInterval(timer); timer = null; }

      dots.forEach(function (d, n) {
        d.addEventListener('click', function () { stop(); show(n); start(); });
      });

      // let people linger on a frame
      stage.addEventListener('mouseenter', stop);
      stage.addEventListener('mouseleave', start);

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { stop(); pause(slides[i]); } else { start(); play(slides[i]); }
      });

      // only run while the tile is actually on screen
      var running = false;
      function check() {
        var r = stage.getBoundingClientRect();
        var visible = r.top < window.innerHeight && r.bottom > 0;
        if (visible && !running) { running = true; play(slides[i]); start(); }
        else if (!visible && running) { running = false; stop(); pause(slides[i]); }
      }
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      check();
    });
  }());

  /* ------------------------------------------------------------- marquee */
  (function marquee() {
    var track = $('#marqueeTrack');
    if (!track) return;
    track.innerHTML += track.innerHTML; // duplicate for a seamless -50% loop
  }());

  /* ---------------------------------------------- scroll: nav, progress   */
  (function scrollChrome() {
    var nav = $('#nav');
    var bar = $('#scrollBar');
    var last = window.scrollY;
    var ticking = false;
    var sections = $$('main section[id]');
    var links = $$('.nav__links a');

    function update() {
      var y = window.scrollY;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';

      if (nav) {
        nav.classList.toggle('is-stuck', y > 24);
        var goingDown = y > last && y > 320 && !$('#menu').classList.contains('is-open');
        nav.classList.toggle('is-hidden', goingDown);
      }

      var current = '';
      sections.forEach(function (s) {
        if (s.getBoundingClientRect().top <= window.innerHeight * 0.35) current = s.id;
      });
      links.forEach(function (a) {
        a.classList.toggle('is-current', a.getAttribute('href') === '#' + current);
      });

      last = y;
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }());

  /* ------------------------------------------------------------ parallax */
  (function parallax() {
    var items = $$('[data-parallax]');
    if (!items.length || reduced) return;
    var ticking = false;
    function run() {
      var vh = window.innerHeight;
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var amt = parseFloat(el.getAttribute('data-parallax')) || 0;
        var progress = (r.top + r.height / 2 - vh / 2) / vh; // -1 .. 1
        el.style.transform = 'translate3d(0,' + (progress * amt).toFixed(2) + 'px,0)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(run); }
    }, { passive: true });
    window.addEventListener('resize', run);
    run();
  }());

  /* ---------------------------------------------------------------- tilt */
  (function tilt() {
    if (!finePointer || reduced) return;
    $$('[data-tilt]').forEach(function (el) {
      var raf = null, tx = 0, ty = 0, cx = 0, cy = 0;
      function render() {
        cx = lerp(cx, tx, 0.12); cy = lerp(cy, ty, 0.12);
        el.style.transform = 'perspective(900px) rotateX(' + (-cy).toFixed(2) + 'deg) rotateY(' + cx.toFixed(2) + 'deg)';
        if (Math.abs(cx - tx) > 0.01 || Math.abs(cy - ty) > 0.01) { raf = requestAnimationFrame(render); }
        else { raf = null; if (tx === 0 && ty === 0) el.style.transform = ''; }
      }
      function kick() { if (!raf) raf = requestAnimationFrame(render); }
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 7;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 7;
        kick();
      });
      el.addEventListener('mouseleave', function () { tx = 0; ty = 0; kick(); });
    });
  }());

  /* -------------------------------------------------------- custom cursor */
  (function cursor() {
    if (!finePointer) return;
    var ring = $('#cursor');
    var dot = $('#cursorDot');
    var label = $('#cursorLabel');
    if (!ring || !dot) return;

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;

    window.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      document.body.classList.add('cursor-ready');
    }, { passive: true });

    (function loop() {
      rx = lerp(rx, mx, 0.16); ry = lerp(ry, my, 0.16);
      ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';
      requestAnimationFrame(loop);
    }());

    var hotSel = 'a, button, [data-project], [data-cursor], summary, .toolbelt li';
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest(hotSel) : null;
      if (!t) return;
      var txt = t.getAttribute('data-cursor') || (t.closest('[data-cursor]') && t.closest('[data-cursor]').getAttribute('data-cursor'));
      if (txt) { label.textContent = txt; ring.classList.add('is-active'); }
      else { ring.classList.add('is-active'); label.textContent = ''; }
      dot.classList.add('is-hidden');
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target.closest ? e.target.closest(hotSel) : null;
      if (!t) return;
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(hotSel)) return;
      ring.classList.remove('is-active');
      label.textContent = '';
      dot.classList.remove('is-hidden');
    });
  }());

  /* ------------------------------------------------------ magnetic hover */
  (function magnetic() {
    if (!finePointer || reduced) return;
    $$('.magnetic').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.28;
        var y = (e.clientY - r.top - r.height / 2) * 0.34;
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        el.style.transition = 'transform .12s linear';
      });
      el.addEventListener('mouseleave', function () {
        el.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1)';
        el.style.transform = '';
      });
    });
  }());

  /* ------------------------------------------------------- menu + anchors */
  (function nav() {
    var burger = $('#burger');
    var menu = $('#menu');

    function closeMenu() {
      if (!menu) return;
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
      if (burger) { burger.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
      document.body.classList.remove('is-locked');
    }

    if (burger && menu) {
      burger.addEventListener('click', function () {
        var open = !menu.classList.contains('is-open');
        menu.classList.toggle('is-open', open);
        menu.setAttribute('aria-hidden', open ? 'false' : 'true');
        burger.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('is-locked', open);
      });
    }

    $$('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (!id || id.charAt(0) !== '#') return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        closeMenu();
        var top = target.getBoundingClientRect().top + window.scrollY - 74;
        window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
        history.replaceState(null, '', id);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }());

  /* --------------------------------------------------------- work modal  */
  (function workModal() {
    var modal = $('#modal');
    if (!modal) return;
    var panel = $('.modal__panel', modal);
    var elNo = $('#modalNo'), elTitle = $('#modalTitle'), elMeta = $('#modalMeta'), elBody = $('#modalBody');
    var lastFocused = null;

    function open(row) {
      lastFocused = document.activeElement;
      elNo.textContent = $('.work__no', row).textContent;
      elTitle.textContent = $('.work__main h3', row).textContent;
      elMeta.textContent = $('.work__meta', row).textContent;
      elBody.innerHTML = $('.work__detail', row).innerHTML;
      modal.hidden = false;
      document.body.classList.add('is-locked');
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      window.setTimeout(function () { $('.modal__close', modal).focus(); }, 60);
    }

    function close() {
      modal.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      window.setTimeout(function () { modal.hidden = true; }, 420);
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    $$('[data-project]').forEach(function (row) {
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.addEventListener('click', function () { open(row); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(row); }
      });
    });

    $$('[data-close]', modal).forEach(function (b) { b.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
      if (e.key === 'Tab' && !modal.hidden) {
        var f = $$('a[href],button,[tabindex]:not([tabindex="-1"])', panel);
        if (!f.length) return;
        var first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    });
  }());

  /* ------------------------------------- hobby photos: graceful fallback  */
  (function hobbyFallback() {
    $$('img[data-fallback]').forEach(function (img) {
      var fig = img.closest('.hobby');
      var fail = function () { if (fig) fig.classList.add('no-photo'); };
      img.addEventListener('error', fail);
      // already-broken images fire no event once cached as failed
      if (img.complete && img.naturalWidth === 0) fail();
    });
  }());

  /* ------------------------------------------------------- footer extras */
  (function footer() {
    var y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    var clock = $('#clock');
    if (clock) {
      var tick = function () {
        try {
          clock.textContent = new Date().toLocaleTimeString('en-US', {
            timeZone: 'America/New_York', hour12: false
          });
        } catch (e) {
          clock.textContent = new Date().toLocaleTimeString();
        }
      };
      tick();
      window.setInterval(tick, 1000);
    }

    var top = $('#toTop');
    if (top) {
      top.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      });
    }
  }());

}());

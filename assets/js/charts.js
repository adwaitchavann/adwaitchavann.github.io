/* ==========================================================================
   AC.charts — dependency-free SVG charting for the case studies.

   Every chart renders at the host element's measured pixel width, so text
   stays at its true size instead of being scaled by a viewBox. A
   ResizeObserver re-renders on layout change.

   Colour is never written into the SVG. Marks carry semantic classes
   (.c-bar, .c-bar--neg, .c-axis …) and case.css paints them from the theme
   tokens, so the dark-mode toggle needs no redraw.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var AC = window.AC || (window.AC = {});

  /* ------------------------------------------------------------- helpers */

  function svgEl(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  function text(x, y, str, cls, anchor) {
    var t = svgEl('text', { x: x, y: y, class: cls || 'c-label', 'text-anchor': anchor || 'middle' });
    t.textContent = str;
    return t;
  }

  /* Round a span up to a readable tick interval (1, 2, 2.5, 5 × 10ⁿ). */
  function niceStep(span, targetTicks) {
    var raw = span / (targetTicks || 5);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 2 ? 2.5 : norm >= 1 ? 2 : 1;
    return step * mag;
  }

  function axisTicks(min, max, target) {
    var step = niceStep(max - min, target || 5);
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    // accumulate by index, not repeated addition, to avoid float drift
    for (var i = 0; lo + i * step <= hi + step * 1e-9; i++) out.push(lo + i * step);
    return { ticks: out, lo: lo, hi: hi };
  }

  var fmt = {
    money: function (v, dp) {
      var a = Math.abs(v), s = v < 0 ? '−' : '';
      if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(dp == null ? 2 : dp) + 'B';
      if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(dp == null ? 1 : dp) + 'M';
      if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(dp == null ? 0 : dp) + 'K';
      return s + '$' + a.toFixed(dp == null ? 0 : dp);
    },
    num: function (v, dp) {
      return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', {
        minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0
      });
    },
    pct: function (v, dp) { return (v * 100).toFixed(dp == null ? 1 : dp) + '%'; },
    bps: function (v) { return Math.round(v * 10000) + ' bps'; },
    x: function (v, dp) { return v.toFixed(dp == null ? 1 : dp) + '×'; }
  };
  AC.fmt = fmt;

  /* Base: measure the host, hand the render fn a clean <svg>, redraw on resize. */
  function mount(host, height, render) {
    if (typeof host === 'string') host = document.querySelector(host);
    if (!host) return null;

    var state = { opts: null, w: 0 };

    function draw() {
      var w = Math.round(host.getBoundingClientRect().width);
      if (!w) return;                       // hidden (display:none) — wait for visibility
      state.w = w;
      var h = typeof height === 'function' ? height(state.opts, w) : height;
      var svg = svgEl('svg', {
        class: 'c-svg', width: w, height: h,
        viewBox: '0 0 ' + w + ' ' + h, role: 'img'
      });
      if (state.opts && state.opts.title) {
        var ttl = svgEl('title');
        ttl.textContent = state.opts.title;
        svg.appendChild(ttl);
      }
      render(svg, state.opts, w, h);
      host.textContent = '';
      host.appendChild(svg);
    }

    var api = {
      host: host,
      update: function (opts) { state.opts = opts; draw(); return api; },
      redraw: draw
    };

    if (window.ResizeObserver) {
      var last = 0;
      new ResizeObserver(function () {
        var w = Math.round(host.getBoundingClientRect().width);
        if (w && w !== last) { last = w; draw(); }
      }).observe(host);
    } else {
      window.addEventListener('resize', draw);
    }
    return api;
  }

  /* ===================================================================== */
  /* Waterfall — the profit bridge. Bars float between running totals.      */
  /* items: [{ label, value, kind:'base'|'delta'|'total', note }]           */
  /* ===================================================================== */
  AC.waterfall = function (host, opts) {
    var chart = mount(host, function (o, w) { return w < 560 ? 320 : 400; }, function (svg, o, w, h) {
      if (!o || !o.items || !o.items.length) return;
      var f = o.format || fmt.money;
      var padL = 8, padR = 8, padT = 34, padB = w < 560 ? 62 : 52;
      var plotW = w - padL - padR, plotH = h - padT - padB;

      // walk the bars once to find the running extent
      var run = 0, lo = 0, hi = 0, spans = [];
      o.items.forEach(function (it) {
        if (it.kind === 'delta') {
          spans.push({ from: run, to: run + it.value });
          run += it.value;
        } else {
          spans.push({ from: 0, to: it.value });
          run = it.value;
        }
        lo = Math.min(lo, run, 0); hi = Math.max(hi, run);
      });

      var ax = axisTicks(lo, hi, 5);
      var y = function (v) { return padT + plotH - (v - ax.lo) / (ax.hi - ax.lo) * plotH; };

      ax.ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { class: 'c-grid', x1: padL, x2: w - padR, y1: y(t), y2: y(t) }));
        svg.appendChild(text(padL + 2, y(t) - 5, f(t, 0), 'c-tick', 'start'));
      });

      var n = o.items.length;
      var slot = plotW / n, bw = Math.min(slot * 0.62, 88);

      o.items.forEach(function (it, i) {
        var cx = padL + slot * i + slot / 2;
        var s = spans[i];
        var y1 = y(Math.max(s.from, s.to)), y2 = y(Math.min(s.from, s.to));
        var barH = Math.max(Math.abs(y2 - y1), 1.5);
        var cls = it.kind === 'delta'
          ? (it.value >= 0 ? 'c-bar c-bar--pos' : 'c-bar c-bar--neg')
          : 'c-bar c-bar--anchor';

        var r = svgEl('rect', { class: cls, x: cx - bw / 2, y: y1, width: bw, height: barH, rx: 2 });
        r.appendChild(svgEl('title')).textContent = it.label + ': ' + f(it.value);
        svg.appendChild(r);

        // connector into the next bar
        if (i < n - 1 && o.items[i + 1].kind === 'delta') {
          var endY = y(s.to);
          svg.appendChild(svgEl('line', {
            class: 'c-connect', x1: cx + bw / 2, x2: padL + slot * (i + 1) + slot / 2 - bw / 2,
            y1: endY, y2: endY
          }));
        }

        var vLabel = it.kind === 'delta' && it.value >= 0 ? '+' + f(it.value) : f(it.value);
        svg.appendChild(text(cx, y1 - 8, vLabel, 'c-val'));

        // wrap category labels onto two lines when the slot is tight
        var words = String(it.label).split(' ');
        var lines = [words.join(' ')];
        if (words.length > 1 && slot < 96) {
          var mid = Math.ceil(words.length / 2);
          lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
        }
        lines.forEach(function (ln, li) {
          svg.appendChild(text(cx, padT + plotH + 20 + li * 13, ln, 'c-cat'));
        });
      });

      svg.appendChild(svgEl('line', { class: 'c-axis', x1: padL, x2: w - padR, y1: y(ax.lo), y2: y(ax.lo) }));
    });
    return chart && chart.update(opts);
  };

  /* ===================================================================== */
  /* Histogram — Monte Carlo outcome distribution with percentile markers.  */
  /* ===================================================================== */
  AC.histogram = function (host, opts) {
    var chart = mount(host, function (o, w) { return w < 560 ? 280 : 340; }, function (svg, o, w, h) {
      if (!o || !o.values || !o.values.length) return;
      var f = o.format || fmt.money;
      var padL = 8, padR = 8, padT = 34, padB = 58;   // headroom for the second label lane
      var plotW = w - padL - padR, plotH = h - padT - padB;

      var vals = o.values, min = Infinity, max = -Infinity;
      for (var i = 0; i < vals.length; i++) { if (vals[i] < min) min = vals[i]; if (vals[i] > max) max = vals[i]; }
      var bins = o.bins || Math.min(46, Math.max(18, Math.round(plotW / 16)));
      var bw = (max - min) / bins || 1;
      var counts = new Array(bins).fill(0);
      for (i = 0; i < vals.length; i++) {
        var b = Math.min(bins - 1, Math.floor((vals[i] - min) / bw));
        counts[b]++;
      }
      var peak = Math.max.apply(null, counts);

      var x = function (v) { return padL + (v - min) / (max - min || 1) * plotW; };
      var colW = plotW / bins;

      counts.forEach(function (c, i) {
        var bh = c / peak * plotH;
        svg.appendChild(svgEl('rect', {
          class: 'c-hist', x: padL + i * colW + 0.5, y: padT + plotH - bh,
          width: Math.max(colW - 1, 1), height: bh
        }));
      });

      svg.appendChild(svgEl('line', {
        class: 'c-axis', x1: padL, x2: w - padR, y1: padT + plotH, y2: padT + plotH
      }));

      /* Markers often sit close together (a median beside an asking price),
         so labels get two lanes and fall into the second when they would
         collide with whatever was placed last. */
      var laneX = [-1e9, -1e9], GAP = 54;
      (o.markers || []).slice()
        .sort(function (a, b) { return a.value - b.value; })
        .forEach(function (m) {
          var mx = x(m.value);
          var lane = (mx - laneX[0] < GAP && mx - laneX[1] >= GAP) ? 1 : 0;
          laneX[lane] = mx;
          svg.appendChild(svgEl('line', {
            class: 'c-mark' + (m.strong ? ' c-mark--strong' : ''),
            x1: mx, x2: mx, y1: padT - 6 - lane * 13, y2: padT + plotH
          }));
          var anchor = mx > w - 70 ? 'end' : mx < 70 ? 'start' : 'middle';
          svg.appendChild(text(mx, padT - 12 - lane * 13, m.label, 'c-marklabel', anchor));
          svg.appendChild(text(mx, padT + plotH + 18 + lane * 13, f(m.value), 'c-tick', anchor));
        });

      if (o.axisLabel) svg.appendChild(text(w / 2, h - 10, o.axisLabel, 'c-axislabel'));
    });
    return chart && chart.update(opts);
  };

  /* ===================================================================== */
  /* Range bars — the valuation "football field".                          */
  /* items: [{ label, lo, hi, point, note }]                               */
  /* ===================================================================== */
  AC.rangeBars = function (host, opts) {
    var chart = mount(host, function (o, w) {
      return 56 + (o && o.items ? o.items.length : 3) * 46;
    }, function (svg, o, w, h) {
      if (!o || !o.items) return;
      var f = o.format || fmt.money;
      var narrow = w < 620;
      var padL = narrow ? 8 : 168, padR = 8, padT = 26, padB = 30;
      var plotW = w - padL - padR;

      var lo = Infinity, hi = -Infinity;
      o.items.forEach(function (it) { lo = Math.min(lo, it.lo); hi = Math.max(hi, it.hi); });
      if (o.reference != null) { lo = Math.min(lo, o.reference); hi = Math.max(hi, o.reference); }
      var pad = (hi - lo) * 0.12;
      var ax = axisTicks(lo - pad, hi + pad, 5);
      var x = function (v) { return padL + (v - ax.lo) / (ax.hi - ax.lo) * plotW; };

      var rowH = 46, top = padT;

      ax.ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', {
          class: 'c-grid', x1: x(t), x2: x(t), y1: top - 8, y2: top + o.items.length * rowH
        }));
        svg.appendChild(text(x(t), top - 14, f(t, 1), 'c-tick'));
      });

      o.items.forEach(function (it, i) {
        var cy = top + i * rowH + rowH / 2 + (narrow ? 6 : 0);
        if (narrow) {
          svg.appendChild(text(padL, cy - 18, it.label, 'c-cat c-cat--left', 'start'));
        } else {
          svg.appendChild(text(padL - 14, cy + 4, it.label, 'c-cat c-cat--left', 'end'));
        }
        var x1 = x(it.lo), x2 = x(it.hi);
        svg.appendChild(svgEl('rect', {
          class: 'c-range' + (it.emphasis ? ' c-range--key' : ''),
          x: x1, y: cy - 11, width: Math.max(x2 - x1, 2), height: 22, rx: 3
        }));
        svg.appendChild(text(x1 - 6, cy + 4, f(it.lo, 1), 'c-tick', 'end'));
        svg.appendChild(text(x2 + 6, cy + 4, f(it.hi, 1), 'c-tick', 'start'));
        if (it.point != null) {
          svg.appendChild(svgEl('line', {
            class: 'c-rangepoint', x1: x(it.point), x2: x(it.point), y1: cy - 14, y2: cy + 14
          }));
        }
      });

      if (o.reference != null) {
        var rx = x(o.reference);
        svg.appendChild(svgEl('line', {
          class: 'c-mark c-mark--strong', x1: rx, x2: rx, y1: top - 8, y2: top + o.items.length * rowH + 6
        }));
        svg.appendChild(text(rx, top + o.items.length * rowH + 22, o.referenceLabel || 'Ask', 'c-marklabel'));
      }
    });
    return chart && chart.update(opts);
  };

  /* ===================================================================== */
  /* Scatter — value/feasibility and cost-to-serve matrices.               */
  /* points: [{ x, y, r, label, state:'on'|'off'|'watch' }]                */
  /* ===================================================================== */
  AC.scatter = function (host, opts) {
    var chart = mount(host, function (o, w) { return w < 560 ? 340 : 440; }, function (svg, o, w, h) {
      if (!o || !o.points) return;
      var padL = 46, padR = 16, padT = 18, padB = 46;
      var plotW = w - padL - padR, plotH = h - padT - padB;

      var xd = o.xDomain || [0, 10], yd = o.yDomain || [0, 10];
      var X = function (v) { return padL + (v - xd[0]) / (xd[1] - xd[0]) * plotW; };
      var Y = function (v) { return padT + plotH - (v - yd[0]) / (yd[1] - yd[0]) * plotH; };

      var xa = axisTicks(xd[0], xd[1], 4), ya = axisTicks(yd[0], yd[1], 4);
      xa.ticks.forEach(function (t) {
        if (t < xd[0] || t > xd[1]) return;
        svg.appendChild(svgEl('line', { class: 'c-grid', x1: X(t), x2: X(t), y1: padT, y2: padT + plotH }));
        svg.appendChild(text(X(t), padT + plotH + 18, o.xFormat ? o.xFormat(t) : t, 'c-tick'));
      });
      ya.ticks.forEach(function (t) {
        if (t < yd[0] || t > yd[1]) return;
        svg.appendChild(svgEl('line', { class: 'c-grid', x1: padL, x2: padL + plotW, y1: Y(t), y2: Y(t) }));
        svg.appendChild(text(padL - 8, Y(t) + 4, o.yFormat ? o.yFormat(t) : t, 'c-tick', 'end'));
      });

      // quadrant split
      if (o.quadrant) {
        svg.appendChild(svgEl('line', {
          class: 'c-quad', x1: X(o.quadrant[0]), x2: X(o.quadrant[0]), y1: padT, y2: padT + plotH
        }));
        svg.appendChild(svgEl('line', {
          class: 'c-quad', x1: padL, x2: padL + plotW, y1: Y(o.quadrant[1]), y2: Y(o.quadrant[1])
        }));
      }
      (o.zones || []).forEach(function (z) {
        svg.appendChild(text(X(z.x), Y(z.y), z.label, 'c-zone'));
      });

      o.points.forEach(function (p) {
        var g = svgEl('g', { class: 'c-pt c-pt--' + (p.state || 'off') });
        var c = svgEl('circle', { cx: X(p.x), cy: Y(p.y), r: p.r || 9 });
        c.appendChild(svgEl('title')).textContent = p.title || p.label;
        g.appendChild(c);
        if (p.tag) g.appendChild(text(X(p.x), Y(p.y) + 4, p.tag, 'c-pttag'));
        svg.appendChild(g);
      });

      if (o.xLabel) svg.appendChild(text(padL + plotW / 2, h - 8, o.xLabel, 'c-axislabel'));
      if (o.yLabel) {
        var yl = text(0, 0, o.yLabel, 'c-axislabel');
        yl.setAttribute('transform', 'translate(13,' + (padT + plotH / 2) + ') rotate(-90)');
        svg.appendChild(yl);
      }
    });
    return chart && chart.update(opts);
  };

  /* ===================================================================== */
  /* Stacked columns — cost-to-serve build-up by segment.                  */
  /* series: [{ name, values:[…] }], categories: [...]                     */
  /* ===================================================================== */
  AC.stackedColumns = function (host, opts) {
    var chart = mount(host, function (o, w) { return w < 560 ? 320 : 380; }, function (svg, o, w, h) {
      if (!o || !o.series) return;
      var f = o.format || fmt.money;
      var padL = 8, padR = 8, padT = 22, padB = 66;
      var plotW = w - padL - padR, plotH = h - padT - padB;

      var totals = o.categories.map(function (_, i) {
        return o.series.reduce(function (s, ser) { return s + ser.values[i]; }, 0);
      });
      var ax = axisTicks(0, Math.max.apply(null, totals), 4);
      var y = function (v) { return padT + plotH - v / ax.hi * plotH; };

      ax.ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { class: 'c-grid', x1: padL, x2: w - padR, y1: y(t), y2: y(t) }));
        svg.appendChild(text(padL + 2, y(t) - 5, f(t, 0), 'c-tick', 'start'));
      });

      var slot = plotW / o.categories.length, bw = Math.min(slot * 0.58, 76);
      o.categories.forEach(function (cat, i) {
        var cx = padL + slot * i + slot / 2, acc = 0;
        o.series.forEach(function (ser, si) {
          var v = ser.values[i];
          var y1 = y(acc + v), y2 = y(acc);
          var r = svgEl('rect', {
            class: 'c-seg c-seg--' + (si + 1), x: cx - bw / 2, y: y1,
            width: bw, height: Math.max(y2 - y1, 0.5)
          });
          r.appendChild(svgEl('title')).textContent = ser.name + ' — ' + cat + ': ' + f(v);
          svg.appendChild(r);
          acc += v;
        });
        svg.appendChild(text(cx, y(acc) - 8, f(acc), 'c-val'));
        String(cat).split(' ').forEach(function (ln, li, arr) {
          svg.appendChild(text(cx, padT + plotH + 20 + li * 13, arr.length > 1 ? ln : cat, 'c-cat'));
        });
      });

      // legend
      var lx = padL, ly = h - 16;
      o.series.forEach(function (ser, si) {
        var g = svgEl('g');
        g.appendChild(svgEl('rect', { class: 'c-seg c-seg--' + (si + 1), x: lx, y: ly - 9, width: 10, height: 10, rx: 2 }));
        var t = text(lx + 15, ly, ser.name, 'c-legend', 'start');
        g.appendChild(t);
        svg.appendChild(g);
        lx += 15 + ser.name.length * 6.1 + 18;
      });
    });
    return chart && chart.update(opts);
  };

  /* ===================================================================== */
  /* Line — scenario paths over time.                                      */
  /* series: [{ name, points:[{x,y}], dashed }]                            */
  /* ===================================================================== */
  AC.lines = function (host, opts) {
    var chart = mount(host, function (o, w) { return w < 560 ? 300 : 360; }, function (svg, o, w, h) {
      if (!o || !o.series) return;
      var f = o.format || fmt.money;
      var padL = 8, padR = 60, padT = 22, padB = 44;
      var plotW = w - padL - padR, plotH = h - padT - padB;

      var xs = [], ys = [];
      o.series.forEach(function (s) {
        s.points.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
      });
      var xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs);
      var ya = axisTicks(Math.min.apply(null, ys), Math.max.apply(null, ys), 4);
      var X = function (v) { return padL + (v - xlo) / (xhi - xlo || 1) * plotW; };
      var Y = function (v) { return padT + plotH - (v - ya.lo) / (ya.hi - ya.lo) * plotH; };

      ya.ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { class: 'c-grid', x1: padL, x2: padL + plotW, y1: Y(t), y2: Y(t) }));
        svg.appendChild(text(padL + 2, Y(t) - 5, f(t, 0), 'c-tick', 'start'));
      });
      xs.filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (t) {
        svg.appendChild(text(X(t), padT + plotH + 18, o.xFormat ? o.xFormat(t) : t, 'c-tick'));
      });

      var labels = [];
      o.series.forEach(function (s, si) {
        var d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x) + ',' + Y(p.y); }).join(' ');
        svg.appendChild(svgEl('path', {
          class: 'c-line c-line--' + (si + 1) + (s.dashed ? ' c-line--dash' : ''), d: d
        }));
        s.points.forEach(function (p) {
          svg.appendChild(svgEl('circle', { class: 'c-dot c-dot--' + (si + 1), cx: X(p.x), cy: Y(p.y), r: 3.4 }));
        });
        var last = s.points[s.points.length - 1];
        labels.push({ x: X(last.x) + 8, y: Y(last.y) + 4, name: s.name, si: si });
      });

      /* Series that converge end at the same height, so nudge labels apart
         rather than letting them print on top of each other. */
      labels.sort(function (a, b) { return a.y - b.y; });
      for (var li = 1; li < labels.length; li++) {
        if (labels[li].y - labels[li - 1].y < 13) labels[li].y = labels[li - 1].y + 13;
      }
      labels.forEach(function (l) {
        svg.appendChild(text(l.x, l.y, l.name, 'c-serieslabel c-serieslabel--' + (l.si + 1), 'start'));
      });
    });
    return chart && chart.update(opts);
  };

  /* ===================================================================== */
  /* Heat table — WACC × terminal-growth sensitivity. HTML, not SVG:       */
  /* a real <table> reads correctly to screen readers and copies cleanly.  */
  /* ===================================================================== */
  AC.heatTable = function (host, opts) {
    if (typeof host === 'string') host = document.querySelector(host);
    if (!host) return null;

    function draw(o) {
      var f = o.format || fmt.money;
      var flat = [];
      o.values.forEach(function (row) { row.forEach(function (v) { flat.push(v); }); });
      var lo = Math.min.apply(null, flat), hi = Math.max.apply(null, flat);

      var t = document.createElement('table');
      t.className = 'heat';
      if (o.caption) {
        var cap = document.createElement('caption');
        cap.textContent = o.caption;
        t.appendChild(cap);
      }
      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      var corner = document.createElement('th');
      corner.className = 'heat__corner';
      corner.innerHTML = '<span>' + o.colLabel + '</span><em>' + o.rowLabel + '</em>';
      hr.appendChild(corner);
      o.cols.forEach(function (c) {
        var th = document.createElement('th');
        th.scope = 'col';
        th.textContent = c;
        hr.appendChild(th);
      });
      thead.appendChild(hr); t.appendChild(thead);

      var tb = document.createElement('tbody');
      o.values.forEach(function (row, ri) {
        var tr = document.createElement('tr');
        var th = document.createElement('th');
        th.scope = 'row';
        th.textContent = o.rows[ri];
        tr.appendChild(th);
        row.forEach(function (v, ci) {
          var td = document.createElement('td');
          var k = hi === lo ? 0.5 : (v - lo) / (hi - lo);
          td.style.setProperty('--k', k.toFixed(3));
          td.textContent = f(v, o.dp);
          if (o.highlight && o.highlight[0] === ri && o.highlight[1] === ci) td.className = 'is-base';
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      host.textContent = '';
      host.appendChild(t);
    }

    var api = { update: function (o) { draw(o); return api; } };
    return api.update(opts);
  };

  /* Deterministic PRNG so every visitor sees the same Monte Carlo run
     (a portfolio piece should not change its answer on refresh). */
  AC.rng = function (seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  };

  /* Box–Muller, driven by the seeded uniform above. */
  AC.normal = function (rand) {
    var spare = null;
    return function (mean, sd) {
      if (spare !== null) { var v = spare; spare = null; return mean + sd * v; }
      var u, v2, s;
      do { u = rand() * 2 - 1; v2 = rand() * 2 - 1; s = u * u + v2 * v2; } while (s >= 1 || s === 0);
      var mul = Math.sqrt(-2 * Math.log(s) / s);
      spare = v2 * mul;
      return mean + sd * u * mul;
    };
  };

  AC.percentile = function (sorted, p) {
    var i = (sorted.length - 1) * p;
    var loI = Math.floor(i), hiI = Math.ceil(i);
    return loI === hiI ? sorted[loI] : sorted[loI] + (sorted[hiI] - sorted[loI]) * (i - loI);
  };

}(window, document));

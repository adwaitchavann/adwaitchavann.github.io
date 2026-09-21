/* ==========================================================================
   Case study 01 — Meridian Health Partners valuation.

   Three linked models, all recomputed live in the browser:
     dcf()    unlevered DCF, 5-year explicit + Gordon terminal
     mc()     Monte Carlo over correlated operating drivers
     lbo()    sponsor returns and the price a 20% hurdle can support

   Figures are an illustrative composite, not a real company. The point of
   the piece is the method and the gap it exposes between what a strategic
   and a sponsor can pay for the same asset.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var AC = window.AC;
  if (!AC || !document.getElementById('dcfLab')) return;

  var $ = function (s) { return document.querySelector(s); };
  var fmt = AC.fmt;

  /* Everything in this model is already in $M; keep one unit across a bridge
     so a small line does not render as "$876K" beside "$217M". */
  function mm(v) {
    var a = Math.abs(v);
    if (a < 0.05) return '$0M';                     // axis zero, not "$0.0M"
    return (v < 0 ? '\u2212' : '') + '$' + (a < 10 ? a.toFixed(1) : a.toFixed(0)) + 'M';
  }

  /* $M throughout. */
  var BASE = {
    rev0:    1180,     // LTM revenue
    ebitda0: 159.3,    // LTM EBITDA (13.5% margin)
    g:       0.042,    // revenue CAGR, years 1–5
    mTerm:   0.150,    // EBITDA margin by year 5 (ramps from 13.5%)
    wacc:    0.085,
    tg:      0.025,    // terminal growth
    capex:   0.055,    // % of revenue
    da:      0.052,    // % of revenue
    nwc:     0.015,    // % of the *change* in revenue
    tax:     0.25,
    netDebt: 310,
    ask:     1450,     // enterprise value the seller is asking
    years:   5
  };
  var m0 = BASE.ebitda0 / BASE.rev0;   // 13.5% starting margin

  /* ------------------------------------------------------------------ DCF */
  function dcf(p) {
    var n = p.years, rows = [], pvSum = 0;
    for (var t = 1; t <= n; t++) {
      var rev  = p.rev0 * Math.pow(1 + p.g, t);
      var prev = p.rev0 * Math.pow(1 + p.g, t - 1);
      // margin walks linearly from today's 13.5% to the year-5 terminal margin
      var marg = m0 + (p.mTerm - m0) * (t / n);
      var ebitda = rev * marg;
      var da     = rev * p.da;
      var taxes  = Math.max(ebitda - da, 0) * p.tax;
      var capex  = rev * p.capex;
      var dNwc   = (rev - prev) * p.nwc;
      var fcf    = ebitda - taxes - capex - dNwc;
      var df     = Math.pow(1 + p.wacc, -t);
      pvSum += fcf * df;
      rows.push({ t: t, rev: rev, marg: marg, ebitda: ebitda, da: da, taxes: taxes,
                  capex: capex, dNwc: dNwc, fcf: fcf, df: df, pv: fcf * df });
    }
    var last = rows[n - 1];
    // keep the perpetuity finite even when a slider pushes g toward WACC
    var spread = Math.max(p.wacc - p.tg, 0.005);
    var tv   = last.fcf * (1 + p.tg) / spread;
    var pvTv = tv * Math.pow(1 + p.wacc, -n);
    var ev   = pvSum + pvTv;
    return {
      rows: rows, pvExplicit: pvSum, tv: tv, pvTv: pvTv, ev: ev,
      equity: ev - p.netDebt,
      tvShare: pvTv / ev,
      multEntry: ev / p.ebitda0,
      multExit: ev / last.ebitda
    };
  }

  /* ---------------------------------------------------------- Monte Carlo */
  /* Margin and growth share an "operating quality" factor: systems that grow
     volume also tend to lever fixed cost. Drawing them independently would
     understate the tails in both directions. */
  function mc(p, trials) {
    var rand = AC.rng(20260921);
    var norm = AC.normal(rand);
    var out = new Array(trials);
    for (var i = 0; i < trials; i++) {
      var z = norm(0, 1);                       // shared factor
      var q = { years: p.years, rev0: p.rev0, ebitda0: p.ebitda0, tax: p.tax,
                da: p.da, nwc: p.nwc, netDebt: p.netDebt };
      q.g     = p.g     + 0.013 * (0.6 * z + 0.8 * norm(0, 1));
      q.mTerm = p.mTerm + 0.014 * (0.6 * z + 0.8 * norm(0, 1));
      q.capex = Math.max(p.capex + 0.006 * norm(0, 1), 0.02);
      q.wacc  = Math.max(p.wacc + 0.007 * norm(0, 1), 0.045);
      q.tg    = Math.min(p.tg + 0.005 * norm(0, 1), q.wacc - 0.01);
      out[i] = dcf(q).ev;
    }
    out.sort(function (a, b) { return a - b; });
    var above = 0;
    for (i = 0; i < trials; i++) if (out[i] >= p.ask) above++;
    return {
      values: out,
      p10: AC.percentile(out, 0.10),
      p50: AC.percentile(out, 0.50),
      p90: AC.percentile(out, 0.90),
      pAboveAsk: above / trials
    };
  }

  /* ------------------------------------------------------------------ LBO */
  function lbo(p, o) {
    var d = dcf(p);
    var debt   = o.lev * p.ebitda0;
    var equity = o.price - debt;
    var bal = debt, path = [{ x: 0, y: debt }];
    for (var t = 0; t < o.hold; t++) {
      var r = d.rows[Math.min(t, d.rows.length - 1)];
      var interest = bal * o.rate;
      // sponsor case: unlevered FCF less after-tax interest, all swept to debt
      var sweep = Math.max(r.fcf - interest * (1 - p.tax), 0);
      bal = Math.max(bal - sweep, 0);
      path.push({ x: t + 1, y: bal });
    }
    var exitEbitda = d.rows[Math.min(o.hold, d.rows.length) - 1].ebitda;
    var exitEv     = o.exitMult * exitEbitda;
    var exitEquity = exitEv - bal;
    var mom = equity > 0 ? exitEquity / equity : 0;
    var irr = mom > 0 ? Math.pow(mom, 1 / o.hold) - 1 : -1;

    // Entry debt is set by the leverage multiple, so exit equity does not move
    // with the price paid — the affordable price solves in closed form.
    var maxEquity = exitEquity / Math.pow(1 + o.hurdle, o.hold);
    return {
      debt: debt, equity: equity, exitEbitda: exitEbitda, exitEv: exitEv,
      exitEquity: exitEquity, endDebt: bal, mom: mom, irr: irr,
      maxPrice: maxEquity + debt, path: path
    };
  }

  /* ==================================================================== */
  /* Lab 1 — the DCF                                                       */
  /* ==================================================================== */
  var fcfChart  = AC.waterfall('#fcfChart', null);
  var heatOut   = AC.heatTable('#heatOut', { rows: [], cols: [], values: [], rowLabel: '', colLabel: '' });
  var fieldOut  = AC.rangeBars('#fieldChart', null);

  var sliders = {
    g:     { el: $('#dcfG'), scale: 1000 },
    mTerm: { el: $('#dcfM'), scale: 1000 },
    wacc:  { el: $('#dcfW'), scale: 1000 },
    tg:    { el: $('#dcfT'), scale: 1000 },
    capex: { el: $('#dcfC'), scale: 1000 }
  };

  function readParams() {
    var p = {};
    for (var k in BASE) p[k] = BASE[k];
    for (var s in sliders) if (sliders[s].el) p[s] = +sliders[s].el.value / sliders[s].scale;
    if (p.tg > p.wacc - 0.01) p.tg = p.wacc - 0.01;   // keep the perpetuity sane
    return p;
  }

  function renderDcf() {
    var p = readParams();
    var d = dcf(p);
    var y5 = d.rows[d.rows.length - 1];

    $('#dcfGv').textContent = fmt.pct(p.g, 1);
    $('#dcfMv').textContent = fmt.pct(p.mTerm, 1);
    $('#dcfWv').textContent = fmt.pct(p.wacc, 2);
    $('#dcfTv').textContent = fmt.pct(p.tg, 2);
    $('#dcfCv').textContent = fmt.pct(p.capex, 1);

    $('#evOut').textContent   = '$' + (d.ev / 1000).toFixed(2) + 'B';
    $('#multOut').textContent = fmt.x(d.multEntry, 1);
    $('#tvShare').textContent = fmt.pct(d.tvShare, 0);

    var gap = d.ev - p.ask;
    var gapEl = $('#vsAsk');
    gapEl.textContent = (gap >= 0 ? '+' : '−') + '$' + Math.abs(gap).toFixed(0) + 'M';
    gapEl.className = gap >= 0 ? 'is-pos' : 'is-neg';

    fcfChart.update({
      title: 'Year-5 free cash flow bridge',
      format: mm,
      items: [
        { label: 'EBITDA',      value: y5.ebitda,  kind: 'base' },
        { label: 'Cash taxes',  value: -y5.taxes,  kind: 'delta' },
        { label: 'Capex',       value: -y5.capex,  kind: 'delta' },
        { label: 'Δ Working capital', value: -y5.dNwc, kind: 'delta' },
        { label: 'Unlevered FCF', value: y5.fcf,   kind: 'total' }
      ]
    });

    // WACC × terminal growth grid, centred on the live slider position
    var waccs = [-0.01, -0.005, 0, 0.005, 0.01].map(function (o) { return p.wacc + o; });
    var tgs   = [-0.01, -0.005, 0, 0.005, 0.01].map(function (o) { return p.tg + o; });
    var grid = waccs.map(function (w) {
      return tgs.map(function (t) {
        var q = {}; for (var k in p) q[k] = p[k];
        q.wacc = w; q.tg = Math.min(t, w - 0.01);
        return dcf(q).ev / 1000;
      });
    });
    heatOut.update({
      caption: 'Enterprise value ($B) — the terminal assumptions carry the answer.',
      rowLabel: 'WACC', colLabel: 'Terminal growth',
      rows: waccs.map(function (w) { return fmt.pct(w, 2); }),
      cols: tgs.map(function (t) { return fmt.pct(t, 2); }),
      values: grid, highlight: [2, 2],
      format: function (v) { return '$' + v.toFixed(2) + 'B'; }
    });

    var v = $('#dcfVerdict');
    if (d.ev >= p.ask * 1.05) {
      v.innerHTML = '<b>Comfortably above the ask.</b> At these assumptions the asset clears $' +
        (p.ask / 1000).toFixed(2) + 'B with ' + fmt.money((d.ev - p.ask) * 1e6, 0) +
        ' of cushion — but note that ' + fmt.pct(d.tvShare, 0) +
        ' of the value sits in the terminal period, beyond any forecast anyone can defend.';
    } else if (d.ev >= p.ask * 0.95) {
      v.innerHTML = '<b>Within noise of the ask.</b> A ' + fmt.money(Math.abs(d.ev - p.ask) * 1e6, 0) +
        ' gap on a $' + (p.ask / 1000).toFixed(2) + 'B deal is smaller than the error bars on any ' +
        'single assumption here. This is the zone where the decision stops being a valuation ' +
        'question and starts being a synergy question.';
    } else {
      v.innerHTML = '<b>Below the ask.</b> The model supports ' + fmt.money(d.ev * 1e6, 0) +
        ', which is ' + fmt.money((p.ask - d.ev) * 1e6, 0) + ' short. Paying the ask means ' +
        'underwriting synergies you have not yet put a number on.';
    }

    renderField(p, d);
    return { p: p, d: d };
  }

  /* ==================================================================== */
  /* Lab 2 — Monte Carlo                                                   */
  /* ==================================================================== */
  var mcChart = AC.histogram('#mcChart', null);

  function renderMc() {
    var p = readParams();
    var btn = $('#mcRun');
    btn.disabled = true;
    btn.textContent = 'Running 10,000 trials…';

    // yield a frame so the button state paints before the loop blocks
    window.requestAnimationFrame(function () {
      window.setTimeout(function () {
        var r = mc(p, 10000);
        $('#mcP10').textContent  = '$' + (r.p10 / 1000).toFixed(2) + 'B';
        $('#mcP50').textContent  = '$' + (r.p50 / 1000).toFixed(2) + 'B';
        $('#mcP90').textContent  = '$' + (r.p90 / 1000).toFixed(2) + 'B';
        $('#mcProb').textContent = fmt.pct(r.pAboveAsk, 0);
        $('#mcProb').className   = r.pAboveAsk >= 0.5 ? 'is-pos' : 'is-neg';

        mcChart.update({
          title: 'Distribution of enterprise value across 10,000 trials',
          values: r.values,
          axisLabel: 'Enterprise value',
          format: function (v) { return '$' + (v / 1000).toFixed(2) + 'B'; },
          markers: [
            { value: r.p10, label: 'P10' },
            { value: r.p50, label: 'P50' },
            { value: r.p90, label: 'P90' },
            { value: p.ask, label: 'Ask', strong: true }
          ]
        });

        $('#mcVerdict').innerHTML = '<b>' + fmt.pct(r.pAboveAsk, 0) +
          ' of trials clear the ask.</b> The spread from P10 to P90 is ' +
          fmt.money((r.p90 - r.p10) * 1e6, 0) + ' — roughly ' +
          Math.round((r.p90 - r.p10) / p.ask * 100) + '% of the purchase price. ' +
          'That width, not the midpoint, is the reason to negotiate structure rather than price.';

        btn.disabled = false;
        btn.textContent = 'Re-run simulation';
      }, 16);
    });
  }

  /* ==================================================================== */
  /* Lab 3 — LBO                                                           */
  /* ==================================================================== */
  var lboChart = AC.lines('#lboChart', null);

  function renderLbo() {
    var p = readParams();
    var o = {
      lev:      +$('#lboLev').value / 10,
      exitMult: +$('#lboExit').value / 10,
      hold:     +$('#lboHold').value,
      rate:     0.075,
      hurdle:   0.20,
      price:    p.ask
    };
    $('#lboLevv').textContent  = fmt.x(o.lev, 1) + ' EBITDA';
    $('#lboExitv').textContent = fmt.x(o.exitMult, 1) + ' EBITDA';
    $('#lboHoldv').textContent = o.hold + ' years';

    var r = lbo(p, o);
    $('#lboIrr').textContent = fmt.pct(r.irr, 1);
    $('#lboIrr').className   = r.irr >= o.hurdle ? 'is-pos' : 'is-neg';
    $('#lboMoM').textContent = fmt.x(r.mom, 2);
    $('#lboMax').textContent = '$' + (r.maxPrice / 1000).toFixed(2) + 'B';
    $('#lboGap').textContent = '$' + ((p.ask - r.maxPrice) / 1000).toFixed(2) + 'B';

    lboChart.update({
      title: 'Debt balance through the hold',
      format: mm,
      xFormat: function (v) { return v === 0 ? 'Close' : 'Y' + v; },
      series: [{ name: 'Net debt', points: r.path }]
    });

    $('#lboVerdict').innerHTML = r.irr >= o.hurdle
      ? '<b>Clears the hurdle.</b> At ' + fmt.x(o.lev, 1) + ' leverage and a ' +
        fmt.x(o.exitMult, 1) + ' exit, a sponsor earns ' + fmt.pct(r.irr, 1) +
        '. Note how much of that depends on the exit multiple holding — the one ' +
        'assumption the sponsor does not control.'
      : '<b>Short of the 20% hurdle.</b> A sponsor paying the ask earns ' + fmt.pct(r.irr, 1) +
        ' (' + fmt.x(r.mom, 2) + ' money-on-money). To hit 20% they can pay at most $' +
        (r.maxPrice / 1000).toFixed(2) + 'B — a $' +
        ((p.ask - r.maxPrice) / 1000).toFixed(2) + 'B gap to the ask. ' +
        'That gap is the synergy a strategic buyer has to believe in.';
    return r;
  }

  /* ==================================================================== */
  /* Football field                                                        */
  /* ==================================================================== */
  function renderField(p, d) {
    var lboLow  = lbo(p, { lev: 5.0, exitMult: 8.0, hold: 5, rate: 0.075, hurdle: 0.20, price: p.ask });
    var lboHigh = lbo(p, { lev: 6.0, exitMult: 9.0, hold: 5, rate: 0.075, hurdle: 0.20, price: p.ask });

    var qLow = {}, qHigh = {};
    for (var k in p) { qLow[k] = p[k]; qHigh[k] = p[k]; }
    qLow.wacc = p.wacc + 0.0075;  qLow.tg = p.tg - 0.005;
    qHigh.wacc = p.wacc - 0.0075; qHigh.tg = p.tg + 0.005;

    fieldOut.update({
      title: 'Valuation range by method',
      format: function (v) { return '$' + v.toFixed(2) + 'B'; },
      reference: p.ask / 1000,
      referenceLabel: 'Ask $1.45B',
      items: [
        { label: 'DCF (±75bps WACC)', lo: dcf(qLow).ev / 1000, hi: dcf(qHigh).ev / 1000,
          point: d.ev / 1000, emphasis: true },
        { label: 'Exit multiple 8.0–9.5×', lo: 8.0 * p.ebitda0 / 1000, hi: 9.5 * p.ebitda0 / 1000 },
        { label: 'Precedent deals 7.5–10.0×', lo: 7.5 * p.ebitda0 / 1000, hi: 10.0 * p.ebitda0 / 1000 },
        { label: 'LBO at 20% hurdle', lo: lboLow.maxPrice / 1000, hi: lboHigh.maxPrice / 1000 }
      ]
    });
  }

  /* ==================================================================== */
  /* Wiring                                                                */
  /* ==================================================================== */
  Object.keys(sliders).forEach(function (k) {
    if (sliders[k].el) sliders[k].el.addEventListener('input', function () { renderDcf(); renderLbo(); });
  });
  ['#lboLev', '#lboExit', '#lboHold'].forEach(function (s) {
    var el = $(s);
    if (el) el.addEventListener('input', renderLbo);
  });
  $('#mcRun').addEventListener('click', renderMc);
  $('#dcfReset').addEventListener('click', function () {
    for (var k in sliders) if (sliders[k].el) sliders[k].el.value = BASE[k] * sliders[k].scale;
    renderDcf(); renderLbo();
  });

  renderDcf();
  renderLbo();
  renderMc();

}(window, document));

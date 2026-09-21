/* ==========================================================================
   Case study 02 — NorthRoute Logistics margin diagnosis.

   Two models:
     bridge()   MECE decomposition of the 420bps margin decline
     segments() cost-to-serve by customer segment, with a re-pricing
                simulator that accounts for volume churn

   The two tie out: summing segment contribution reproduces the 19.9%
   margin the bridge lands on. A decomposition that does not reconcile to
   the P&L is a story, not an analysis.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var AC = window.AC;
  if (!AC || !document.getElementById('ctsLab')) return;

  var $ = function (s) { return document.querySelector(s); };
  var fmt = AC.fmt;

  /* Sign belongs outside the currency symbol: −$0.45, not $-0.45. */
  function usd(v, dp) {
    return (v < 0 ? '\u2212' : '') + '$' + Math.abs(v).toFixed(dp == null ? 2 : dp);
  }
  function bps(v) {
    return (v >= 0 ? '+' : '\u2212') + Math.abs(Math.round(v)) + ' bps';
  }

  /* ---------------------------------------------------- the margin bridge */
  /* bps of gross margin, Q1 → Q6. Signs are as they hit margin. */
  var BRIDGE = [
    { label: 'Q1 margin',        value: 24.1,  kind: 'base' },
    { label: 'Route density',    value:  1.25, kind: 'delta' },
    { label: 'Rate realisation', value: -0.85, kind: 'delta' },
    { label: 'Customer mix',     value: -2.40, kind: 'delta' },
    { label: 'Fuel & linehaul',  value: -0.95, kind: 'delta' },
    { label: 'Labour productivity', value: -0.70, kind: 'delta' },
    { label: 'Failed-delivery rework', value: -0.55, kind: 'delta' },
    { label: 'Q6 margin',        value: 19.9,  kind: 'total' }
  ];

  /* ------------------------------------------------------ segment P&L */
  /* drops in thousands per month; money per drop. Cost splits sum to cost. */
  var SEGMENTS = [
    { id: 'GRO', name: 'Grocery scheduled',  drops: 820,  rev: 7.40,  cost: 5.55,
      split: [1.40, 2.85, 0.35, 0.95] },
    { id: 'RET', name: 'Retail standard',    drops: 1450, rev: 6.10,  cost: 4.85,
      split: [1.25, 2.45, 0.30, 0.85] },
    { id: 'PHA', name: 'Pharma cold-chain',  drops: 190,  rev: 14.20, cost: 9.60,
      split: [2.60, 4.70, 0.55, 1.75] },
    { id: 'ECR', name: 'E-comm returns',     drops: 1180, rev: 4.25,  cost: 4.70,
      split: [1.10, 2.10, 1.05, 0.45] },
    { id: 'SME', name: 'SME parcel',         drops: 640,  rev: 8.80,  cost: 6.35,
      split: [1.65, 3.20, 0.40, 1.10] },
    { id: 'ENT', name: 'Enterprise contract', drops: 970, rev: 6.95,  cost: 5.20,
      split: [1.35, 2.60, 0.35, 0.90] }
  ];
  var COST_PARTS = ['Linehaul', 'Last-mile labour', 'Failed-delivery rework', 'Depot & overhead'];
  var TARGET = 'ECR';                    // the segment the diagnosis lands on

  /* Quarterly totals, $M. drops are monthly thousands → ×3 months ÷ 1000. */
  function roll(segs) {
    var rev = 0, cm = 0;
    segs.forEach(function (s) {
      var q = s.drops * 3 / 1000;        // millions of drops per quarter
      rev += q * s.rev;
      cm  += q * (s.rev - s.cost);
    });
    return { rev: rev, cm: cm, margin: cm / rev };
  }
  var BASE_ROLL = roll(SEGMENTS);

  /* Re-pricing with churn: a price rise sheds volume at the given elasticity. */
  function reprice(pctChange, elasticity) {
    return SEGMENTS.map(function (s) {
      if (s.id !== TARGET) return s;
      var newRev   = s.rev * (1 + pctChange);
      var newDrops = s.drops * Math.max(1 - elasticity * pctChange, 0);
      var c = {};
      for (var k in s) c[k] = s[k];
      c.rev = newRev; c.drops = newDrops;
      return c;
    });
  }

  /* ==================================================================== */
  /* Lab A — the bridge                                                    */
  /* ==================================================================== */
  AC.waterfall('#bridgeChart', {
    title: 'Gross margin bridge, Q1 to Q6',
    format: function (v) {
      return (v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(1) + '%';
    },
    items: BRIDGE
  });

  /* ==================================================================== */
  /* Lab B — cost to serve                                                 */
  /* ==================================================================== */
  var ctsChart   = AC.scatter('#ctsChart', null);
  var buildChart = AC.stackedColumns('#buildChart', null);

  function renderCts() {
    var pct   = +$('#rePrice').value / 100;
    var elast = +$('#elast').value / 100;
    $('#rePricev').textContent = (pct >= 0 ? '+' : '−') + fmt.pct(Math.abs(pct), 0);
    $('#elastv').textContent   = '−' + elast.toFixed(2);

    var segs = reprice(pct, elast);
    var r = roll(segs);
    var tgtNew = segs.filter(function (s) { return s.id === TARGET; })[0];
    var tgtOld = SEGMENTS.filter(function (s) { return s.id === TARGET; })[0];
    var volLost = 1 - tgtNew.drops / tgtOld.drops;
    var deltaBps = (r.margin - BASE_ROLL.margin) * 10000;

    $('#segCm').textContent    = usd(tgtNew.rev - tgtNew.cost);
    $('#segCm').className      = (tgtNew.rev - tgtNew.cost) >= 0 ? 'is-pos' : 'is-neg';
    $('#newMargin').textContent = fmt.pct(r.margin, 1);
    $('#marginDelta').textContent = bps(deltaBps);
    $('#marginDelta').className = deltaBps >= 0 ? 'is-pos' : 'is-neg';
    $('#volLost').textContent  = fmt.pct(volLost, 0);

    ctsChart.update({
      title: 'Contribution margin per drop against monthly volume',
      points: segs.map(function (s) {
        var cm = s.rev - s.cost;
        var q  = s.drops * 3 / 1000;
        return {
          x: s.drops / 1000, y: cm,
          r: Math.max(7, Math.sqrt(q * s.rev) * 3.4),
          tag: s.id,
          state: s.id === TARGET ? 'watch' : (cm >= 0 ? 'on' : 'off'),
          title: s.name + ' — ' + fmt.num(s.drops, 0) + 'k drops/mo, ' +
                 usd(cm) + ' contribution per drop'
        };
      }),
      xDomain: [0, 1.7], yDomain: [-1, 5],
      quadrant: [0, 0],
      xLabel: 'Monthly drops (millions)',
      yLabel: 'Contribution per drop',
      xFormat: function (v) { return v.toFixed(1) + 'M'; },
      yFormat: function (v) { return '$' + v.toFixed(0); },
      zones: [{ x: 1.35, y: -0.55, label: 'Below breakeven' }]
    });

    buildChart.update({
      title: 'Cost to serve per drop by segment',
      format: function (v) { return '$' + v.toFixed(2); },
      categories: SEGMENTS.map(function (s) { return s.id; }),
      series: COST_PARTS.map(function (name, i) {
        return { name: name, values: SEGMENTS.map(function (s) { return s.split[i]; }) };
      })
    });

    var v = $('#ctsVerdict');
    if (pct === 0) {
      v.innerHTML = '<b>As it stands, E-comm returns loses 45&cent; on every drop.</b> ' +
        'It is 14% of revenue and −$1.6M of quarterly contribution. On paper, dropping it ' +
        'lifts margin by 509 basis points — more than the entire decline. That number is a ' +
        'trap: those same drops are paying for the route density every other segment rides on.';
    } else if (deltaBps > 0) {
      v.innerHTML = '<b>+' + Math.round(deltaBps) + ' bps.</b> Re-pricing by ' +
        fmt.pct(pct, 0) + ' sheds ' + fmt.pct(volLost, 0) + ' of the volume but turns the ' +
        'segment contribution positive at ' + usd(tgtNew.rev - tgtNew.cost) +
        ' per drop. Fewer, better drops beat more, worse ones.';
    } else {
      v.innerHTML = '<b>' + Math.round(deltaBps) + ' bps.</b> At this elasticity the volume ' +
        'you lose outruns the price you gain. Past a point, re-pricing stops being a fix and ' +
        'becomes a disguised exit — which may still be the right call, but should be decided ' +
        'deliberately rather than by accident.';
    }
  }

  ['#rePrice', '#elast'].forEach(function (s) {
    var el = $(s);
    if (el) el.addEventListener('input', renderCts);
  });
  $('#ctsReset').addEventListener('click', function () {
    $('#rePrice').value = 0; $('#elast').value = 120; renderCts();
  });

  /* ==================================================================== */
  /* Static figures quoted in the prose, computed rather than typed        */
  /* ==================================================================== */
  (function fillProse() {
    var ecr = SEGMENTS.filter(function (s) { return s.id === TARGET; })[0];
    var without = roll(SEGMENTS.filter(function (s) { return s.id !== TARGET; }));
    var el = $('#exMargin');
    if (el) el.textContent = fmt.pct(without.margin, 1);
    var el2 = $('#exBps');
    if (el2) el2.textContent = bps((without.margin - BASE_ROLL.margin) * 10000);
    var el3 = $('#ecrShare');
    if (el3) el3.textContent = fmt.pct(ecr.drops * 3 / 1000 * ecr.rev / BASE_ROLL.rev, 0);
  }());

  renderCts();

}(window, document));

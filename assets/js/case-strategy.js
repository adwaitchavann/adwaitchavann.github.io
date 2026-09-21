/* ==========================================================================
   Case study 03 — allocating an AI budget across twelve candidate bets.

     enpv()     risk-adjusted NPV, with the payoff discounted for time-to-value
     knapsack() exact 0/1 optimisation under the budget constraint
     naive()    the common alternative: rank by headline annual value

   Costs land on $0.1M boundaries, so the knapsack is solved exactly by
   dynamic programming rather than approximated by a greedy ratio sort.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var AC = window.AC;
  if (!AC || !document.getElementById('stratLab')) return;

  var $ = function (s) { return document.querySelector(s); };
  var fmt = AC.fmt;

  var RATE  = 0.12;
  var YEARS = 5;
  var AF = (function () {                    // 5-year annuity factor at 12%
    var a = 0;
    for (var t = 1; t <= YEARS; t++) a += Math.pow(1 + RATE, -t);
    return a;
  }());
  var PILOT = 0.20;                          // stage-gate spends 20% before committing

  /* cost and value in $M; p = probability the initiative delivers; ttv in months */
  var INIT = [
    { id: 'A', name: 'Shop-floor defect vision',  cost: 2.4, val: 4.8,  p: 0.72, ttv: 9 },
    { id: 'B', name: 'Predictive maintenance',    cost: 3.1, val: 7.2,  p: 0.64, ttv: 12 },
    { id: 'C', name: 'Quote-to-cash automation',  cost: 1.8, val: 3.6,  p: 0.81, ttv: 6 },
    { id: 'D', name: 'Supplier risk monitoring',  cost: 1.2, val: 2.1,  p: 0.76, ttv: 5 },
    { id: 'E', name: 'Field-service copilot',     cost: 2.7, val: 5.4,  p: 0.58, ttv: 11 },
    { id: 'F', name: 'Engineering doc retrieval', cost: 0.9, val: 1.9,  p: 0.88, ttv: 4 },
    { id: 'G', name: 'Demand forecasting',        cost: 2.2, val: 4.1,  p: 0.69, ttv: 8 },
    { id: 'H', name: 'Warranty claims triage',    cost: 1.5, val: 2.9,  p: 0.79, ttv: 6 },
    { id: 'I', name: 'Autonomous procurement',    cost: 4.3, val: 9.1,  p: 0.47, ttv: 18 },
    { id: 'J', name: 'Energy optimisation',       cost: 2.0, val: 3.4,  p: 0.71, ttv: 7 },
    { id: 'K', name: 'Sales proposal generation', cost: 1.1, val: 1.7,  p: 0.84, ttv: 4 },
    { id: 'L', name: 'Digital twin simulation',   cost: 5.2, val: 11.5, p: 0.39, ttv: 24 }
  ];

  /* Present value of the payoff, pushed out by however long it takes to land. */
  function payoff(it) { return it.val * AF * Math.pow(1 + RATE, -it.ttv / 12); }

  function enpv(it, staged) {
    if (!staged) return it.p * payoff(it) - it.cost;
    // pilot money is spent either way; the rest is only committed if the pilot passes
    return it.p * (payoff(it) - (1 - PILOT) * it.cost) - PILOT * it.cost;
  }

  /* Exact 0/1 knapsack on a $0.1M grid. */
  function knapsack(items, budget) {
    var STEP = 0.1;
    var B = Math.round(budget / STEP), n = items.length;
    var dp = [], i, b;
    for (i = 0; i <= n; i++) dp.push(new Float64Array(B + 1));
    for (i = 1; i <= n; i++) {
      var c = Math.round(items[i - 1].cost / STEP), v = items[i - 1].e;
      for (b = 0; b <= B; b++) {
        dp[i][b] = dp[i - 1][b];
        if (c <= b && dp[i - 1][b - c] + v > dp[i][b]) dp[i][b] = dp[i - 1][b - c] + v;
      }
    }
    var picked = {}, rem = B;
    for (i = n; i > 0; i--) {
      if (dp[i][rem] !== dp[i - 1][rem]) {
        picked[items[i - 1].id] = true;
        rem -= Math.round(items[i - 1].cost / STEP);
      }
    }
    return { total: dp[n][B], picked: picked };
  }

  /* The usual alternative: sort by the biggest headline number and fill. */
  function naive(items, budget) {
    var spend = 0, total = 0, picked = {};
    items.slice().sort(function (a, b) { return b.val - a.val; }).forEach(function (it) {
      if (spend + it.cost <= budget + 1e-9) { spend += it.cost; total += it.e; picked[it.id] = true; }
    });
    return { total: total, picked: picked };
  }

  function scored(staged) {
    return INIT.map(function (it) {
      var c = {}; for (var k in it) c[k] = it[k];
      c.e = enpv(it, staged);
      return c;
    });
  }

  /* ==================================================================== */
  var matrix  = AC.scatter('#matrixChart', null);
  var sweep   = AC.lines('#sweepChart', null);
  var listEl  = $('#pickerList');

  function render() {
    var budget = +$('#budget').value / 10;
    var staged = $('#modeStage').getAttribute('aria-pressed') === 'true';
    $('#budgetv').textContent = '$' + budget.toFixed(1) + 'M';

    var items = scored(staged);
    var opt = knapsack(items, budget);
    var nai = naive(items, budget);

    var spend = 0, count = 0;
    items.forEach(function (it) {
      if (opt.picked[it.id]) { spend += it.cost; count++; }
    });
    var gap = nai.total > 0 ? (opt.total - nai.total) / nai.total : 0;

    $('#portNpv').textContent   = '$' + opt.total.toFixed(1) + 'M';
    $('#portCount').textContent = count + ' of 12';
    $('#portSpend').textContent = '$' + spend.toFixed(1) + 'M';
    $('#naiveGap').textContent  = '+' + fmt.pct(gap, 0);
    $('#naiveGap').className    = gap > 0.02 ? 'is-pos' : '';

    /* -------- the picker list -------- */
    listEl.textContent = '';
    items.slice().sort(function (a, b) { return b.e / b.cost - a.e / a.cost; })
      .forEach(function (it) {
        var on = !!opt.picked[it.id];
        var row = document.createElement('div');
        row.className = 'picker__row';
        row.setAttribute('data-on', on ? '1' : '0');
        row.innerHTML =
          '<span class="picker__tag">' + it.id + '</span>' +
          '<span class="picker__name"><b>' + it.name + '</b>' +
          '<small>' + fmt.pct(it.p, 0) + ' success · ' + it.ttv + ' mo to value · ' +
          'eNPV $' + it.e.toFixed(1) + 'M</small></span>' +
          '<span class="picker__cost">$' + it.cost.toFixed(1) + 'M</span>';
        listEl.appendChild(row);
      });

    /* -------- value vs feasibility matrix -------- */
    matrix.update({
      title: 'Expected value against probability of success',
      points: items.map(function (it) {
        return {
          x: it.p, y: it.val,
          r: Math.max(8, it.cost * 3.6),
          tag: it.id,
          state: opt.picked[it.id] ? 'on' : 'off',
          title: it.name + ' — $' + it.cost.toFixed(1) + 'M cost, ' +
                 fmt.pct(it.p, 0) + ' success, eNPV $' + it.e.toFixed(1) + 'M'
        };
      }),
      xDomain: [0.3, 0.95], yDomain: [0, 13],
      xLabel: 'Probability of success',
      yLabel: 'Annual value if it works ($M)',
      xFormat: function (v) { return Math.round(v * 100) + '%'; },
      yFormat: function (v) { return '$' + v + 'M'; },
      zones: [
        { x: 0.44, y: 12.2, label: 'Moonshots' },
        { x: 0.86, y: 12.2, label: 'Sure things' }
      ]
    });

    /* -------- how the two strategies diverge across budgets -------- */
    var optPts = [], naiPts = [];
    for (var b = 6; b <= 30; b += 2) {
      optPts.push({ x: b, y: knapsack(items, b).total });
      naiPts.push({ x: b, y: naive(items, b).total });
    }
    sweep.update({
      title: 'Expected NPV by budget: optimiser against headline-value ranking',
      format: function (v) { return '$' + v.toFixed(0) + 'M'; },
      xFormat: function (v) { return '$' + v + 'M'; },
      series: [
        { name: 'Optimised', points: optPts },
        { name: 'By value',  points: naiPts, dashed: true }
      ]
    });

    /* -------- verdict -------- */
    var v = $('#stratVerdict');
    if (gap < 0.02) {
      v.innerHTML = '<b>At $' + budget.toFixed(1) + 'M the constraint has stopped binding.</b> ' +
        'There is enough money to fund almost everything, so the ordering barely matters. ' +
        'Prioritisation frameworks are worth exactly nothing in a world without budgets — ' +
        'which is why arguing about the 2×2 is usually a sign the real constraint is elsewhere.';
    } else {
      v.innerHTML = '<b>The same $' + budget.toFixed(1) + 'M buys ' + fmt.pct(gap, 0) +
        ' more expected value.</b> Ranking by headline annual value funds ' +
        Object.keys(nai.picked).length + ' initiatives; optimising funds ' + count +
        '. The difference is not effort or talent — it is that the biggest number on the ' +
        'slide is rarely the best use of the next dollar.';
    }
  }

  /* ---------------------------------------------------------- wiring */
  $('#budget').addEventListener('input', render);
  ['#modeFull', '#modeStage'].forEach(function (sel) {
    $(sel).addEventListener('click', function () {
      $('#modeFull').setAttribute('aria-pressed', String(sel === '#modeFull'));
      $('#modeStage').setAttribute('aria-pressed', String(sel === '#modeStage'));
      render();
    });
  });

  /* Figures quoted in the prose, computed rather than typed. */
  (function fillProse() {
    var full = knapsack(scored(false), 18).total;
    var stg  = knapsack(scored(true), 18).total;
    var nai18 = naive(scored(false), 18).total;
    var set = function (id, txt) { var e = $(id); if (e) e.textContent = txt; };
    set('#pFull', '$' + full.toFixed(1) + 'M');
    set('#pFull2', '$' + full.toFixed(1) + 'M');
    set('#pNaive', '$' + nai18.toFixed(1) + 'M');
    set('#pGap', fmt.pct((full - nai18) / nai18, 0));
    set('#pStaged', '$' + stg.toFixed(1) + 'M');
    set('#pStagedGain', fmt.pct((stg - full) / full, 0));
  }());

  render();

}(window, document));

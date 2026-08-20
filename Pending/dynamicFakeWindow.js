javascript:
/* 
 * dynamicFakeWindow v1.0 — GUI fake planner for the Rally Point
 *
 *             Script: dynamicFakeWindow
 *             Created by: Vanquished
 *             Version: 1.0 (dd82d790d04e2e181b6f4907119ae2b3ed498083)
 *             License: GNU GENERAL PUBLIC LICENSE VERSION 3 https://www.gnu.org/licenses/gpl-3.0.en.html
 * 
 * Run on the Rally Point (screen=place). A ⚙ panel lets you paste the
 * target coordinates (any separator), set the arrival window (date + time
 * with seconds), and units. Settings persist per-world in localStorage. Each
 * run picks a RANDOM target whose arrival — sent NOW, at the speed of the slowest
 * unit in the fake template — lands inside the window, then fills coords + units.
 *
 * Times are SERVER time when the game exposes Timing.getCurrentServerTime()
 *
 */
(function () {
  'use strict';

  /* Default fake template: units inserted per attack (configurable in the panel). */
  var UNITS = { spy: 1, ram: 1 };

  /* Base minutes per field at world speed 1 / unit speed 1. */
  var BASE_SPEED = { spear: 18, sword: 22, axe: 18, archer: 18, spy: 9, light: 10, heavy: 11, ram: 30, catapult: 30, knight: 10, snob: 35 };

  /* ---------------- pure logic (exposed for tests) ---------------- */
  var core = {
    /* Extract unique xxx|yyy coords from free text, any separator. */
    parseCoords: function (text) {
      var m = String(text || '').match(/\d{1,3}\|\d{1,3}/g) || [];
      var seen = {}, out = [];
      m.forEach(function (c) { if (!seen[c]) { seen[c] = 1; out.push(c); } });
      return out;
    },

    /* Effective minutes per field of the slowest unit with a count > 0.
     * effSpeeds (per-world effective speeds from get_unit_info) wins when known;
     * otherwise BASE_SPEED scaled by the world multipliers. */
    slowestMinPerField: function (units, worldSpeed, unitSpeed, effSpeeds) {
      var mult = (Number(worldSpeed) || 1) * (Number(unitSpeed) || 1);
      var slow = 0;
      for (var u in units) {
        if (!(units[u] > 0)) continue;
        var m = (effSpeeds && effSpeeds[u] > 0) ? effSpeeds[u] : BASE_SPEED[u] / mult;
        if (m > slow) slow = m;
      }
      return slow;
    },

    /* Parse /interface.php?func=get_unit_info XML. The <speed> values are
     * EFFECTIVE minutes per field (already divided by world speed x unit
     * modifier — verified on worlds where the net multiplier is not 1).
     * Returns {unit: minPerField} or null if the text is not that XML. */
    parseUnitInfoXml: function (text) {
      var out = {}, found = 0;
      for (var u in BASE_SPEED) {
        var m = String(text || '').match(new RegExp('<' + u + '>[\\s\\S]*?<speed>([\\d.]+)'));
        if (m && Number(m[1]) > 0) { out[u] = Number(m[1]); found++; }
      }
      return (out.spy && out.ram) ? out : null;
    },

    /* Keep only known units with a positive whole count. */
    normalizeUnits: function (obj) {
      var out = {};
      for (var u in (obj || {})) {
        if (!(u in BASE_SPEED)) continue;
        var n = Math.floor(Number(obj[u]));
        if (n > 0) out[u] = n;
      }
      return out;
    },

    /* Name of the slowest unit with a count > 0, or null. */
    slowestUnit: function (units, effSpeeds) {
      function mins(u) { return (effSpeeds && effSpeeds[u] > 0) ? effSpeeds[u] : BASE_SPEED[u]; }
      var slow = null;
      for (var u in units) if (units[u] > 0 && (slow === null || mins(u) > mins(slow))) slow = u;
      return slow;
    },

    dist: function (a, b) {
      var p = a.split('|'), q = b.split('|');
      var dx = q[0] - p[0], dy = q[1] - p[1];
      return Math.sqrt(dx * dx + dy * dy);
    },

    /* 'YYYY-MM-DD' + 'HH:MM[:SS]' -> ms timestamp (local-frame Date), NaN if invalid. */
    partsToTime: function (dateStr, timeStr) {
      var d = String(dateStr || '').split('-').map(Number);
      var t = String(timeStr || '').split(':').map(Number);
      if (d.length !== 3 || !d[0] || isNaN(d[1]) || isNaN(d[2])) return NaN;
      return new Date(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, t[2] || 0).getTime();
    },

    /* Classify every target by arrival time (sent at nowMs from origin). */
    plan: function (cfg, origin, nowMs, worldSpeed, unitSpeed, effSpeeds) {
      var units = core.normalizeUnits(cfg.units);
      if (!Object.keys(units).length) units = UNITS;
      var mpf = core.slowestMinPerField(units, worldSpeed, unitSpeed, effSpeeds);
      var start = core.partsToTime(cfg.startDate, cfg.startTime);
      var end = core.partsToTime(cfg.endDate, cfg.endTime);
      var all = core.parseCoords(cfg.coords);
      var eligible = [], early = [], late = [];
      var badWindow = isNaN(start) || isNaN(end);
      all.forEach(function (c) {
        var t = nowMs + core.dist(origin, c) * mpf * 60000;
        if (badWindow) late.push({ c: c, t: t });
        else if (t < start) early.push({ c: c, t: t });
        else if (t > end) late.push({ c: c, t: t });
        else eligible.push({ c: c, t: t });
      });
      return { all: all, eligible: eligible, early: early, late: late, start: start, end: end, units: units };
    },

    pick: function (eligible, rnd) {
      if (!eligible.length) return null;
      return eligible[Math.floor((rnd === undefined ? Math.random() : rnd) * eligible.length)];
    },

    /* Language by market domain: .es TLD -> Spanish, anything else -> English. */
    langFor: function (hostname) {
      return /\.es$/i.test(String(hostname || '')) ? 'es' : 'en';
    },

    STRINGS: {
      es: {
        wrongScreen: 'Ejecuta el script en la Plaza de reuniones (enviar tropas).',
        panelTitle: 'Fake Planner — configuración',
        targetsLabel: 'Objetivos (coordenadas, cualquier separador):',
        coordCount: function (n) { return n + ' coordenadas válidas'; },
        unitsLabel: 'Unidades del fake:',
        errNoUnits: 'Selecciona al menos una unidad.',
        slowestInfo: function (u, mpf) { return 'Unidad más lenta: ' + u + ' (' + Math.round(mpf * 10) / 10 + ' min/campo)'; },
        arrivalFrom: 'Llegada desde:',
        arrivalUntil: 'Llegada hasta:',
        serverClock: 'Horas en hora del SERVIDOR.',
        localClock: 'Aviso: sin reloj del servidor — se usa la hora LOCAL de tu PC.',
        saveBtn: 'Guardar y rellenar',
        closeBtn: 'Cerrar',
        errNoCoords: 'No hay coordenadas válidas.',
        errNoWindow: 'Completa fecha y hora de la ventana.',
        errOrder: 'El inicio de la ventana debe ser anterior al final.',
        noneInWindow: function (all, early, late) { return 'Ningún pueblo en ventana (' + all + ' objetivos: ' + early + ' demasiado pronto, ' + late + ' se pasan).'; },
        canAttackIn: function (d) { return ' Podrás atacar dentro de ' + d + '.'; },
        durHM: function (h, m) { return h + ' h ' + m + ' min'; },
        notEnough: function (u, have, need) { return 'Tropas insuficientes: ' + u + ' (' + have + '/' + need + ').'; },
        noTargetField: 'No encuentro el campo de coordenadas del objetivo.',
        filled: function (c, when, elig, all) { return 'Objetivo ' + c + ' — llegada ' + when + ' · ' + elig + '/' + all + ' pueblos en ventana.'; }
      },
      en: {
        wrongScreen: 'Run the script on the Rally Point (send troops screen).',
        panelTitle: 'Fake Planner — settings',
        targetsLabel: 'Targets (coordinates, any separator):',
        coordCount: function (n) { return n + ' valid coordinates'; },
        unitsLabel: 'Fake units:',
        errNoUnits: 'Select at least one unit.',
        slowestInfo: function (u, mpf) { return 'Slowest unit: ' + u + ' (' + Math.round(mpf * 10) / 10 + ' min/field)'; },
        arrivalFrom: 'Arrival from:',
        arrivalUntil: 'Arrival until:',
        serverClock: 'Times are SERVER time.',
        localClock: 'Warning: no server clock — using your PC\'s LOCAL time.',
        saveBtn: 'Save & fill',
        closeBtn: 'Close',
        errNoCoords: 'No valid coordinates.',
        errNoWindow: 'Fill in the window date and time.',
        errOrder: 'Window start must be before its end.',
        noneInWindow: function (all, early, late) { return 'No village lands in the window (' + all + ' targets: ' + early + ' too early, ' + late + ' overshoot).'; },
        canAttackIn: function (d) { return ' You can attack in ' + d + '.'; },
        durHM: function (h, m) { return h + ' h ' + m + ' min'; },
        notEnough: function (u, have, need) { return 'Not enough troops: ' + u + ' (' + have + '/' + need + ').'; },
        noTargetField: 'Cannot find the target coordinate field.',
        filled: function (c, when, elig, all) { return 'Target ' + c + ' — arrival ' + when + ' · ' + elig + '/' + all + ' villages in window.'; }
      }
    }
  };

  (typeof window !== 'undefined' ? window : globalThis).FakePlannerCore = core;
  if (typeof document === 'undefined' || typeof game_data === 'undefined') return;

  /* ---------------- browser part ---------------- */
  var T = core.STRINGS[core.langFor(location.hostname)];

  if (game_data.screen !== 'place') {
    alert(T.wrongScreen);
    return;
  }

  var LS_KEY = 'fakePlanner:' + game_data.world;

  /* Effective unit speeds (min/field) from get_unit_info, cached per world.
   * game_data does NOT expose speed/unit_speed, so this XML is the only
   * reliable source — and its values need no further scaling. */
  var SPEEDS_KEY = 'fakePlanner:speeds:' + game_data.world;
  function loadSpeeds() {
    try { var s = JSON.parse(localStorage.getItem(SPEEDS_KEY)); return (s && s.speeds) || null; } catch (e) { return null; }
  }
  var effSpeeds = loadSpeeds();
  function fetchSpeeds(done) {
    var x = new XMLHttpRequest();
    x.open('GET', '/interface.php?func=get_unit_info');
    x.onload = function () {
      var sp = core.parseUnitInfoXml(x.responseText);
      if (sp) {
        effSpeeds = sp;
        try { localStorage.setItem(SPEEDS_KEY, JSON.stringify({ fetchedAt: Date.now(), speeds: sp })); } catch (e) { }
        if (done) done();
      }
    };
    x.send();
  }

  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch (e) { return null; }
  }
  function saveCfg(c) { localStorage.setItem(LS_KEY, JSON.stringify(c)); }
  function cfgValid(c) {
    return !!c && core.parseCoords(c.coords).length > 0 &&
      !isNaN(core.partsToTime(c.startDate, c.startTime)) &&
      !isNaN(core.partsToTime(c.endDate, c.endTime)) &&
      core.partsToTime(c.startDate, c.startTime) < core.partsToTime(c.endDate, c.endTime) &&
      /* legacy configs without units fall back to the default template */
      (c.units == null || Object.keys(core.normalizeUnits(c.units)).length > 0);
  }

  /* Units that exist on this world (game_data.units minus militia etc.). */
  function worldUnits() {
    var list = (game_data.units || Object.keys(BASE_SPEED)).filter(function (u) { return u in BASE_SPEED; });
    return list.length ? list : Object.keys(BASE_SPEED);
  }

  /* Server "now": Timing gives ms whose LOCAL getters render the server wall clock,
   * the same frame partsToTime() parses into. Fallback: plain local time. */
  function serverNow() {
    try {
      if (typeof Timing !== 'undefined' && Timing.getCurrentServerTime) return Timing.getCurrentServerTime();
    } catch (e) { /* fall through */ }
    return Date.now();
  }
  function usingServerTime() {
    return typeof Timing !== 'undefined' && !!(Timing && Timing.getCurrentServerTime);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(ms) {
    var d = new Date(ms);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function fmtDur(ms) {
    var m = Math.ceil(ms / 60000), h = Math.floor(m / 60);
    return T.durHM(h, m - 60 * h);
  }

  function availCount(unit) {
    var a = document.getElementById('units_entry_all_' + unit);
    if (!a) return 0;
    var n = a.getAttribute('data-all-count');
    if (n === null) { var m = (a.textContent || '').match(/\d+/); n = m ? m[0] : 0; }
    return Number(n) || 0;
  }

  /* ---------------- status bar ---------------- */
  function statusBar() {
    var bar = document.getElementById('fp_status');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'fp_status';
    bar.style.cssText = 'margin:4px 0;padding:5px 8px;border:1px solid #7d510f;background:#f4e4bc;font-size:12px;display:flex;align-items:center;gap:8px;';
    var gear = document.createElement('button');
    gear.type = 'button';
    gear.textContent = '⚙ Config';
    gear.style.cssText = 'cursor:pointer;flex:none;';
    gear.addEventListener('click', function () { openPanel(loadCfg() || {}); });
    var txt = document.createElement('span');
    txt.id = 'fp_status_text';
    bar.appendChild(gear);
    bar.appendChild(txt);
    var anchor = document.getElementById('command-data-form') || document.getElementById('content_value') || document.body;
    if (anchor.parentNode && anchor !== document.body) anchor.parentNode.insertBefore(bar, anchor);
    else anchor.insertBefore(bar, anchor.firstChild);
    return bar;
  }
  function setStatus(msg, color) {
    statusBar();
    var t = document.getElementById('fp_status_text');
    t.textContent = msg;
    t.style.color = color || '#000';
  }

  /* ---------------- config panel ---------------- */
  function field(labelText, input) {
    var row = document.createElement('div');
    row.style.cssText = 'margin:4px 0;';
    var lab = document.createElement('label');
    lab.textContent = labelText + ' ';
    lab.style.cssText = 'display:inline-block;width:110px;';
    row.appendChild(lab);
    row.appendChild(input);
    return row;
  }

  function openPanel(cfg) {
    var old = document.getElementById('fp_panel');
    if (old) old.parentNode.removeChild(old);

    var p = document.createElement('div');
    p.id = 'fp_panel';
    p.style.cssText = 'position:fixed;top:70px;right:10px;z-index:99999;width:320px;padding:10px;border:2px solid #7d510f;background:#f4e4bc;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.4);';

    var h = document.createElement('div');
    h.textContent = T.panelTitle;
    h.style.cssText = 'font-weight:bold;margin-bottom:6px;';
    p.appendChild(h);

    var lab = document.createElement('div');
    lab.textContent = T.targetsLabel;
    p.appendChild(lab);
    var ta = document.createElement('textarea');
    ta.rows = 7;
    ta.style.cssText = 'width:100%;box-sizing:border-box;margin:3px 0;';
    ta.value = cfg.coords || '';
    p.appendChild(ta);
    var count = document.createElement('div');
    count.style.cssText = 'font-size:11px;color:#555;margin-bottom:4px;';
    function refreshCount() { count.textContent = T.coordCount(core.parseCoords(ta.value).length); }
    ta.addEventListener('input', refreshCount);
    refreshCount();
    p.appendChild(count);

    var unitsLab = document.createElement('div');
    unitsLab.textContent = T.unitsLabel;
    p.appendChild(unitsLab);
    var ugrid = document.createElement('div');
    ugrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 8px;margin:3px 0;';
    var unitInputs = {};
    var cfgUnits = core.normalizeUnits(cfg.units);
    if (!Object.keys(cfgUnits).length) cfgUnits = { spy: 1, ram: 1 };
    var speedInfo = document.createElement('div');
    speedInfo.style.cssText = 'font-size:11px;color:#555;margin-bottom:4px;';
    function readUnits() {
      var o = {};
      for (var u in unitInputs) o[u] = unitInputs[u].value;
      return core.normalizeUnits(o);
    }
    function refreshSpeed() {
      var us = readUnits(), s = core.slowestUnit(us, effSpeeds);
      speedInfo.textContent = s ? T.slowestInfo(s, core.slowestMinPerField(us, game_data.speed, game_data.unit_speed, effSpeeds)) : T.errNoUnits;
    }
    worldUnits().forEach(function (u) {
      var cell = document.createElement('label');
      cell.style.cssText = 'display:flex;align-items:center;gap:2px;';
      cell.title = u;
      var img = document.createElement('img');
      img.src = '/graphic/unit/unit_' + u + '.png';
      img.alt = u;
      img.style.cssText = 'width:18px;height:18px;';
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.min = 0;
      inp.value = cfgUnits[u] || 0;
      inp.style.cssText = 'width:48px;';
      inp.addEventListener('input', refreshSpeed);
      cell.appendChild(img);
      cell.appendChild(inp);
      ugrid.appendChild(cell);
      unitInputs[u] = inp;
    });
    refreshSpeed();
    p.appendChild(ugrid);
    p.appendChild(speedInfo);

    function dateInput(v) { var i = document.createElement('input'); i.type = 'date'; i.value = v || ''; return i; }
    function timeInput(v) { var i = document.createElement('input'); i.type = 'time'; i.step = 1; i.value = v || ''; i.style.marginLeft = '4px'; return i; }
    var sd = dateInput(cfg.startDate), st = timeInput(cfg.startTime);
    var ed = dateInput(cfg.endDate), et = timeInput(cfg.endTime);
    var startRow = field(T.arrivalFrom, sd); startRow.appendChild(st);
    var endRow = field(T.arrivalUntil, ed); endRow.appendChild(et);
    p.appendChild(startRow);
    p.appendChild(endRow);

    var tz = document.createElement('div');
    tz.style.cssText = 'font-size:11px;color:#555;margin:4px 0;';
    tz.textContent = usingServerTime() ? T.serverClock : T.localClock;
    p.appendChild(tz);

    var err = document.createElement('div');
    err.style.cssText = 'color:red;margin:4px 0;';
    p.appendChild(err);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'text-align:right;margin-top:6px;';
    var save = document.createElement('button');
    save.type = 'button';
    save.textContent = T.saveBtn;
    save.style.cssText = 'cursor:pointer;font-weight:bold;';
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = T.closeBtn;
    close.style.cssText = 'cursor:pointer;margin-left:6px;';
    btnRow.appendChild(save);
    btnRow.appendChild(close);
    p.appendChild(btnRow);

    close.addEventListener('click', function () { p.parentNode.removeChild(p); });
    save.addEventListener('click', function () {
      var c = { coords: ta.value, startDate: sd.value, startTime: st.value, endDate: ed.value, endTime: et.value, units: readUnits() };
      if (!core.parseCoords(c.coords).length) { err.textContent = T.errNoCoords; return; }
      if (!Object.keys(c.units).length) { err.textContent = T.errNoUnits; return; }
      if (isNaN(core.partsToTime(c.startDate, c.startTime)) || isNaN(core.partsToTime(c.endDate, c.endTime))) { err.textContent = T.errNoWindow; return; }
      if (core.partsToTime(c.startDate, c.startTime) >= core.partsToTime(c.endDate, c.endTime)) { err.textContent = T.errOrder; return; }
      saveCfg(c);
      p.parentNode.removeChild(p);
      runFill(c);
    });

    document.body.appendChild(p);
  }

  /* ---------------- fill ---------------- */
  function runFill(cfg) {
    var res = core.plan(cfg, game_data.village.coord, serverNow(), game_data.speed, game_data.unit_speed, effSpeeds);
    var choice = core.pick(res.eligible);
    if (!choice) {
      var msg = T.noneInWindow(res.all.length, res.early.length, res.late.length);
      if (res.early.length) {
        var wait = Math.min.apply(null, res.early.map(function (e) { return res.start - e.t; }));
        msg += T.canAttackIn(fmtDur(wait));
      }
      setStatus(msg, 'red');
      return;
    }
    for (var u in res.units) {
      if (res.units[u] > availCount(u)) {
        setStatus(T.notEnough(u, availCount(u), res.units[u]), 'red');
        return;
      }
    }
    var target = document.getElementsByName('input')[0];
    if (!target) { setStatus(T.noTargetField, 'red'); return; }
    target.value = choice.c;
    /* clear every unit field first so a template change never leaves stale counts */
    Object.keys(BASE_SPEED).forEach(function (uc) {
      var f = document.getElementsByName(uc)[0];
      if (f) f.value = '';
    });
    for (var u2 in res.units) {
      var inp = document.getElementsByName(u2)[0];
      if (inp) {
        if (typeof insertUnit === 'function') insertUnit(inp, res.units[u2]);
        else inp.value = res.units[u2];
      }
    }
    setStatus(T.filled(choice.c, fmt(choice.t), res.eligible.length, res.all.length), 'green');
    var btn = document.getElementById('target_attack');
    if (btn) btn.focus();
  }

  /* ---------------- entry ---------------- */
  statusBar();
  var saved = loadCfg();
  if (cfgValid(saved)) runFill(saved);
  else openPanel(saved || {});
  /* First ever run on this world: fetch the real speeds, then redo the fill
   * (the provisional fill used BASE_SPEED, which assumes a net multiplier of 1). */
  if (!effSpeeds) fetchSpeeds(function () {
    var c = loadCfg();
    if (cfgValid(c)) runFill(c);
  });
})();

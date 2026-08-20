// ══════════════════════════════════════════════════════════════
// renameVillages.js — mass village renamer for Tribal Wars
// ──────────────────────────────────────────────────────────────
// Self-contained rewrite of the old tribalwars.top / twcheese renamers,
// with NO external dependencies (the dead Dropbox / counterapi loads are
// why the old one stalled). Run it on:  overview_villages&mode=combined
//
// The name is built from an ordered list of SEGMENTS you can add, remove
// and drag to reorder. Each segment is one of:
//   • text     — fixed text (add several: a prefix AND a suffix)
//   • number   — auto-incrementing, with a start value + digit count
//   • distance — distance from a coordinate you type (per village)
//   • cluster  — name of the nearest entry in a coord/name list you paste
// Only the NUMBER segment depends on on-screen order (row 1 → start,
// row 2 → start+1, …); the others are computed per village from its coords.
// Example: text "[A] " + number(start 1, digits 3) + text " NORTH"
//          → "[A] 001 NORTH", "[A] 002 NORTH", …
//
// Write mode: overwrite (default) / prepend / append. Names are capped at
// the game limit of 32 characters. Config is saved per world in localStorage.
//
// ⚠ Coverage: the single-page path (rename the villages already on screen)
// is the tested path. The MULTI-PAGE ajax gather (rvGatherPagesAndRename) is
// a best-effort port and is NOT verified — see the banner on that function.
// ══════════════════════════════════════════════════════════════

// ── Pure name-building helpers (also exported for the headless test) ──────────
// Kept at top level as `var`/`function` only (no browser globals touched here)
// so a second $.getScript re-eval can't throw "redeclaration", and so the file
// stays require()-able under Node for the test harness.

var RV_MAX = 32;               // in-game village name length limit (data-length="32")
var RV_STORE = 'renameVillages_v2';

// Distance between two "X|Y" coordinate strings, or null if either is malformed.
function rvCalcDistance(c1, c2) {
  var re = /^\s*(\d+)\s*\|\s*(\d+)\s*$/;
  var a = re.exec(c1 || ''), b = re.exec(c2 || '');
  if (!a || !b) return null;
  var dx = (+a[1]) - (+b[1]), dy = (+a[2]) - (+b[2]);
  return Math.sqrt(dx * dx + dy * dy);
}

// Left-pad an integer with zeros to at least `digits` wide (never truncates).
function rvPad(n, digits) {
  var s = String(Math.trunc(n));
  var neg = s.charAt(0) === '-';
  if (neg) s = s.slice(1);
  while (s.length < digits) s = '0' + s;
  return (neg ? '-' : '') + s;
}

// Name of the nearest cluster to `coord`. `clustersText` = lines of
// "500|500 some name" (name = everything after the coord). '' if none/parse-fail.
function rvNearestCluster(coord, clustersText) {
  if (!coord || !clustersText) return '';
  var best = '', bestD = Infinity;
  String(clustersText).split('\n').forEach(function (line) {
    line = line.trim();
    if (!line) return;
    var parts = line.split(/\s+/);
    var d = rvCalcDistance(coord, parts[0]);
    if (d != null && d < bestD) { bestD = d; best = parts.slice(1).join(' '); }
  });
  return best;
}

// Build the raw (pre-mode, pre-cap) name for the village at `index` / `coord`.
// Segments are concatenated verbatim — spacing is the user's job (put it in the
// text segments), which is the only predictable rule when mixing segment types.
function rvBuildName(segments, index, coord) {
  var name = '';
  (segments || []).forEach(function (seg) {
    if (!seg || !seg.enabled) return;
    switch (seg.type) {
      case 'text':
        name += (seg.text || '');
        break;
      case 'number': {
        var start = Number.isFinite(seg.start) ? seg.start : 1;
        var digits = (seg.digits > 0) ? seg.digits : 1;
        name += rvPad(start + index, digits);
        break;
      }
      case 'distance': {
        var d = rvCalcDistance(coord, seg.target);
        if (d != null) name += String(Math.round(d * 10) / 10);
        break;
      }
      case 'cluster':
        name += rvNearestCluster(coord, seg.clusters);
        break;
    }
  });
  return name;
}

// Combine the generated text with the current name per write mode.
function rvApplyMode(generated, original, mode) {
  original = original || '';
  if (mode === 'prepend') return generated + original;
  if (mode === 'append')  return original + generated;
  return generated; // overwrite
}

// Enforce the 32-char cap. Returns { name, truncated }.
function rvCap(s) {
  s = s || '';
  return s.length > RV_MAX ? { name: s.slice(0, RV_MAX), truncated: true }
                           : { name: s, truncated: false };
}

// ══════════════════════════════════════════════════════════════
// Browser UI + runner. Everything below touches jQuery / DOM / game_data and
// therefore lives inside functions only (never at top level), so require()
// under Node never reaches it. Entry point rvMain() is called by the guard
// at the very bottom.
// ══════════════════════════════════════════════════════════════

function rvDefaultSegments() {
  // Seeds the builder with the user's own example so it works out of the box.
  return [
    { enabled: true, type: 'text',   text: '[A] ' },
    { enabled: true, type: 'number', start: 1, digits: 3 },
    { enabled: true, type: 'text',   text: ' NORTH' },
  ];
}

function rvLoadConfig() {
  try {
    var raw = localStorage.getItem(game_data.world + RV_STORE);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && Array.isArray(o.segments) && o.segments.length)
        return { segments: o.segments, mode: o.mode || 'overwrite' };
    }
  } catch (e) {}
  return { segments: rvDefaultSegments(), mode: 'overwrite' };
}

function rvSaveConfig() {
  var cfg = { segments: rvReadSegments(), mode: rvReadMode() };
  localStorage.setItem(game_data.world + RV_STORE, JSON.stringify(cfg));
  UI.SuccessMessage('Rename configuration saved.', 2000);
}

// ── DOM is the source of truth for segment VALUES (so edits + drag-reorder are
// always reflected); rebuild the table from an array only on structural change. ─
function rvReadSegments() {
  var segs = [];
  $('#rv-seg-table tbody tr.rv-seg').each(function () {
    var $r = $(this);
    var type = $r.find('.rv-type').val();
    var seg = { enabled: $r.find('.rv-en').is(':checked'), type: type };
    if (type === 'text') seg.text = $r.find('.rv-text').val();
    else if (type === 'number') {
      seg.start = parseInt($r.find('.rv-start').val(), 10);
      if (!Number.isFinite(seg.start)) seg.start = 1;
      seg.digits = parseInt($r.find('.rv-digits').val(), 10);
      if (!(seg.digits > 0)) seg.digits = 1;
    } else if (type === 'distance') seg.target = $r.find('.rv-target').val();
    else if (type === 'cluster') seg.clusters = $r.find('.rv-clusters').val();
    segs.push(seg);
  });
  return segs;
}

function rvReadMode() {
  return $('#rv-container input[name=rv-mode]:checked').val() || 'overwrite';
}

function rvSegFieldsHtml(seg) {
  var t = seg.type;
  if (t === 'text')
    return '<input type="text" class="rv-inp rv-text" placeholder="e.g. [A] " value="' + rvEsc(seg.text || '') + '">';
  if (t === 'number')
    return 'Start <input type="number" class="rv-inp rv-num rv-start" value="' + (Number.isFinite(seg.start) ? seg.start : 1) + '">'
         + ' &nbsp;Digits <input type="number" class="rv-inp rv-num rv-digits" min="1" value="' + (seg.digits > 0 ? seg.digits : 3) + '">';
  if (t === 'distance')
    return '<input type="text" class="rv-inp rv-target" placeholder="500|500" value="' + rvEsc(seg.target || '') + '">';
  if (t === 'cluster')
    return '<textarea class="rv-inp rv-clusters" rows="3" placeholder="500|500 North&#10;400|400 South">' + rvEsc(seg.clusters || '') + '</textarea>';
  return '';
}

function rvSegRowHtml(seg) {
  var types = [['text', 'Text'], ['number', 'Number'], ['distance', 'Distance from target'], ['cluster', 'Nearest cluster']];
  var opts = types.map(function (p) {
    return '<option value="' + p[0] + '"' + (seg.type === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
  }).join('');
  return '<tr class="rv-seg">'
    + '<td style="text-align:center;"><input type="checkbox" class="rv-en"' + (seg.enabled ? ' checked' : '') + '></td>'
    + '<td><select class="rv-type">' + opts + '</select></td>'
    + '<td class="rv-fields">' + rvSegFieldsHtml(seg) + '</td>'
    + '<td class="rv-handle" title="drag to reorder">≡</td>'
    + '<td style="text-align:center;"><a href="#" class="rv-del" title="remove segment">✕</a></td>'
    + '</tr>';
}

function rvRenderSegments(segs) {
  var $tb = $('#rv-seg-table tbody');
  $tb.empty();
  segs.forEach(function (s) { $tb.append(rvSegRowHtml(s)); });
  rvUpdatePreview();
}

function rvEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Real coords + current names of the villages on screen right now (for preview).
function rvVisibleRows() {
  return $('.quickedit-vn').map(function () {
    var m = (this.innerText.match(/\d+\|\d+/g) || []);
    var coord = m.length ? m[m.length - 1] : '';
    var orig = $(this).find('.quickedit-label').attr('data-text') || '';
    return { coord: coord, orig: orig };
  }).get();
}

function rvUpdatePreview() {
  var segs = rvReadSegments();
  var mode = rvReadMode();
  var rows = rvVisibleRows();
  var $box = $('#rv-preview');
  if (!rows.length) { $box.html('<i>No villages detected on this page.</i>'); return; }
  var N = Math.min(5, rows.length);
  var anyTrunc = false;
  var lines = [];
  for (var i = 0; i < N; i++) {
    var raw = rvApplyMode(rvBuildName(segs, i, rows[i].coord), rows[i].orig, mode);
    var capped = rvCap(raw);
    if (capped.truncated) anyTrunc = true;
    lines.push('<div class="rv-pv-line"><span class="rv-pv-n">' + (i + 1) + '.</span> '
      + rvEsc(capped.name) + '<span class="rv-pv-len"> (' + capped.name.length + ')</span></div>');
  }
  var more = rows.length > N ? '<div class="rv-pv-more">… ' + (rows.length - N) + ' more on this page</div>' : '';
  var warn = anyTrunc ? '<div class="rv-warn">⚠ Some names exceed ' + RV_MAX + ' chars and will be cut.</div>' : '';
  $box.html(lines.join('') + more + warn);
}

function rvInjectStyles() {
  var css = ''
    + '#rv-container{position:fixed;top:60px;left:12px;z-index:12000;width:520px;max-width:96vw;'
    + 'background:#2b2438;color:#efe6d0;border:2px solid #6b4;border-color:#5a7d4b;border-radius:6px;'
    + 'font-size:12px;box-shadow:0 6px 24px rgba(0,0,0,.5);}'
    + '#rv-container h2{margin:0;padding:8px 10px;background:#1f2a20;color:#ffe;border-radius:4px 4px 0 0;'
    + 'cursor:move;font-size:14px;}'
    + '#rv-container .rv-close{float:right;color:#f88;text-decoration:none;font-weight:bold;}'
    + '#rv-body{padding:10px;}'
    + '#rv-seg-table{width:100%;border-collapse:collapse;}'
    + '#rv-seg-table td{border:1px solid #4a4458;padding:4px;vertical-align:middle;}'
    + '#rv-seg-table th{padding:5px 4px;background:#1f2a20;color:#ffe;font-weight:bold;text-align:left;'
    + 'border:1px solid #4a4458;}'
    + '.rv-inp{width:96%;background:#181320;color:#efe6d0;border:1px solid #4a4458;border-radius:3px;padding:2px 4px;}'
    + '.rv-num{width:56px;}'
    + '.rv-type{background:#181320;color:#efe6d0;border:1px solid #4a4458;border-radius:3px;padding:2px;}'
    + '.rv-handle{cursor:move;text-align:center;color:#9a8;font-size:16px;user-select:none;}'
    + '.rv-del{color:#f88;text-decoration:none;}'
    + '.rv-placeholder{height:28px;background:#3a3450;}'
    + '#rv-preview{margin:8px 0;padding:6px 8px;background:#181320;border:1px solid #4a4458;border-radius:4px;'
    + 'font-family:monospace;min-height:20px;}'
    + '.rv-pv-line{white-space:pre;}'
    + '.rv-pv-n{color:#8a8;}.rv-pv-len{color:#776;}.rv-pv-more{color:#998;margin-top:3px;}'
    + '.rv-warn{color:#f0a020;margin-top:4px;}'
    + '.rv-btn{background:#3a5a2f;color:#efe;border:1px solid #5a7d4b;border-radius:4px;padding:5px 12px;'
    + 'cursor:pointer;margin-right:6px;}'
    + '.rv-btn.sec{background:#3a3450;border-color:#4a4458;}'
    + '.rv-row{margin:8px 0;}'
    + '#rv-add{background:none;border:1px dashed #5a7d4b;color:#bda;border-radius:4px;padding:3px 8px;cursor:pointer;}'
    + '#rv-mode label{margin-right:12px;}';
  // Reuse the existing tag if present so re-running the script refreshes the CSS
  // (a returning-early guard would keep the stale styles from the first run).
  var st = document.getElementById('rv-styles');
  if (!st) {
    st = document.createElement('style');
    st.id = 'rv-styles';
    document.getElementsByTagName('head')[0].appendChild(st);
  }
  st.textContent = css;
}

function rvBuildInterface(cfg) {
  $('#rv-container').remove();
  var html = ''
    + '<div id="rv-container">'
    + '  <h2>Rename Villages <a href="#" class="rv-close" title="close">✕</a></h2>'
    + '  <div id="rv-body">'
    + '    <table id="rv-seg-table"><thead><tr>'
    + '      <th style="width:24px;">On</th><th style="width:150px;">Segment</th><th>Value</th>'
    + '      <th style="width:20px;"></th><th style="width:20px;"></th>'
    + '    </tr></thead><tbody></tbody></table>'
    + '    <div class="rv-row"><button id="rv-add" type="button">+ Add segment</button></div>'
    + '    <div><b>Preview</b> (this page, in order):</div>'
    + '    <div id="rv-preview"></div>'
    + '    <div class="rv-row" id="rv-mode">'
    + '      <label><input type="radio" name="rv-mode" value="overwrite"' + (cfg.mode === 'overwrite' ? ' checked' : '') + '> Overwrite</label>'
    + '      <label><input type="radio" name="rv-mode" value="prepend"' + (cfg.mode === 'prepend' ? ' checked' : '') + '> Prepend</label>'
    + '      <label><input type="radio" name="rv-mode" value="append"' + (cfg.mode === 'append' ? ' checked' : '') + '> Append</label>'
    + '    </div>'
    + '    <div class="rv-row">'
    + '      <button class="rv-btn" id="rv-run" type="button">Rename all villages</button>'
    + '      <button class="rv-btn sec" id="rv-save" type="button">Save configuration</button>'
    + '    </div>'
    + '    <div style="color:#998;font-size:11px;">Only the <b>Number</b> segment follows on-screen order — sort the overview first if that matters. Names are capped at ' + RV_MAX + ' characters.</div>'
    + '  </div>'
    + '</div>';

  $('#contentContainer').eq(0).prepend(html);
  $('#mobileContent').eq(0).prepend(html);

  rvRenderSegments(cfg.segments);

  // ── Wiring (delegated so dynamically-added rows work) ──
  var $c = $('#rv-container');
  $c.on('click', '.rv-close', function (e) { e.preventDefault(); $('#rv-container').remove(); });
  $c.on('click', '#rv-add', function () {
    var segs = rvReadSegments();
    segs.push({ enabled: true, type: 'text', text: '' });
    rvRenderSegments(segs);
  });
  $c.on('click', '.rv-del', function (e) {
    e.preventDefault();
    var idx = $(this).closest('tr.rv-seg').index();
    var segs = rvReadSegments();
    segs.splice(idx, 1);
    if (!segs.length) segs.push({ enabled: true, type: 'text', text: '' });
    rvRenderSegments(segs);
  });
  $c.on('change', '.rv-type', function () {
    // Swap the fields for the chosen type; keep the rest of the rows intact.
    var segs = rvReadSegments();
    var idx = $(this).closest('tr.rv-seg').index();
    segs[idx] = { enabled: segs[idx].enabled, type: $(this).val() };
    rvRenderSegments(segs);
  });
  $c.on('input change', '.rv-inp, .rv-en, input[name=rv-mode]', rvUpdatePreview);
  $c.on('click', '#rv-save', rvSaveConfig);
  $c.on('click', '#rv-run', function () {
    if (!confirm('Rename all villages using the previewed pattern? This cannot be undone in bulk.')) return;
    rvStartRename();
  });

  if (game_data.device === 'desktop') {
    $c.css('position', 'fixed');
    try { $c.draggable({ handle: 'h2' }); } catch (e) {}
  } else {
    $c.css({ left: '2vw', width: '96vw' });
  }
  try {
    $('#rv-seg-table tbody').sortable({
      handle: '.rv-handle', placeholder: 'rv-placeholder', tolerance: 'pointer',
      stop: rvUpdatePreview,
    });
  } catch (e) {}
}

// ── Runner ────────────────────────────────────────────────────────────────────
// Two paths: single page (rows already on screen → rename in place, the tested
// path) vs. multiple pages (gather via ajax first — UNVERIFIED, see banner).
function rvStartRename() {
  var hasPages = document.getElementsByClassName('paged-nav-item').length > 0;
  if (hasPages) rvGatherPagesAndRename();
  else rvRenameLoaded();
}

// Bind QuickEdit on the currently-loaded rows and rename them in place.
function rvRenameLoaded() {
  $('.quickedit-vn').QuickEdit({
    url: TribalWars.buildURL('POST', 'main', { ajaxaction: 'change_name', village: '__ID__' }),
  });
  rvRenameRows(document.getElementsByClassName('quickedit-vn'));
}

// The apply loop. For each village: click the rename pencil, then — on the NEXT
// tick (QuickEdit builds its <input> asynchronously) — set the value and click
// save. Villages are throttled apart to respect the game's rate limits.
function rvRenameRows(rows) {
  var segs = rvReadSegments();
  var mode = rvReadMode();
  var len = rows.length;
  var DELAY = 250;
  var nr = 0;
  var truncated = 0;

  if (!len) { UI.ErrorMessage('No villages found to rename.', 4000); return; }

  function step() {
    var row = rows[nr];
    var m = (row.innerText.match(/\d+\|\d+/g) || []);
    var coord = m.length ? m[m.length - 1] : '';
    var orig = $(row).find('.quickedit-label').attr('data-text') || '';
    var capped = rvCap(rvApplyMode(rvBuildName(segs, nr, coord), orig, mode));
    if (capped.truncated) truncated++;

    row.getElementsByClassName('rename-icon')[0].click();
    (function (r, name) {
      window.setTimeout(function () {
        $(r).find('input[type=text]').val(name);
        $(r).find('input[type=button]').click();
      }, 0);
    })(row, capped.name);

    nr++;
    if (nr < len) {
      window.setTimeout(function () {
        UI.SuccessMessage(nr + '/' + len + ' villages', 1000);
        step();
      }, DELAY);
    } else {
      window.setTimeout(function () {
        UI.SuccessMessage('Done — renamed ' + len + ' villages'
          + (truncated ? ' (' + truncated + ' cut to ' + RV_MAX + ' chars)' : ''), 6000);
      }, DELAY);
    }
  }
  step();
}

// ⚠ UNVERIFIED PATH — multi-page gather. The reference/test account is
// single-page, so this branch has NOT been exercised end-to-end. It ports the
// old script's approach: ajax every page, keep each row's name cell, rebuild
// #combined_table, then rename. If you have >1 page of villages, test on a few
// first. Logs a warning so it's obvious when this path runs.
function rvGatherPagesAndRename() {
  console.warn('[renameVillages] multi-page gather is running — this path is UNVERIFIED; verify results on a few villages first.');
  var list_pages = [];
  var items = document.getElementsByClassName('paged-nav-item');
  var $sel = $(document).find('.paged-nav-item').parent().find('select');
  if ($sel.length > 0) {
    Array.from($sel.find('option')).forEach(function (o) { list_pages.push(o.value); });
    list_pages.pop();
  } else {
    var nr = 0;
    Array.from(items).forEach(function (item) {
      list_pages.push(item.href.split('page=')[0] + 'page=' + nr);
      nr++;
    });
  }
  list_pages = list_pages.reverse();

  var rows = [];
  var desktop = game_data.device === 'desktop';
  function ajaxRequest(urls) {
    var current = urls.length > 0 ? urls.pop() : 'stop';
    if (current === 'stop') {
      $('.row_a').remove(); $('.row_b').remove();
      var table = document.getElementById('combined_table');
      for (var i = 0; i < rows.length; i++) $(table).append(rows[i]);
      $('.quickedit-vn').QuickEdit({
        url: TribalWars.buildURL('POST', 'main', { ajaxaction: 'change_name', village: '__ID__' }),
      });
      rvRenameRows(document.getElementsByClassName('quickedit-vn'));
      return;
    }
    var start = new Date().getTime();
    $.ajax({
      url: current, method: 'get',
      success: function (data) {
        var doc = new DOMParser().parseFromString(data, 'text/html');
        var trs = doc.getElementById('combined_table').children[0].children;
        for (var i = (desktop ? 1 : 0); i < trs.length; i++) {
          var nameCell = desktop ? trs[i].children[1] : $(trs[i]).find('.quickedit-vn')[0];
          if (!nameCell) continue;
          var tr = document.createElement('tr');
          tr.appendChild(nameCell);
          rows.push(tr);
        }
        var wait = 200 - (new Date().getTime() - start);
        window.setTimeout(function () {
          UI.SuccessMessage('fetched page, ' + urls.length + ' left', 800);
          ajaxRequest(urls);
        }, wait > 0 ? wait : 0);
      },
      error: function () { UI.ErrorMessage('Failed to fetch a page — aborting.', 5000); },
    });
  }
  ajaxRequest(list_pages);
}

function rvMain() {
  if (!window.location.href.includes('screen=overview_villages&mode=combined')) {
    alert('Rename Villages must be run from the "Overview → Combined" page (overview_villages&mode=combined).');
    window.location.href = game_data.link_base_pure + 'overview_villages&mode=combined';
    return;
  }
  rvInjectStyles();
  rvBuildInterface(rvLoadConfig());
}

// ── Entry guard: browser (game_data present) runs the UI; Node require() gets
// the pure helpers only (top level above never touches browser globals). ──
if (typeof game_data !== 'undefined') {
  rvMain();
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    rvCalcDistance: rvCalcDistance, rvPad: rvPad, rvNearestCluster: rvNearestCluster,
    rvBuildName: rvBuildName, rvApplyMode: rvApplyMode, rvCap: rvCap, RV_MAX: RV_MAX,
  };
}

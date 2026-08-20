// Original Script by lodi94 (https://forum.tribalwars.net/index.php?threads/download-tribe-info.285469/)
// Maintained by Vanquished
//
// v3 — adds building levels + a structured parse → serialize split so every view can
// export as .txt AND .json. Units/buildings change based on world settings. Modes:
//   members_troops    "Read troops of the village"          — a village's own army
//   members_defense   "Read defenses in the village"        — everything stationed there ("en el pueblo")
//   members_incoming  "Read incoming troops of the village" — troops en route to it   ("en camino")
//   all_troops        "Read all troops"                     — the three troop views combined (Type column)
//   members_buildings "Read all buildings"                  — 16 building levels per village
//   everything        "Read everything (JSON only)"         — all troops + buildings, one object per village
//
// Units .txt positionally as  Coords, Player, [Type], <units in game_data.units order>, [IncomingAttacks].
// Buildings .txt positionally as Coords, Player, Village, Points, <buildings in header order>.
// .json exports are more free-formated based on mode, but contain all relevant information with similar structures.

/* ─────────────────────────── UI ─────────────────────────── */

function openUI() {
    // Two <hr> separators group the list: single troop views + all_troops · buildings · everything.
    html = '<head></head><body><h1>Tribe troop counter</h1><form><fieldset><legend>Settings</legend>'
        + '<p><input type="radio" name="mode" id="of"  onchange="setMode(\'members_troops\')">Read troops of the village</input></p>'
        + '<p><input type="radio" name="mode" id="in"  onchange="setMode(\'members_defense\')">Read defenses in the village</input></p>'
        + '<p><input type="radio" name="mode" id="inc" onchange="setMode(\'members_incoming\')">Read incoming troops of the village</input></p>'
        + '<p><input type="radio" name="mode" id="allt" onchange="setMode(\'all_troops\')">Read all troops</input></p>'
        + '<hr>'
        + '<p><input type="radio" name="mode" id="bld" onchange="setMode(\'members_buildings\')">Read all buildings</input></p>'
        + '<hr>'
        + '<p><input type="radio" name="mode" id="all" onchange="setMode(\'everything\')">Read everything (JSON only)</input></p>'
        + '</fieldset><fieldset><legend>Filters</legend><select id="variable"><option value="x">x</option><option value="y">y</option>' + createUnitOption() + '</select><select id="kind"><option value=">">\></option><option value="<">\<</option></select><input type="text" id="value"></input><input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="addFilter()" value="Save filter"></input><p><table><tr><th>Variable filtered</th><th>Operatore</th><th>Value</th><th></th></tr>' + createFilterTable() + '</form></p></fieldset><div><p><input type="button" class="btn evt-confirm-btn btn-confirm-yes" id="run" onclick="readData()" value="Read data"></input></p></div></body>';
    Dialog.show("Troop counter", html);
    var m = localStorage.troopCounterMode;
    var byMode = { members_defense: "in", members_incoming: "inc", all_troops: "allt", members_buildings: "bld", everything: "all" };
    var id = byMode[m] || "of";
    document.getElementById(id).checked = true;
}

function setMode(a) {
    localStorage.troopCounterMode = a;
}

// game_data.mode is unreliable on some worlds (often null even on the members
// overview, only set when an in-game AJAX click leaves a stale value behind).
// The URL's mode param is always correct, so gate on that instead.

function getPageMode() {
    return new URLSearchParams(window.location.search).get("mode");
}

function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function downloadInfo(url) {
    var request = new XMLHttpRequest();
    request.open('GET', url, false);
    request.send(null);
    return request.response;
}

function getPlayerDict() {
    playerDict = {};
    now = new Date();
    server = window.location.host;
    if (localStorage.playerDictFake) {
        if (localStorage.playerDictFake.split(":::")[0] == server) {
            savedDate = new Date(localStorage.playerDictFake.split(":::")[1])
            if (now - savedDate < 1000 * 60 * 60) {
                playerDict = JSON.parse(localStorage.playerDictFake.split(":::")[2]);
                return playerDict;
            }
        }
    }
    playerUrl = "https://" + window.location.host + "/map/player.txt";
    playerList = downloadInfo(playerUrl).split("\n");
    for (i = 0; i < playerList.length; i++) {
        if (playerList[i] != "") {
            row = playerList[i].split(",");
            playerDict[row[0]] = row[1].replace(/\+/g, " ");
        }
    }
    localStorage.playerDictFake = server + ":::" + now + ":::" + JSON.stringify(playerDict);
    return playerDict;

}

function addFilter() {
    filters = {};
    if (localStorage.troopCounterFilter) {
        filters = JSON.parse(localStorage.troopCounterFilter);
    }
    if (filters[document.getElementById("variable").value]) {
        if (isNaN(document.getElementById("value").value)) {
            UI.ErrorMessage("Insert a valid value", 3000);

        } else {
            filters[document.getElementById("variable").value].push([document.getElementById("kind").value, document.getElementById("value").value]);
        }

    } else {
        if (isNaN(document.getElementById("value").value)) {
            UI.ErrorMessage("Insert a valid value", 3000);

        } else {
            filters[document.getElementById("variable").value] = [[document.getElementById("kind").value, document.getElementById("value").value]];
        }
    }
    localStorage.troopCounterFilter = JSON.stringify(filters);
    openUI();
}

function createUnitOption() {
    unitsList = game_data.units;
    menu = "";
    for (i = 0; i < unitsList.length; i++) {
        menu = menu + '<option value="' + unitsList[i] + '">' + unitsList[i] + '</option>';
    }
    return menu;
}

function createFilterTable() {
    filters = {};
    if (localStorage.troopCounterFilter) {
        filters = JSON.parse(localStorage.troopCounterFilter);
    }
    rows = ""
    for (filter in filters) {
        for (i = 0; i < filters[filter].length; i++) {
            rows = rows + '<tr><td>' + filter + '</td><td>' + filters[filter][i][0] + '</td><td>' + filters[filter][i][1] + '</td><td><input type="image" src="https://dsit.innogamescdn.com/asset/cbd6f76/graphic/delete.png" onclick="deleteFilter(\'' + filter + '\',\'' + i.toString() + '\')"></input></td></tr>';
        }
    }
    return rows;
}

function deleteFilter(filter, i) {
    if (localStorage.troopCounterFilter) {
        filtres = JSON.parse(localStorage.troopCounterFilter);
        if (filter in filtres) {
            if (parseInt(i) < filtres[filter].length) {
                filtres[filter].splice(parseInt(i), 1);
            }
        }
    }
    localStorage.troopCounterFilter = JSON.stringify(filtres);
    openUI();
}

/* ───────────────────────── Fetch ───────────────────────── */

// Fetch one ally sub-page (synchronously) and return its HTML.
// In sitter mode (someone operates the account in vacation mode) the game needs a
// t=<owner_id> param so requests act on behalf of the sat account. game_data.player.sitter
// is 0 when you run your own account, the sitter's id otherwise.
function fetchTribePage(gameMode, playerId, pageNumber) {
    var URLReq;
    if (game_data.player.sitter > 0) {
        URLReq = "https://" + window.location.host + "/game.php?t=" + game_data.player.id + "&screen=ally&mode=" + gameMode + "&player_id=" + playerId + "&page=" + pageNumber;
    } else {
        URLReq = "https://" + window.location.host + "/game.php?screen=ally&mode=" + gameMode + "&player_id=" + playerId + "&page=" + pageNumber;
    }
    return $.ajax({ url: URLReq, async: false }).responseText;
}

/* ─────────────────── Parsing (pure helpers) ─────────────────── */
// These take raw response HTML and return structured rows — no DOM / game_data access —
// so they can be unit-tested against saved page fixtures (see .omc/test_tribeinfo_v3.js).

// Strip a game table cell down to its text. TW writes counts with a grey thousands-dot
// (<span class="grey">.</span>) and pads with whitespace; kill spaces FIRST so the span
// collapses to <spanclass="grey"> (matching the historical regex), then drop it.
function cleanCell(html) {
    return html.split("</td>")[0]
        .replace(/\s/g, "")   // kill ALL whitespace (space/tab/CR/LF) so <span class → <spanclass
        .replace(/<spanclass="grey">\.<\/span>/g, "")
        .replace(/<[^>]*>/g, "");
}

// Points live in the last <td> before the unit/building cells (the "Puntos" column).
// Strip tags and the thousands separator so "3<span>.</span>166" → 3166.
function extractPoints(prefix) {
    var tds = prefix.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
    if (!tds.length) return 0;
    var digits = tds[tds.length - 1].replace(/<[^>]*>/g, "").replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
}

// Village name = the anchor text with its "(x|y) Continent" suffix stripped.
function extractVillageName(prefix) {
    var m = prefix.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    if (!m) return "";
    return m[1].replace(/&amp;/g, "&").replace(/\s*\(\d+\|\d+\).*$/, "").trim();
}

// Building columns are language-independent: read the slug straight from each header
// image filename (…/buildings/main.webp → "main"). Works on any world/locale.
function detectBuildingSlugs(headerRow) {
    var slugs = [], re = /\/buildings\/([a-z_]+)\.(?:webp|png)/gi, m;
    while ((m = re.exec(headerRow))) slugs.push(m[1]);
    return slugs;
}

// Isolate the data-table rows from a fetched page (see the "vis w100" note in the README/commit).
// Returns null when the page isn't the expected shape (so the caller can skip it).
function tableRows(responseText) {
    var temp = responseText.split("vis w100");
    if (!(temp.length === 2 || temp.length === 4)) return null;
    return responseText.split("vis w100")[temp.length - 1].split("<tr>");
}

// Parse one fetched page into structured village rows for a single logical view.
// view: 'troops' | 'defense' | 'incoming' | 'buildings'.
//   troops    — own army; may carry an incoming-attacks count
//   defense   — units stationed in the village (row 1 of each 2-row pair)
//   incoming  — units en route to the village   (row 2 of each pair)
//   buildings — 16 building levels
// Each row: { coords, village, points, incoming, cells: { slug: number } }.
// unitsList is game_data.units for troop views; buildings detect their own slugs.
function parseView(responseText, view, unitsList) {
    var out = { slugs: [], rows: [] };
    var rows = tableRows(responseText);
    if (!rows) return out;

    var isPair = (view === "defense" || view === "incoming");
    var step = isPair ? 2 : 1;
    var header = rows[1] || "";

    if (view === "buildings") {
        out.slugs = detectBuildingSlugs(header);
    } else {
        out.slugs = unitsList.slice();
    }
    // The incoming-attacks column (unit/att.webp) only exists when the member shares it;
    // otherwise the last cell is "active orders" and must NOT be read as incoming.
    var hasIncoming = header.indexOf("unit/att.webp") !== -1;

    // Iterate every data row (rows[0]=pre-table, rows[1]=header). A coords guard skips the
    // trailing non-data segment, so we can walk to the end without the old off-by-one that
    // dropped the last village.
    for (var j = 2; j < rows.length; j += step) {
        if (isPair && j + 1 >= rows.length) break; // need both halves of the pair
        var coordRow = rows[j];                                  // row 1 always has the village link + points
        var unitRow = (view === "incoming") ? rows[j + 1] : rows[j];
        var cm = coordRow.match(/\d{1,3}\|\d{1,3}/g);
        if (!cm) continue;                                       // not a village row

        var prefix = unitRow.split(/<td class="">|<td class="hidden">/g)[0];
        var cellSegs = unitRow.split(/<td class="">|<td class="hidden">/g); // [prefix, cell1, cell2, …]
        var cells = {};
        for (var k = 1; k <= out.slugs.length && k < cellSegs.length; k++) {
            cells[out.slugs[k - 1]] = cleanCell(cellSegs[k]);
        }

        var incoming = "";
        if (view === "troops" && hasIncoming) {
            // Incoming attacks = the last cell in the row (present only when shared).
            incoming = cleanCell(cellSegs[cellSegs.length - 1]);
        }

        out.rows.push({
            coords: cm[0],
            village: extractVillageName(coordRow),               // coords row carries the name/points
            points: extractPoints(coordRow.split(/<td class="">|<td class="hidden">/g)[0]),
            incoming: incoming,
            cells: cells
        });
    }
    return out;
}

// Apply the saved x / y / unit-count filters to a parsed row. Mirrors v2: a ">" filter hides
// the row when the value is below the threshold, "<" when above. Keys absent on the row
// (e.g. unit filters on a buildings row) simply never match, so they don't hide it.
function passesFilters(row, filtres) {
    var probe = { x: row.coords.split("|")[0], y: row.coords.split("|")[1] };
    for (var s in row.cells) probe[s] = row.cells[s];
    for (var key in filtres) {
        for (var f = 0; f < filtres[key].length; f++) {
            var op = filtres[key][f][0], val = parseInt(filtres[key][f][1]);
            var have = parseInt(probe[key]);
            if (op === ">" && have < val) return false;
            if (op === "<" && have > val) return false;
        }
    }
    return true;
}

/* ─────────────────── Serialization ─────────────────── */

var UNIX = function () { return Math.floor(Date.now() / 1000); };
var WORLD = function () { return (typeof window !== "undefined" && window.location) ? window.location.host : ""; };

// numeric cell → int (blank / "." → 0)
function num(v) { var n = parseInt(v); return isNaN(n) ? 0 : n; }

// --- CSV (.txt) ---
// Troop CSV. Preserves the tribe-calculator contract exactly:
//   Coords, Player, [Type], <units…>, [IncomingAttacks]
// `typed` adds the Type column (all_troops); `withIncoming` adds the trailing count.
function troopCsv(sections, unitsList, opts) {
    opts = opts || {};
    var header = "Coords,Player,";
    if (opts.typed) header += "Type,";
    for (var u = 0; u < unitsList.length; u++) header += unitsList[u] + ",";
    if (opts.withIncoming) header += "IncomingAttacks,";
    var data = header + "\n";
    sections.forEach(function (sec) {
        sec.rows.forEach(function (r) {
            data += r.coords + ",";
            data += (r.player || "") + ",";
            if (opts.typed) data += sec.type + ",";
            for (var u = 0; u < unitsList.length; u++) data += (r.cells[unitsList[u]] || "0") + ",";
            if (opts.withIncoming) data += (r.incoming || "") + ",";
            data += "\n";
        });
    });
    return data;
}

// Buildings CSV — new format (no calculator consumer): Coords, Player, Village, Points, <buildings…>
function buildingsCsv(rows, slugs) {
    var data = "Coords,Player,Village,Points," + slugs.join(",") + ",\n";
    rows.forEach(function (r) {
        data += r.coords + "," + (r.player || "") + "," + (r.village || "") + "," + r.points + ",";
        for (var b = 0; b < slugs.length; b++) data += (r.cells[slugs[b]] || "0") + ",";
        data += "\n";
    });
    return data;
}

// --- JSON ---
function unitObj(cells, slugs) {
    var o = {};
    slugs.forEach(function (s) { o[s] = num(cells[s]); });
    return o;
}

// Single-view JSON. `key` names the unit block (troops / in_village / enroute / buildings).
function singleJson(mode, rows, slugs, key, withIncoming) {
    var villages = rows.map(function (r) {
        var obj = { player: r.player || "", player_id: r.playerId || "", village: r.village || "", coords: r.coords, points: r.points };
        if (withIncoming) obj.incoming_attacks = num(r.incoming);
        obj[key] = unitObj(r.cells, slugs);
        return obj;
    });
    return JSON.stringify({ exported_at: UNIX(), world: WORLD(), mode: mode, villages: villages }, null, 2);
}

// Combined JSON (all_troops / everything): one object per village, merging whichever views
// were fetched. Keyed by player_id + coords so a player's villages never collide across views.
function combinedJson(mode, views, unitSlugs, buildingSlugs) {
    // views: { troops:[], defense:[], incoming:[], buildings:[] } — any subset present
    var map = {};
    function ensure(r) {
        var k = (r.playerId || "") + "|" + r.coords;
        if (!map[k]) {
            map[k] = { player: r.player || "", player_id: r.playerId || "", village: r.village || "", coords: r.coords, points: r.points, _order: Object.keys(map).length };
        }
        var e = map[k];
        if (!e.village && r.village) e.village = r.village;   // fill from whichever view has it
        if (!e.points && r.points) e.points = r.points;
        return e;
    }
    (views.troops || []).forEach(function (r) { var e = ensure(r); e.troops = unitObj(r.cells, unitSlugs); e.incoming_attacks = num(r.incoming); });
    (views.defense || []).forEach(function (r) { ensure(r).in_village = unitObj(r.cells, unitSlugs); });
    (views.incoming || []).forEach(function (r) { ensure(r).enroute = unitObj(r.cells, unitSlugs); });
    (views.buildings || []).forEach(function (r) { ensure(r).buildings = unitObj(r.cells, buildingSlugs); });

    var villages = Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (a, b) { return a._order - b._order; })
        .map(function (e) { delete e._order; return e; });
    return JSON.stringify({ exported_at: UNIX(), world: WORLD(), mode: mode, villages: villages }, null, 2);
}

/* ─────────────────── Orchestration ─────────────────── */

function readData() {
    if (!(game_data.screen == "ally" && getPageMode() == "members")) {
        UI.ErrorMessage("Open this from the tribe Members tab (screen=ally&mode=members), then run “Read data” again.", 5000);
        return;
    }

    var mode = localStorage.troopCounterMode || "members_troops";
    var unitsList = game_data.units;
    var filtres = {};
    if (localStorage.troopCounterFilter) filtres = JSON.parse(localStorage.troopCounterFilter);
    var players = getPlayerDict();

    // Which game pages each mode needs, and which views we parse out of them.
    var needTroops = (mode === "members_troops" || mode === "all_troops" || mode === "everything");
    var needDefPage = (mode === "members_defense" || mode === "members_incoming" || mode === "all_troops" || mode === "everything");
    var wantDefense = (mode === "members_defense" || mode === "all_troops" || mode === "everything");
    var wantIncoming = (mode === "members_incoming" || mode === "all_troops" || mode === "everything");
    var needBuildings = (mode === "members_buildings" || mode === "everything");

    // Read the member list (id + village count) from the overview table.
    var table = document.getElementsByClassName("vis");
    var nMembers = table[2].rows.length;
    var playerInfoList = [];
    for (var i = 1; i < nMembers - 1; i++) {
        var playerId = table[2].rows[i].innerHTML.split("[")[1].split("]")[0];
        var vaTxt = table[2].rows[i].innerHTML.split("<td class=\"lit-item\">")[4].split("</td>")[0];
        playerInfoList.push({ playerId: playerId, villageAmount: parseInt(vaTxt.replace(/[^\d]/g, "")) || 0 });
    }

    // Flat request queue: one entry per (player, gamePage, pageNumber). Pages beyond 1 only
    // for players with >1000 villages. Fetched sequentially with a throttle (be nice to TW).
    var tasks = [];
    playerInfoList.forEach(function (p) {
        var pages = Math.max(1, Math.ceil(p.villageAmount / 1000));
        for (var pg = 1; pg <= pages; pg++) {
            if (needTroops) tasks.push({ pid: p.playerId, gameMode: "members_troops", page: pg });
            if (needDefPage) tasks.push({ pid: p.playerId, gameMode: "members_defense", page: pg });
            if (needBuildings) tasks.push({ pid: p.playerId, gameMode: "members_buildings", page: pg });
        }
    });

    // Accumulators (structured rows, tagged with player).
    var acc = { troops: [], defense: [], incoming: [], buildings: [] };
    var buildingSlugs = [];

    Dialog.show("Progress bar", '<label> Reading...     </label><progress id="bar" max="1" value="0">  </progress>');

    var t = 0;
    (function loop() {
        var task = tasks[t];
        var playerName = players[task.pid];
        var text = fetchTribePage(task.gameMode, task.pid, task.page);
        var bar = document.getElementById("bar");
        if (bar) bar.value = t / tasks.length;

        function tag(rows) {
            rows.forEach(function (r) { r.player = playerName; r.playerId = task.pid; });
            return rows;
        }

        if (task.gameMode === "members_troops") {
            var pt = parseView(text, "troops", unitsList);
            tag(pt.rows).forEach(function (r) { if (passesFilters(r, filtres)) acc.troops.push(r); });
        } else if (task.gameMode === "members_defense") {
            if (wantDefense) {
                var pd = parseView(text, "defense", unitsList);
                tag(pd.rows).forEach(function (r) { if (passesFilters(r, filtres)) acc.defense.push(r); });
            }
            if (wantIncoming) {
                var pi = parseView(text, "incoming", unitsList);
                tag(pi.rows).forEach(function (r) { if (passesFilters(r, filtres)) acc.incoming.push(r); });
            }
        } else if (task.gameMode === "members_buildings") {
            var pb = parseView(text, "buildings", unitsList);
            if (pb.slugs.length) buildingSlugs = pb.slugs;
            tag(pb.rows).forEach(function (r) { if (passesFilters(r, filtres)) acc.buildings.push(r); });
        }

        t++;
        if (t < tasks.length) {
            setTimeout(loop, 200);
        } else {
            showData(mode, acc, unitsList, buildingSlugs);
        }
    })();
}

// Build the txt + json for the chosen mode and show the download UI.
function showData(mode, acc, unitsList, buildingSlugs) {
    var csv = "", json = "", base = "tribe_info", canTxt = true;

    if (mode === "members_troops") {
        base = "tribe_troops";
        csv = troopCsv([{ type: "troops", rows: acc.troops }], unitsList, { withIncoming: true });
        json = singleJson(mode, acc.troops, unitsList, "troops", true);
    } else if (mode === "members_defense") {
        base = "tribe_defense";
        csv = troopCsv([{ type: "defense", rows: acc.defense }], unitsList, {});
        json = singleJson(mode, acc.defense, unitsList, "in_village", false);
    } else if (mode === "members_incoming") {
        base = "tribe_incoming";
        csv = troopCsv([{ type: "incoming", rows: acc.incoming }], unitsList, {});
        json = singleJson(mode, acc.incoming, unitsList, "enroute", false);
    } else if (mode === "all_troops") {
        base = "tribe_all_troops";
        csv = troopCsv([
            { type: "troops", rows: acc.troops },
            { type: "defense", rows: acc.defense },
            { type: "incoming", rows: acc.incoming }
        ], unitsList, { typed: true, withIncoming: true });
        json = combinedJson(mode, { troops: acc.troops, defense: acc.defense, incoming: acc.incoming }, unitsList, buildingSlugs);
    } else if (mode === "members_buildings") {
        base = "tribe_buildings";
        csv = buildingsCsv(acc.buildings, buildingSlugs);
        json = singleJson(mode, acc.buildings, buildingSlugs, "buildings", false);
    } else if (mode === "everything") {
        base = "tribe_everything";
        canTxt = false; // JSON only — the full superset is far too wide for a sane CSV
        json = combinedJson(mode, { troops: acc.troops, defense: acc.defense, incoming: acc.incoming, buildings: acc.buildings }, unitsList, buildingSlugs);
    }

    window._tribeInfoTxt = csv;
    window._tribeInfoJson = json;
    var shown = canTxt ? csv : json;
    var buttons = "";
    if (canTxt) buttons += '<input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="download(\'' + base + '.txt\', window._tribeInfoTxt)" value="Download .txt"></input> ';
    buttons += '<input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="download(\'' + base + '.json\', window._tribeInfoJson)" value="Download .json"></input> ';
    buttons += '<input type="button" class="btn evt-confirm-btn btn-confirm-no" onclick="openUI()" value="Back to main menu"></input>';

    var html = '<head></head><body><p><h2>Tribe data</h2>Mode selected: ' + mode + (canTxt ? '' : ' (JSON only)') + '</p>'
        + '<p><textarea readonly=true rows="14" style="width:100%">' + shown.replace(/</g, "&lt;") + '</textarea></p>'
        + '<p>' + buttons + '</p></body>';
    Dialog.show("Tribe data", html);
}

// Export the pure parsers for the node test harness; harmless in the browser.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        cleanCell: cleanCell, extractPoints: extractPoints, extractVillageName: extractVillageName,
        detectBuildingSlugs: detectBuildingSlugs, tableRows: tableRows, parseView: parseView,
        passesFilters: passesFilters, troopCsv: troopCsv, buildingsCsv: buildingsCsv,
        singleJson: singleJson, combinedJson: combinedJson
    };
}

if (typeof game_data !== "undefined") openUI();

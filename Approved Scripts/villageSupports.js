// Village Supports Exporter by Vanquished
// Version 1.0, 2026-07-07
//
// Paste a list of village coordinates (XXX|YYY) and export every support
// stationed in those villages that your account can SEE — each supporting
// village with its origin player and the exact units it holds there — as a
// CSV .txt or JSON.
//
// Intended use: audit where the tribe's defense actually sits.
//
// Single-phase: each village's info_village page carries a "Defense" table
// (the withdraw-support form) listing the village's own troops plus one row
// per supporting village with origin links and per-unit counts. Parsing is
// anchored on element ids, classes and hrefs, so it is language-independent.
//
// This script can be run from any game screen.

function vsOpenUI() {
    var last = localStorage.vsCoordsInput || "";
    var includeOwn = localStorage.vsIncludeOwn != "0";
    var allTribe = localStorage.vsAllTribe == "1";
    var html = '<head></head><body><h1>Village Supports Exporter</h1>' +
        '<p><label><input type="checkbox" id="vs-all-tribe"' + (allTribe ? ' checked' : '') +
        ' onchange="document.getElementById(\'vs-coords\').disabled=this.checked;"></input> <b>Select All Tribe Villages</b></label> ' +
        '<span class="small grey">&mdash; ignore the box below and read every village owned by your tribe.</span></p>' +
        '<p>Paste village coordinates (one per line or any separator):</p>' +
        '<p><textarea id="vs-coords" rows="12" style="width: 100%;"' + (allTribe ? ' disabled' : '') + '>' + last.replace(/</g, "&lt;") + '</textarea></p>' +
        '<p><label><input type="checkbox" id="vs-own"' + (includeOwn ? ' checked' : '') + '></input> Include each village\'s own troops (the "from this village" row)</label></p>' +
        '<p class="small grey">This script parses up to 10 villages per second. Be mindful with the scope of your export.</p>' +
        '<p><input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="vsReadData()" value="Read supports"></input></p>' +
        '</body>';
    Dialog.show("Village supports", html);
}

function vsDownload(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function vsFetchPage(url) {
    var html = $.ajax({ url: url, async: false }).responseText;
    // Kept for parser debugging: inspect window.vsDebugHtml in the console.
    window.vsDebugHtml = html;
    return html;
}

// Coord "x|y" -> { id, name, playerId } from /map/village.txt, cached 1h per
// server (same pattern as incomingOrders' ioGetVillageDict). Names are
// URL-encoded with + for spaces in the world data files.
function vsGetVillageDict() {
    var now = new Date();
    var server = window.location.host;
    if (localStorage.vsVillageDict) {
        var parts = localStorage.vsVillageDict.split(":::");
        if (parts[0] == server && now - new Date(parts[1]) < 1000 * 60 * 60) {
            return JSON.parse(parts.slice(2).join(":::"));
        }
    }
    var dict = {};
    var lines = vsFetchPage("https://" + server + "/map/village.txt").split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] == "") continue;
        var row = lines[i].split(",");
        dict[row[2] + "|" + row[3]] = {
            id: row[0],
            name: decodeURIComponent(row[1].replace(/\+/g, " ")),
            playerId: row[4]
        };
    }
    localStorage.vsVillageDict = server + ":::" + now + ":::" + JSON.stringify(dict);
    return dict;
}

function vsGetPlayerDict() {
    var now = new Date();
    var server = window.location.host;
    if (localStorage.vsPlayerDict) {
        var parts = localStorage.vsPlayerDict.split(":::");
        if (parts[0] == server && now - new Date(parts[1]) < 1000 * 60 * 60) {
            return JSON.parse(parts.slice(2).join(":::"));
        }
    }
    var dict = {};
    var lines = vsFetchPage("https://" + server + "/map/player.txt").split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] == "") continue;
        var row = lines[i].split(",");
        dict[row[0]] = decodeURIComponent(row[1].replace(/\+/g, " "));
    }
    localStorage.vsPlayerDict = server + ":::" + now + ":::" + JSON.stringify(dict);
    return dict;
}

// Every coord "x|y" owned by a member of the current player's tribe, from
// world data alone: map/player.txt col 2 is each player's ally id, so members
// of game_data.player.ally give the owner id set, and the village dict maps
// each coord to its owner. No per-village fetches — instant and language-
// independent. Returns [] if this account has no tribe. Unlike overwatch's
// members_defense pages, this needs no defense sharing and covers every
// village, not just those a member opted to share.
function vsGetTribeCoords() {
    var allyId = String(game_data.player.ally || "");
    if (!allyId || allyId == "0") return [];
    var server = window.location.host;
    var members = {};
    var lines = vsFetchPage("https://" + server + "/map/player.txt").split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] == "") continue;
        var row = lines[i].split(",");
        if (row[2] == allyId) members[row[0]] = true;
    }
    var villages = vsGetVillageDict();
    var coords = [];
    for (var coord in villages) {
        if (members[villages[coord].playerId]) coords.push(coord);
    }
    return coords;
}

// Sitter mode needs t=<owner_id> like incomingOrders' ioSitterParam.
function vsSitterParam() {
    return (game_data.player.sitter > 0) ? "&t=" + game_data.player.id : "";
}

function vsVillageInfoUrl(villageId) {
    return "https://" + window.location.host + "/game.php?screen=info_village&id=" + villageId + vsSitterParam();
}

// CSV fields: names can contain commas, so flatten them out of text fields.
function vsCsvField(text) {
    return (text || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

// Units that can be stationed as support (militia never leaves home).
function vsUnitCols() {
    return game_data.units.filter(function (u) { return u != "militia"; });
}

// Units of one table row: td.unit-item cells carry data-unit-count and a
// unit-item-<unit> class (zeros are present but marked hidden).
function vsRowUnits(row) {
    var units = {};
    var tds = row.querySelectorAll("td.unit-item[data-unit-count]");
    for (var u = 0; u < tds.length; u++) {
        var cls = (tds[u].getAttribute("class") || "").match(/unit-item-(\w+)/);
        if (cls) units[cls[1]] = tds[u].getAttribute("data-unit-count");
    }
    return units;
}

// Parse the "Defense" table of an info_village page. Real structure (es100):
// form#withdraw_selected_units_village_info holds one table whose rows are
//   - a header row (th cells: origin + unit icons),
//   - the village's own troops ("from this village" — unit cells only),
//   - one tr.village_row_<id> per supporting village: td.village-anchor with
//     an info_village link "name (x|y) C54" + info_player link, then unit
//     cells that also carry data-village-id / data-away-id.
// The form only exists when the account can see the village's stationed
// troops (own/tribe visibility) — found:false otherwise. The fallback lookup
// via tr[class^=village_row_] guards against the form id changing; scoping to
// this table is what keeps embedded report/simulator unit cells out.
function vsParseSupports(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var out = { found: false, own: null, supports: [] };
    var form = doc.getElementById("withdraw_selected_units_village_info");
    var table = form ? form.querySelector("table") : null;
    if (!table) {
        var anyRow = doc.querySelector('tr[class^="village_row_"]');
        if (anyRow) table = anyRow.closest("table");
    }
    if (!table) return out;
    out.found = true;

    var rows = table.querySelectorAll("tr");
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.querySelector("th")) continue;
        var units = vsRowUnits(row);
        if (Object.keys(units).length === 0) continue;

        var anchorTd = row.querySelector("td.village-anchor");
        if (!anchorTd) {
            // First anchor-less unit row = the village's own troops; any
            // later one (e.g. a totals row) is ignored.
            if (!out.own) out.own = units;
            continue;
        }
        var sup = { villageId: "", awayId: "", coords: "", village: "", player: "", units: units };
        var vilLink = anchorTd.querySelector('a[href*="info_village"]');
        if (vilLink) {
            var text = vilLink.textContent.trim();
            // Take the LAST coord match: village names may contain digits,
            // the real coord sits in the "(x|y) C54" tail.
            var cs = text.match(/\d{1,3}\|\d{1,3}/g);
            if (cs) sup.coords = cs[cs.length - 1];
            sup.village = text.replace(/\s*\(\d{1,3}\|\d{1,3}\)\s*[CK]\d+\s*$/, "").trim();
        }
        var playerLink = anchorTd.querySelector('a[href*="info_player"]');
        if (playerLink) sup.player = playerLink.textContent.trim();
        var unitTd = row.querySelector("td.unit-item[data-village-id]");
        if (unitTd) {
            sup.villageId = unitTd.getAttribute("data-village-id") || "";
            sup.awayId = unitTd.getAttribute("data-away-id") || "";
        }
        out.supports.push(sup);
    }
    return out;
}

function vsReadData() {
    var input = document.getElementById("vs-coords").value;
    localStorage.vsCoordsInput = input;
    var ownBox = document.getElementById("vs-own");
    var includeOwn = ownBox ? ownBox.checked : true;
    localStorage.vsIncludeOwn = includeOwn ? "1" : "0";
    var allBox = document.getElementById("vs-all-tribe");
    var allTribe = allBox ? allBox.checked : false;
    localStorage.vsAllTribe = allTribe ? "1" : "0";

    var coords;
    if (allTribe) {
        coords = vsGetTribeCoords();
        if (coords.length === 0) {
            UI.ErrorMessage("No tribe villages found — is this account in a tribe? World data (map/player.txt) may also be a few hours behind.", 5000);
            return;
        }
        if (coords.length > 500 && !confirm(coords.length + " tribe villages will be read (~" + Math.ceil(coords.length / 10) + "s). Continue?")) {
            return;
        }
    } else {
        coords = input.match(/\d{1,3}\|\d{1,3}/g) || [];
        // Dedupe, keep input order.
        coords = coords.filter(function (c, i) { return coords.indexOf(c) === i; });
        if (coords.length === 0) {
            UI.ErrorMessage("No coordinates found — expected XXX|YYY, one per line.", 4000);
            return;
        }
    }

    var villages = vsGetVillageDict();
    var players = vsGetPlayerDict();

    var targetsOut = [];
    var i = 0;

    Dialog.show("Progress bar", '<label id="vs-label"> Reading villages...     </label><progress id="vs-bar" max="1" value="0"></progress>');

    function vsSetProgress(label, value) {
        var l = document.getElementById("vs-label");
        var b = document.getElementById("vs-bar");
        if (l) l.textContent = label;
        if (b) b.value = value;
    }

    (function villageLoop() {
        var coord = coords[i];
        vsSetProgress("Reading villages (" + (i + 1) + "/" + coords.length + ")", i / coords.length);

        var vil = villages[coord];
        var entry = { coord: coord, name: "", owner: "", status: "ok", own: null, supports: [] };
        if (!vil) {
            entry.status = "not_found";
        } else {
            entry.name = vil.name;
            entry.owner = players[vil.playerId] || (vil.playerId == "0" ? "Barbarian" : vil.playerId);
            try {
                var parsed = vsParseSupports(vsFetchPage(vsVillageInfoUrl(vil.id)));
                if (!parsed.found) {
                    entry.status = "not_visible";
                } else {
                    entry.own = includeOwn ? parsed.own : null;
                    entry.supports = parsed.supports;
                }
            } catch (e) {
                entry.status = "error: " + e.message;
            }
        }
        targetsOut.push(entry);

        i++;
        if (i < coords.length) {
            setTimeout(villageLoop, 100);
        } else {
            vsShowData(targetsOut);
        }
    })();
}

function vsBuildCsv(targetsOut, units) {
    var csv = "Target,TargetVillage,TargetOwner,Type,OriginCoords,OriginVillage,OriginPlayer," + units.join(",") + "\n";
    var emptyUnits = units.map(function () { return ""; }).join(",");
    function unitVals(u) {
        return units.map(function (k) { return u[k] != null ? u[k] : ""; }).join(",");
    }

    for (var t = 0; t < targetsOut.length; t++) {
        var tg = targetsOut[t];
        var base = tg.coord + "," + vsCsvField(tg.name) + "," + vsCsvField(tg.owner) + ",";
        if (tg.status != "ok") {
            csv += base + vsCsvField(tg.status) + ",,,," + emptyUnits + "\n";
            continue;
        }
        if (tg.own) {
            csv += base + "own," + tg.coord + "," + vsCsvField(tg.name) + "," + vsCsvField(tg.owner) + "," + unitVals(tg.own) + "\n";
        }
        for (var k = 0; k < tg.supports.length; k++) {
            var s = tg.supports[k];
            csv += base + "support," + s.coords + "," + vsCsvField(s.village) + "," + vsCsvField(s.player) + "," + unitVals(s.units) + "\n";
        }
        if (!tg.own && tg.supports.length === 0) {
            csv += base + "none,,,," + emptyUnits + "\n";
        }
    }
    return csv;
}

// JSON export in the same style as incomingOrders: exported_at unix
// timestamp, snake_case keys, numeric unit counts. Text fields are exact
// (no CSV comma-flattening).
function vsBuildJson(targetsOut, units) {
    function unitObj(u) {
        var o = {};
        units.forEach(function (k) { o[k] = parseInt(u[k], 10) || 0; });
        return o;
    }
    return JSON.stringify({
        exported_at: Math.floor(Date.now() / 1000),
        targets: targetsOut.map(function (tg) {
            return {
                coords: tg.coord,
                village: tg.name,
                player: tg.owner,
                status: tg.status,
                own_units: tg.own ? unitObj(tg.own) : null,
                supports: tg.supports.map(function (s) {
                    return {
                        village_id: s.villageId,
                        away_id: s.awayId,
                        origin_coords: s.coords,
                        origin_village: s.village,
                        origin_player: s.player,
                        units: unitObj(s.units)
                    };
                })
            };
        })
    }, null, 2);
}

function vsShowData(targetsOut) {
    var units = vsUnitCols();
    vsData = vsBuildCsv(targetsOut, units);
    vsJson = vsBuildJson(targetsOut, units);
    var nTargets = targetsOut.length;
    var withSupport = 0;
    var totalSupports = 0;
    var notVisible = 0;
    for (var t = 0; t < nTargets; t++) {
        if (targetsOut[t].supports.length > 0) {
            withSupport++;
            totalSupports += targetsOut[t].supports.length;
        }
        if (targetsOut[t].status == "not_visible") notVisible++;
    }

    var summary = nTargets + " villages — " + totalSupports + " supports stationed in " + withSupport +
        " of them, " + (nTargets - withSupport) + " with none visible." +
        (notVisible ? " " + notVisible + " villages show no troop table at all (no visibility)." : "");
    var warning = (totalSupports === 0)
        ? '<p><b>No supports were visible in any village.</b> Open one village\'s info in-game: if you can see its Defense table there but this export is empty, the parser needs adjusting — the last fetched page is kept in <code>window.vsDebugHtml</code>.</p>'
        : '';
    var html = '<head></head><body><p><h2>Village supports</h2>' + summary + '</p>' + warning +
        '<p><textarea readonly=true>' + vsData.replace(/</g, "&lt;") + '</textarea></p>' +
        '<p><input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="vsDownload(\'village_supports.txt\',vsData)" value="Download as csv"></input>' +
        '<input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="vsDownload(\'village_supports.json\',vsJson)" value="Download as json"></input>' +
        '<input type="button" class="btn evt-confirm-btn btn-confirm-no" onclick="vsOpenUI()" value="Back to main menu"></input></p></body>';
    Dialog.show("Village supports", html);
}


vsOpenUI();

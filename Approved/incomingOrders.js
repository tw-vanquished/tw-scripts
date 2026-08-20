// Target Village Orders Exporter by Vanquished
// Version 1.0, 2026-07-06
//
// Paste a list of target coordinates (XXX|YYY) and export every command your
// account can SEE heading to those villages — your own commands plus tribe
// mates' commands that are shared with the tribe — export as a CSV .txt or JSON.
//
// Intended use: export orders on planned attack/support targets.
//
// Two-phase:
// (1) each target's info_village page lists its visible command (label, type,
// countdown) but carries NO origin data; filter checkboxes decide which orders
// are exported AND which get a phase-2 detail fetch
// (2) each command's info_command page is fetched for origin player/village,
// arrival with // millisecond precision, and the travelling units. Parsing is
// anchored on hrefs and data-* attributes, so it is language-independent.
//
// This script can be run from any game screen.

function ioOpenUI() {
    var last = localStorage.ioCoordsInput || "";
    var f = ioLoadFilters();
    function cb(id, on, onchange) {
        return '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') +
            (onchange ? ' onchange="' + onchange + '"' : '') + '></input>';
    }
    var html = '<head></head><body><h1>Target Village Orders Exporter</h1>' +
        '<p>Paste target coordinates (one per line or any separator):</p>' +
        '<p><textarea id="io-coords" rows="12" style="width: 100%;">' + last.replace(/</g, "&lt;") + '</textarea></p>' +
        '<fieldset><legend>Filters</legend>' +
        '<p>Export attacks: ' +
        '<label title="Large attacks (+5000 units)">' + ioIconImg('attack_large.webp') + cb('io-f-large', f.large, 'ioSyncAllBox()') + '</label> ' +
        '<label title="Medium attacks (1000-5000 units)">' + ioIconImg('attack_medium.webp') + cb('io-f-medium', f.medium, 'ioSyncAllBox()') + '</label> ' +
        '<label title="Small attacks (1-1000 units)">' + ioIconImg('attack_small.webp') + cb('io-f-small', f.small, 'ioSyncAllBox()') + '</label> ' +
        '<label title="Attacks containing a noble">' + ioIconImg('snob.webp') + cb('io-f-snob', f.snob, 'ioSyncAllBox()') + '</label> ' +
        '&nbsp;<label title="All attacks (also covers icons without a size variant)">All attacks ' + cb('io-f-all', f.all, 'ioToggleAllAttacks(this.checked)') + '</label></p>' +
        '<p><label>' + ioIconImg('support.webp') + 'Export support ' + cb('io-f-support', f.support) + '</label> &nbsp; ' +
        '<label>' + ioIconImg('return.webp') + 'Export returning ' + cb('io-f-return', f.returning) + '</label></p>' +
        '</fieldset>' +
        '<p class="small grey">This script parses up to 10 commands per second. Be mindful with the scope of your export.</p>' +
        '<p><input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="ioReadData()" value="Read commands"></input></p>' +
        '</body>';
    Dialog.show("Incoming orders", html);
}

// Game icon for the filter labels; image_base is a global the game defines on
// every page (per-world CDN asset path). Fall back to text-only checkboxes.
function ioIconImg(file) {
    return (typeof image_base != "undefined")
        ? '<img src="' + image_base + 'command/' + file + '" style="vertical-align:middle;" alt="' + file + '" />'
        : '';
}

var IO_FILTER_DEFAULTS = { large: true, medium: true, small: true, snob: true, all: true, support: true, returning: false };

function ioLoadFilters() {
    var saved = {};
    try { saved = JSON.parse(localStorage.ioFilters) || {}; } catch (e) { }
    var out = {};
    for (var k in IO_FILTER_DEFAULTS) {
        out[k] = (typeof saved[k] == "boolean") ? saved[k] : IO_FILTER_DEFAULTS[k];
    }
    return out;
}

function ioReadFiltersFromDialog() {
    function on(id, dflt) {
        var e = document.getElementById(id);
        return e ? e.checked : dflt;
    }
    var f = {
        large: on('io-f-large', IO_FILTER_DEFAULTS.large),
        medium: on('io-f-medium', IO_FILTER_DEFAULTS.medium),
        small: on('io-f-small', IO_FILTER_DEFAULTS.small),
        snob: on('io-f-snob', IO_FILTER_DEFAULTS.snob),
        all: on('io-f-all', IO_FILTER_DEFAULTS.all),
        support: on('io-f-support', IO_FILTER_DEFAULTS.support),
        returning: on('io-f-return', IO_FILTER_DEFAULTS.returning)
    };
    localStorage.ioFilters = JSON.stringify(f);
    return f;
}

// "All" master checkbox: toggling it sets the four attack boxes; changing any
// individual box re-derives All so the UI never lies about what will run.
function ioToggleAllAttacks(state) {
    ['io-f-large', 'io-f-medium', 'io-f-small', 'io-f-snob'].forEach(function (id) {
        var e = document.getElementById(id);
        if (e) e.checked = state;
    });
}

function ioSyncAllBox() {
    var all = ['io-f-large', 'io-f-medium', 'io-f-small', 'io-f-snob'].every(function (id) {
        var e = document.getElementById(id);
        return e && e.checked;
    });
    var box = document.getElementById('io-f-all');
    if (box) box.checked = all;
}

// Attack size boxes and the snob box compose as OR: an attack is kept when its
// size is ticked OR it carries a noble and snob is ticked. "All" keeps every
// attack (including ones whose icon has no size variant). Support/returning
// are independent switches; cancel rows count as returning.
function ioCommandPassesFilter(cmd, f) {
    if (cmd.type == "support") return !!f.support;
    if (cmd.type == "return" || cmd.type == "cancel") return !!f.returning;
    if (f.all) return true;
    if (f.snob && cmd.snob) return true;
    if (cmd.size == "large") return !!f.large;
    if (cmd.size == "medium") return !!f.medium;
    if (cmd.size == "small") return !!f.small;
    return false;
}

function ioDownload(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function ioFetchPage(url) {
    var html = $.ajax({ url: url, async: false }).responseText;
    // Kept for parser debugging: inspect window.ioDebugHtml in the console.
    window.ioDebugHtml = html;
    return html;
}

// Coord "x|y" -> { id, name, playerId } from /map/village.txt, cached 1h per
// server (same pattern as tribeInfov2's getPlayerDict). Names are URL-encoded
// with + for spaces in the world data files.
function ioGetVillageDict() {
    var now = new Date();
    var server = window.location.host;
    if (localStorage.ioVillageDict) {
        var parts = localStorage.ioVillageDict.split(":::");
        if (parts[0] == server && now - new Date(parts[1]) < 1000 * 60 * 60) {
            return JSON.parse(parts.slice(2).join(":::"));
        }
    }
    var dict = {};
    var lines = ioFetchPage("https://" + server + "/map/village.txt").split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] == "") continue;
        var row = lines[i].split(",");
        dict[row[2] + "|" + row[3]] = {
            id: row[0],
            name: decodeURIComponent(row[1].replace(/\+/g, " ")),
            playerId: row[4]
        };
    }
    localStorage.ioVillageDict = server + ":::" + now + ":::" + JSON.stringify(dict);
    return dict;
}

function ioGetPlayerDict() {
    var now = new Date();
    var server = window.location.host;
    if (localStorage.ioPlayerDict) {
        var parts = localStorage.ioPlayerDict.split(":::");
        if (parts[0] == server && now - new Date(parts[1]) < 1000 * 60 * 60) {
            return JSON.parse(parts.slice(2).join(":::"));
        }
    }
    var dict = {};
    var lines = ioFetchPage("https://" + server + "/map/player.txt").split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] == "") continue;
        var row = lines[i].split(",");
        dict[row[0]] = decodeURIComponent(row[1].replace(/\+/g, " "));
    }
    localStorage.ioPlayerDict = server + ":::" + now + ":::" + JSON.stringify(dict);
    return dict;
}

// Sitter mode needs t=<owner_id> like tribeInfov2's fetchTribePage.
function ioSitterParam() {
    return (game_data.player.sitter > 0) ? "&t=" + game_data.player.id : "";
}

function ioVillageInfoUrl(villageId) {
    return "https://" + window.location.host + "/game.php?screen=info_village&id=" + villageId + ioSitterParam();
}

// CSV fields: names can contain commas, so flatten them out of text fields.
function ioCsvField(text) {
    return (text || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

// Units that can actually travel in a command (militia never leaves).
function ioUnitCols() {
    return game_data.units.filter(function (u) { return u != "militia"; });
}

// Phase 1: extract the visible command rows of an info_village page.
// Real structure (es100): #commands_outgoings table rows tr.command-row with
//   td0 = quickedit label + icon spans carrying data-command-type,
//   td1 = arrival "hoy a las 11:52:50:<span>343</span>" (ms via textContent),
//   td2 = countdown span.widget-command-timer.
// Origin is NOT in these rows — it comes from the info_command page (phase 2).
function ioParseCommands(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var records = [];
    var rows = doc.querySelectorAll("tr.command-row");
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var anchor = row.querySelector('a[href*="info_command"]');
        if (!anchor) continue;
        var idMatch = (anchor.getAttribute("href") || "").match(/[?&](?:amp;)?id=(\d+)/);
        var typeSpan = row.querySelector("[data-command-type]");
        var labelSpan = row.querySelector(".quickedit-label");
        var tds = row.getElementsByTagName("td");
        // Attack size and noble flag from the row's command icons
        // (command/attack_large|medium|small.webp, command/snob.webp — with a
        // return_ prefix on returning commands).
        var size = "";
        var snob = false;
        var imgs = row.getElementsByTagName("img");
        for (var m = 0; m < imgs.length; m++) {
            var src = imgs[m].getAttribute("src") || "";
            var am = src.match(/command\/(?:return_)?attack(?:_(small|medium|large))?\./);
            if (am && am[1]) size = am[1];
            if (/command\/(?:return_)?snob\./.test(src)) snob = true;
        }
        records.push({
            id: idMatch ? idMatch[1] : "",
            type: typeSpan ? typeSpan.getAttribute("data-command-type") : "other",
            label: (labelSpan ? labelSpan.textContent : anchor.textContent).trim(),
            size: size,
            snob: snob,
            arrival: tds.length > 1 ? tds[1].textContent.trim() : "",
            arrivesIn: tds.length > 2 ? tds[2].textContent.trim() : ""
        });
    }
    return records;
}

// Phase 2: parse one info_command page. The Origen/Destino table links origin
// player (first info_player link with an id) and origin village (first
// info_village link) — village anchor text is "name (x|y) C64". Arrival is the
// cell matching a full date + H:M:S(:ms); units are td.unit-item cells with
// data-unit-count and a unit-item-<unit> class.
function ioParseCommandDetail(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var detail = { originPlayer: "", originVillage: "", originCoords: "", arrival: "", units: {} };

    var playerLinks = doc.querySelectorAll('a[href*="info_player"]');
    for (var p = 0; p < playerLinks.length; p++) {
        if (/info_player.*id=\d+/.test(playerLinks[p].getAttribute("href") || "")) {
            detail.originPlayer = playerLinks[p].textContent.trim();
            break;
        }
    }

    var vilLink = doc.querySelector('.village_anchor a[href*="info_village"]') ||
        doc.querySelector('a[href*="info_village"]');
    if (vilLink) {
        var text = vilLink.textContent.trim();
        var c = text.match(/\d{1,3}\|\d{1,3}/);
        if (c) detail.originCoords = c[0];
        detail.originVillage = text.replace(/\s*\(\d{1,3}\|\d{1,3}\)\s*[CK]\d+\s*$/, "").trim();
    }

    var tds = doc.getElementsByTagName("td");
    for (var t = 0; t < tds.length; t++) {
        var txt = tds[t].textContent.trim();
        if (/^\d{2}\.\d{2}\.\d{2,4}\s+\d{1,2}:\d{2}:\d{2}(:\d{1,3})?$/.test(txt)) {
            detail.arrival = txt;
            break;
        }
    }

    var unitTds = doc.querySelectorAll("td.unit-item[data-unit-count]");
    for (var u = 0; u < unitTds.length; u++) {
        var cls = (unitTds[u].getAttribute("class") || "").match(/unit-item-(\w+)/);
        if (cls) detail.units[cls[1]] = unitTds[u].getAttribute("data-unit-count");
    }
    return detail;
}

function ioReadData() {
    var input = document.getElementById("io-coords").value;
    localStorage.ioCoordsInput = input;
    var coords = input.match(/\d{1,3}\|\d{1,3}/g) || [];
    // Dedupe, keep input order.
    coords = coords.filter(function (c, i) { return coords.indexOf(c) === i; });
    if (coords.length === 0) {
        UI.ErrorMessage("No coordinates found — expected XXX|YYY, one per line.", 4000);
        return;
    }

    // Read the filters while the input dialog is still up (the progress
    // dialog replaces it); this also persists them for the next run.
    var filters = ioReadFiltersFromDialog();

    var villages = ioGetVillageDict();
    var players = ioGetPlayerDict();

    // targetsOut keeps input order; each entry collects its commands, which
    // phase 2 enriches in place before the CSV is assembled. Commands the
    // filters reject are dropped here — before phase 2 — so they cost nothing.
    var targetsOut = [];
    var cmdJobs = [];
    var skipped = 0;
    var i = 0;

    Dialog.show("Progress bar", '<label id="io-label"> Reading villages...     </label><progress id="io-bar" max="1" value="0"></progress>');

    function ioSetProgress(label, value) {
        var l = document.getElementById("io-label");
        var b = document.getElementById("io-bar");
        if (l) l.textContent = label;
        if (b) b.value = value;
    }

    (function villageLoop() {
        var coord = coords[i];
        ioSetProgress("Reading villages (" + (i + 1) + "/" + coords.length + ")", i / coords.length);

        var vil = villages[coord];
        var entry = { coord: coord, name: "", owner: "", status: "ok", cmds: [] };
        if (!vil) {
            entry.status = "not_found";
        } else {
            entry.name = vil.name;
            entry.owner = players[vil.playerId] || (vil.playerId == "0" ? "Barbarian" : vil.playerId);
            try {
                var found = ioParseCommands(ioFetchPage(ioVillageInfoUrl(vil.id)));
                entry.cmds = found.filter(function (c) { return ioCommandPassesFilter(c, filters); });
                skipped += found.length - entry.cmds.length;
                for (var k = 0; k < entry.cmds.length; k++) {
                    cmdJobs.push(entry.cmds[k]);
                }
            } catch (e) {
                entry.status = "error: " + e.message;
            }
        }
        targetsOut.push(entry);

        i++;
        if (i < coords.length) {
            setTimeout(villageLoop, 100);
        } else if (cmdJobs.length > 0) {
            i = 0;
            setTimeout(commandLoop, 100);
        } else {
            ioShowData(targetsOut, skipped);
        }
    })();

    function commandLoop() {
        var cmd = cmdJobs[i];
        ioSetProgress("Reading commands (" + (i + 1) + "/" + cmdJobs.length + ")", i / cmdJobs.length);
        try {
            var url = "https://" + window.location.host + "/game.php?screen=info_command&id=" + cmd.id + "&type=other" + ioSitterParam();
            cmd.detail = ioParseCommandDetail(ioFetchPage(url));
        } catch (e) {
            cmd.detail = null;
        }
        i++;
        if (i < cmdJobs.length) {
            setTimeout(commandLoop, 100);
        } else {
            ioShowData(targetsOut, skipped);
        }
    }
}

function ioBuildCsv(targetsOut, units) {
    var csv = "Target,TargetVillage,TargetOwner,Type,Size,Command,OriginCoords,OriginVillage,OriginPlayer,Arrival,ArrivesIn," + units.join(",") + "\n";
    var emptyUnits = units.map(function () { return ""; }).join(",");

    for (var t = 0; t < targetsOut.length; t++) {
        var tg = targetsOut[t];
        var base = tg.coord + "," + ioCsvField(tg.name) + "," + ioCsvField(tg.owner) + ",";
        if (tg.status != "ok") {
            csv += base + ioCsvField(tg.status) + ",,,,,,,," + emptyUnits + "\n";
        } else if (tg.cmds.length === 0) {
            csv += base + "none,,,,,,,," + emptyUnits + "\n";
        } else {
            for (var k = 0; k < tg.cmds.length; k++) {
                var cmd = tg.cmds[k];
                var d = cmd.detail || { originPlayer: "", originVillage: "", originCoords: "", arrival: "", units: {} };
                var unitVals = units.map(function (u) { return d.units[u] != null ? d.units[u] : ""; }).join(",");
                csv += base + ioCsvField(cmd.type) + "," + (cmd.size || "") + "," + ioCsvField(cmd.label) + "," +
                    d.originCoords + "," + ioCsvField(d.originVillage) + "," + ioCsvField(d.originPlayer) + "," +
                    ioCsvField(d.arrival || cmd.arrival) + "," + ioCsvField(cmd.arrivesIn) + "," + unitVals + "\n";
            }
        }
    }
    return csv;
}

// JSON export in the same style as neilsTribeTroops.js: exported_at unix
// timestamp, snake_case keys, numeric unit counts. Nested one level (targets
// with their commands) since a command belongs to a target. Text fields are
// exact (no CSV comma-flattening).
function ioBuildJson(targetsOut, units) {
    return JSON.stringify({
        exported_at: Math.floor(Date.now() / 1000),
        targets: targetsOut.map(function (tg) {
            return {
                coords: tg.coord,
                village: tg.name,
                player: tg.owner,
                status: tg.status,
                commands: tg.cmds.map(function (cmd) {
                    var d = cmd.detail || { originPlayer: "", originVillage: "", originCoords: "", arrival: "", units: {} };
                    var unitObj = {};
                    units.forEach(function (u) { unitObj[u] = parseInt(d.units[u], 10) || 0; });
                    return {
                        id: cmd.id,
                        type: cmd.type,
                        size: cmd.size || "",
                        contains_snob: !!cmd.snob,
                        label: cmd.label,
                        origin_coords: d.originCoords,
                        origin_village: d.originVillage,
                        origin_player: d.originPlayer,
                        arrival: d.arrival || cmd.arrival,
                        arrives_in: cmd.arrivesIn,
                        units: unitObj
                    };
                })
            };
        })
    }, null, 2);
}

function ioShowData(targetsOut, skipped) {
    var units = ioUnitCols();
    ioData = ioBuildCsv(targetsOut, units);
    ioJson = ioBuildJson(targetsOut, units);
    var nTargets = targetsOut.length;
    var withCommands = 0;
    var totalCommands = 0;
    for (var t = 0; t < nTargets; t++) {
        if (targetsOut[t].cmds.length > 0) {
            withCommands++;
            totalCommands += targetsOut[t].cmds.length;
        }
    }

    var summary = nTargets + " targets — " + totalCommands + " visible commands on " + withCommands +
        " of them, " + (nTargets - withCommands) + " with none visible." +
        (skipped ? " " + skipped + " commands skipped by filters." : "");
    var warning = (totalCommands === 0)
        ? '<p><b>No commands were visible on any target.</b> Open one target\'s village info in-game: if you can see tribe attacks there but this export is empty, the parser needs adjusting — the last fetched page is kept in <code>window.ioDebugHtml</code>.</p>'
        : '';
    var html = '<head></head><body><p><h2>Incoming orders</h2>' + summary + '</p>' + warning +
        '<p><textarea readonly=true>' + ioData.replace(/</g, "&lt;") + '</textarea></p>' +
        '<p><input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="ioDownload(\'incoming_orders.txt\',ioData)" value="Download as csv"></input>' +
        '<input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="ioDownload(\'incoming_orders.json\',ioJson)" value="Download as json"></input>' +
        '<input type="button" class="btn evt-confirm-btn btn-confirm-no" onclick="ioOpenUI()" value="Back to main menu"></input></p></body>';
    Dialog.show("Incoming orders", html);
}


ioOpenUI();

// Target Village Orders Exporter by Vanquished
// Version 2.0, 2026-08-29
//
// Paste a list of target coordinates (XXX|YYY) and export every command your
// account can SEE heading to those villages — your own commands plus tribe
// mates' commands that are shared with the tribe — export as a CSV .txt or JSON.
//
// Intended use: export orders on planned attack/support targets.
//
// Two-phase:
// (1) each target's info_village page lists its visible commands (label, type,
// countdown) but carries NO origin data; filter checkboxes decide which orders
// are exported AND which get a phase-2 detail fetch
// (2) each command's hover-preview JSON (info_command&ajax=details — the ~1.5 KB
// the game itself loads when you mouse over a command icon; v1 fetched the full
// ~100 KB info_command page instead) gives the origin village ID, the arrival as
// a unix timestamp with milliseconds, and the travelling units. Origin name/coords/
// player are resolved through the cached world data (map/village.txt +
// map/player.txt), so nothing in phase 2 depends on the page language.
//
// Requests are paced like v1 (one start per 100 ms ≈ 10/s) but run asynchronously
// with at most IO_MAX_INFLIGHT overlapping, so slow responses never freeze the tab.
//
// Export format is compatible with v1 (same CSV columns, same JSON keys); the
// JSON additionally carries arrival_epoch_ms per command.
//
// This script can be run from any game screen.

var IO_RATE_MS = 100;       // one request start per 100 ms = 10/s
var IO_MAX_INFLIGHT = 4;    // requests allowed to overlap while keeping that rate

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
// are independent switches; cancel rows count as returning, and so do the
// game's "back"/"other_back" rows (support heading back home / being sent
// back — real es100 info_village pages carry both).
function ioCommandPassesFilter(cmd, f) {
    if (cmd.type == "support") return !!f.support;
    if (cmd.type == "return" || cmd.type == "cancel" || cmd.type == "back" || cmd.type == "other_back") return !!f.returning;
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

// Promise wrapper over the game's jQuery. JSON responses arrive already parsed
// (application/json); HTML/text pages arrive as strings.
function ioFetch(url) {
    return new Promise(function (resolve, reject) {
        $.get(url).done(resolve).fail(function (x) { reject(new Error("HTTP " + x.status)); });
    });
}

function ioSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Paced scheduler (same shape as apoyosEntrantes.js): start one request every
// IO_RATE_MS with at most IO_MAX_INFLIGHT overlapping. `work(job)` returns a
// promise; its resolved value (or null when it rejects) is handed to
// `onDone(job, value)`; `onProgress(done)` fires once per finished job.
async function ioRunPaced(jobs, work, onDone, onProgress) {
    var inflight = [], done = 0;
    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const p = Promise.resolve()
            .then(function () { return work(job); })
            .then(function (v) { return v; }, function () { return null; })
            .then(function (v) {
                onDone(job, v);
                done++;
                inflight.splice(inflight.indexOf(p), 1);
                if (onProgress) onProgress(done);
            });
        inflight.push(p);
        if (i < jobs.length - 1) {
            await ioSleep(IO_RATE_MS);
            while (inflight.length >= IO_MAX_INFLIGHT) await Promise.race(inflight);
        }
    }
    await Promise.all(inflight);
}

// Coord "x|y" -> { id, name, playerId } from /map/village.txt, cached 1h per
// server (same pattern as tribeInfov2's getPlayerDict). Names are URL-encoded
// with + for spaces in the world data files. The details JSON identifies the
// origin by village ID, so ioVillagesById() indexes the same dict by id.
async function ioGetVillageDict() {
    var now = new Date();
    var server = window.location.host;
    if (localStorage.ioVillageDict) {
        var parts = localStorage.ioVillageDict.split(":::");
        if (parts[0] == server && now - new Date(parts[1]) < 1000 * 60 * 60) {
            return JSON.parse(parts.slice(2).join(":::"));
        }
    }
    var dict = ioParseVillageTxt(await ioFetch("https://" + server + "/map/village.txt"));
    localStorage.ioVillageDict = server + ":::" + now + ":::" + JSON.stringify(dict);
    return dict;
}

function ioParseVillageTxt(text) {
    var dict = {};
    var lines = String(text).split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] == "") continue;
        var row = lines[i].split(",");
        dict[row[2] + "|" + row[3]] = {
            id: row[0],
            name: decodeURIComponent(row[1].replace(/\+/g, " ")),
            playerId: row[4]
        };
    }
    return dict;
}

function ioVillagesById(dict) {
    var byId = {};
    for (var coord in dict) {
        var v = dict[coord];
        byId[v.id] = { coord: coord, name: v.name, playerId: v.playerId };
    }
    return byId;
}

async function ioGetPlayerDict() {
    var now = new Date();
    var server = window.location.host;
    if (localStorage.ioPlayerDict) {
        var parts = localStorage.ioPlayerDict.split(":::");
        if (parts[0] == server && now - new Date(parts[1]) < 1000 * 60 * 60) {
            return JSON.parse(parts.slice(2).join(":::"));
        }
    }
    var dict = ioParsePlayerTxt(await ioFetch("https://" + server + "/map/player.txt"));
    localStorage.ioPlayerDict = server + ":::" + now + ":::" + JSON.stringify(dict);
    return dict;
}

function ioParsePlayerTxt(text) {
    var dict = {};
    var lines = String(text).split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] == "") continue;
        var row = lines[i].split(",");
        dict[row[0]] = decodeURIComponent(row[1].replace(/\+/g, " "));
    }
    return dict;
}

// Sitter mode needs t=<owner_id> like tribeInfov2's fetchTribePage.
function ioSitterParam() {
    return (game_data.player.sitter > 0) ? "&t=" + game_data.player.id : "";
}

function ioVillageInfoUrl(villageId) {
    return "https://" + window.location.host + "/game.php?screen=info_village&id=" + villageId + ioSitterParam();
}

// The command-icon hover preview URL (what the game fetches on mouseover).
function ioCommandDetailsUrl(commandId) {
    return "https://" + window.location.host + "/game.php?village=" + game_data.village.id +
        "&screen=info_command&ajax=details&id=" + commandId + ioSitterParam();
}

// CSV fields: names can contain commas, so flatten them out of text fields.
function ioCsvField(text) {
    return (text || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

// Units that can actually travel in a command (militia never leaves).
function ioUnitCols() {
    return game_data.units.filter(function (u) { return u != "militia"; });
}

// Server timezone offset (ms). The page header shows the server wall clock
// (#serverDate DD/MM/YYYY + #serverTime HH:MM:SS) while Timing.getCurrentServerTime()
// is the same instant as a unix timestamp; their difference, rounded to the
// nearest quarter hour to absorb latency, is the server's UTC offset. Without
// that header (not a game page) the browser's own offset is used.
function ioServerTzOffsetMs(doc, nowMs) {
    var dEl = doc.getElementById("serverDate");
    var tEl = doc.getElementById("serverTime");
    var dm = dEl && (dEl.textContent || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    var tm = tEl && (tEl.textContent || "").trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!dm || !tm) return -new Date().getTimezoneOffset() * 60000;
    var wall = Date.UTC(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3]);
    var quarter = 15 * 60 * 1000;
    return Math.round((wall - nowMs) / quarter) * quarter;
}

function ioNowMs() {
    return (typeof Timing != "undefined" && typeof Timing.getCurrentServerTime == "function")
        ? Timing.getCurrentServerTime() : Date.now();
}

// Unix ms -> "DD.MM.YY HH:MM:SS:mmm" in server wall-clock time — the same
// format the info_command page printed for v1 (and what the calculator's
// Manage tabs and twstats parse).
function ioFormatServerTime(epochMs, tzOffsetMs) {
    var d = new Date(epochMs + tzOffsetMs);
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    var ms = d.getUTCMilliseconds();
    return p2(d.getUTCDate()) + "." + p2(d.getUTCMonth() + 1) + "." + p2(d.getUTCFullYear() % 100) + " " +
        p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" + p2(d.getUTCSeconds()) + ":" +
        (ms < 100 ? (ms < 10 ? "00" : "0") : "") + ms;
}

// Phase 1: extract the visible command rows of an info_village page.
// Real structure (es100): tr.command-row rows inside the commands container
// (#commands_incomings on your own villages, #commands_outgoings on others') with
//   td0 = quickedit label + icon spans carrying data-command-type,
//   td1 = arrival "hoy a las 11:52:50:<span>343</span>" (ms via textContent),
//   td2 = countdown span.widget-command-timer.
// Origin is NOT in these rows — it comes from the details JSON (phase 2).
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

// Phase 2: one info_command&ajax=details response. Real es100 shape:
//   {"type":"support","village_start":{"id":"5079"},"village_target":{"id":"4913"},
//    "time_arrival":{"date":"1787881560","millis":"350"},
//    "units":{"spear":{"count":"1000","image_src":...},...},"start_comment":"","carrying_capacity":25000}
// Counts are strings; every world unit is present. A body without village_start
// (e.g. {"no_authorization":true}, a login page) -> null. A missing units map
// (troops not shared) -> empty units, exported as zeros like v1, hidden = true.
// Origin name/coords/player come from the world-data dicts by village id.
function ioParseCommandDetails(data, villagesById, players, tzOffsetMs) {
    if (typeof data === "string") {
        try { data = JSON.parse(data); } catch (e) { return null; }
    }
    if (!data || typeof data !== "object" || !data.village_start || data.village_start.id == null) return null;
    var detail = { originPlayer: "", originVillage: "", originCoords: "", arrival: "", arrivalEpochMs: null, units: {}, hidden: false };

    var origin = villagesById[String(data.village_start.id)];
    if (origin) {
        detail.originCoords = origin.coord;
        detail.originVillage = origin.name;
        detail.originPlayer = players[origin.playerId] || (origin.playerId == "0" ? "Barbarian" : String(origin.playerId));
    }

    var ta = data.time_arrival;
    if (ta && ta.date != null && /^\d+$/.test(String(ta.date))) {
        var ms = parseInt(ta.millis, 10) || 0;
        detail.arrivalEpochMs = parseInt(ta.date, 10) * 1000 + ms;
        detail.arrival = ioFormatServerTime(detail.arrivalEpochMs, tzOffsetMs);
    }

    if (data.units && typeof data.units === "object") {
        for (var u in data.units) {
            var v = data.units[u];
            var n = parseInt(v && typeof v === "object" ? v.count : v, 10);
            detail.units[u] = String(isNaN(n) ? 0 : n);
        }
    } else {
        detail.hidden = true;
    }
    return detail;
}

async function ioReadData() {
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
    var tzOffsetMs = ioServerTzOffsetMs(document, ioNowMs());

    Dialog.show("Progress bar", '<label id="io-label"> Loading world data...     </label><progress id="io-bar" max="1" value="0"></progress>');

    function ioSetProgress(label, value) {
        var l = document.getElementById("io-label");
        var b = document.getElementById("io-bar");
        if (l) l.textContent = label;
        if (b) b.value = value;
    }

    var villages, players;
    try {
        villages = await ioGetVillageDict();
        players = await ioGetPlayerDict();
    } catch (e) {
        UI.ErrorMessage("Could not load the world data (" + e.message + ").", 6000);
        ioOpenUI();
        return;
    }
    var villagesById = ioVillagesById(villages);

    // targetsOut keeps input order; each entry collects its commands, which
    // phase 2 enriches in place before the CSV is assembled. Commands the
    // filters reject are dropped here — before phase 2 — so they cost nothing.
    var targetsOut = coords.map(function (coord) {
        var vil = villages[coord];
        var entry = { coord: coord, name: "", owner: "", status: "ok", cmds: [], villageId: vil ? vil.id : null };
        if (!vil) {
            entry.status = "not_found";
        } else {
            entry.name = vil.name;
            entry.owner = players[vil.playerId] || (vil.playerId == "0" ? "Barbarian" : vil.playerId);
        }
        return entry;
    });
    var skipped = 0;
    var cmdJobs = [];

    var phase1 = targetsOut.filter(function (t) { return t.villageId; });
    await ioRunPaced(phase1,
        function (entry) {
            return ioFetch(ioVillageInfoUrl(entry.villageId)).then(function (html) {
                // Kept for parser debugging: inspect window.ioDebugHtml in the console.
                window.ioDebugHtml = html;
                return ioParseCommands(html);
            });
        },
        function (entry, found) {
            if (!found) { entry.status = "error: fetch failed"; return; }
            entry.cmds = found.filter(function (c) { return ioCommandPassesFilter(c, filters); });
            skipped += found.length - entry.cmds.length;
            for (var k = 0; k < entry.cmds.length; k++) cmdJobs.push(entry.cmds[k]);
        },
        function (done) { ioSetProgress("Reading villages (" + done + "/" + phase1.length + ")", done / phase1.length); });

    await ioRunPaced(cmdJobs,
        function (cmd) {
            return ioFetch(ioCommandDetailsUrl(cmd.id)).then(function (data) {
                var d = ioParseCommandDetails(data, villagesById, players, tzOffsetMs);
                // Kept for debugging: the last response that could not be fully used.
                if (!d || d.hidden || !d.originCoords) window.ioDebugJson = data;
                return d;
            });
        },
        function (cmd, detail) { cmd.detail = detail; },
        function (done) { ioSetProgress("Reading commands (" + done + "/" + cmdJobs.length + ")", done / cmdJobs.length); });

    ioShowData(targetsOut, skipped);
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
// exact (no CSV comma-flattening). Keys match v1; arrival_epoch_ms is new
// (null when the details fetch failed).
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
                    var d = cmd.detail || { originPlayer: "", originVillage: "", originCoords: "", arrival: "", arrivalEpochMs: null, units: {} };
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
                        arrival_epoch_ms: d.arrivalEpochMs == null ? null : d.arrivalEpochMs,
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
    var noDetail = 0;
    for (var t = 0; t < nTargets; t++) {
        var cmds = targetsOut[t].cmds;
        if (cmds.length > 0) {
            withCommands++;
            totalCommands += cmds.length;
            for (var k = 0; k < cmds.length; k++) if (!cmds[k].detail) noDetail++;
        }
    }

    var summary = nTargets + " targets — " + totalCommands + " visible commands on " + withCommands +
        " of them, " + (nTargets - withCommands) + " with none visible." +
        (skipped ? " " + skipped + " commands skipped by filters." : "") +
        (noDetail ? " " + noDetail + " commands returned no details (origin/units missing — see window.ioDebugJson)." : "");
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

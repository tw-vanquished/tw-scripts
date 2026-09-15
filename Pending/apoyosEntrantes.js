// Apoyos Entrantes (Incoming Supports Summary) — rework by Vanquished
// Version 2.0, 2026-08-28
// Original by plainte; earlier rework by oreg, numlock.
//
// Run on ANY village's info page (screen=info_village&id=…). The page lists
// every command you can see heading to that village: #commands_incomings
// ("Entrantes") on your own villages, #commands_outgoings ("Órdenes propias")
// on other players' villages — both .commands-container[data-type=
// "towards_village"]. For each INCOMING SUPPORT the script reads the command's hover preview
// (info_command&ajax=details — the ~1.5 KB JSON the game itself loads when
// you hover a command icon) for the travelling units, then:
//   - writes the units next to each command label in the table,
//   - prepends a summary table: one row per sending player, a Total row and
//     the farm population of everything on its way,
//   - offers the same table as forum BB-code.
//
// Sender: tribe-mates' commands carry the commandicon-ally class and the game
// labels them "Player: origin village"; your own commands carry no ally class
// and their label is the origin village (or your custom name) -> you.
// Units of a command never change while it travels, so results are cached per
// command id in localStorage: re-running after a refresh only fetches the
// commands it has not seen before.
//
// Manual quickbar script: one run = one pass, at most 10 requests per second.

var AE_VERSION = "2.0";
var AE_CACHE_KEY = "aeUnitsCache";
var AE_RATE_MS = 100;        // one request start per 100 ms = 10/s
var AE_MAX_INFLIGHT = 4;     // requests allowed to overlap while keeping that rate
var AE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
// Farm population per unit (all TW worlds share these values).
var AE_POP = { spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8, knight: 10, snob: 100 };

// Units that can travel in a command (militia never leaves the village).
function aeUnitCols(gameUnits) {
    return gameUnits.filter(function (u) { return u != "militia"; });
}

function aeZeroUnits(units) {
    var o = {};
    units.forEach(function (u) { o[u] = 0; });
    return o;
}

var AE_CONTAINER = '.commands-container[data-type="towards_village"]';

function aeContainer(doc) { return doc.querySelector(AE_CONTAINER); }

// Support rows of an info_village page. Real structure (es100 saves,
// tests/fixtures/info_village_commands.html + info_village_incomings.html): the
// container holds tr.command-row rows; td0 = span.quickedit(-out)[data-id] >
// a[href*=info_command] with span.command_hover_details[data-command-id]
// [data-command-type] (plus commandicon-ally for tribe-mates' commands) and
// span.quickedit-label; td2 = span[data-endtime] countdown. NO player link.
function aeParseCommands(doc, ownPlayer) {
    var out = [];
    var rows = doc.querySelectorAll(AE_CONTAINER + " tr.command-row");
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var icons = row.querySelectorAll("[data-command-type]");
        // Only pure support commands (attacks with a snob icon carry two spans).
        if (icons.length === 0) continue;
        var support = true;
        for (var k = 0; k < icons.length; k++) if (icons[k].getAttribute("data-command-type") !== "support") support = false;
        if (!support) continue;
        var icon = icons[0];
        var ally = /(^|\s)commandicon-ally(\s|$)/.test(icon.getAttribute("class") || "");
        var labelSpan = row.querySelector(".quickedit-label");
        var label = (labelSpan ? labelSpan.textContent : "").replace(/\s+/g, " ").trim();
        var timer = row.querySelector("[data-endtime]");
        var player = ownPlayer, origin = label;
        if (ally) {
            var c = label.indexOf(":");
            if (c > 0) { player = label.slice(0, c).trim(); origin = label.slice(c + 1).trim(); }
            else player = label;
        }
        out.push({
            id: icon.getAttribute("data-command-id"),
            ally: ally,
            player: player,
            origin: origin,
            label: label,
            endtime: timer ? parseInt(timer.getAttribute("data-endtime"), 10) || 0 : 0,
            row: row
        });
    }
    return out;
}

// info_command&ajax=details response -> { unit: count }. Real es100 shape
// (tests/fixtures/info_command_details.json): {"type":"support",
//  "village_start":{"id"},"village_target":{"id"},"time_arrival":{"date","millis"},
//  "units":{"spear":{"count":"1000","image_src":...},...},"carrying_capacity":N};
// counts are strings, every world unit is present. jQuery hands it over parsed
// (application/json) but a string is accepted too. Anything without a units
// map (e.g. {"no_authorization":true}) -> null.
function aeParseCommandDetails(data) {
    if (typeof data === "string") {
        try { data = JSON.parse(data); } catch (e) { return null; }
    }
    if (!data || typeof data.units !== "object" || data.units === null) return null;
    var units = {};
    for (var u in data.units) {
        var v = data.units[u];
        units[u] = parseInt(v && typeof v === "object" ? v.count : v, 10) || 0;
    }
    return units;
}

function aeFarmPop(units) {
    var pop = 0;
    for (var u in units) pop += (units[u] || 0) * (AE_POP[u] || 0);
    return pop;
}

// records: [{ player, units|null }] -> per-player totals sorted by population
// (desc), grand total, and the unit columns that are non-zero somewhere.
function aeAggregate(records, unitCols) {
    var byPlayer = {};
    var total = aeZeroUnits(unitCols);
    var unknown = 0;
    records.forEach(function (r) {
        if (!r.units) { unknown++; return; }
        var name = r.player || "?";
        if (!byPlayer[name]) byPlayer[name] = { player: name, units: aeZeroUnits(unitCols), commands: 0 };
        byPlayer[name].commands++;
        unitCols.forEach(function (u) {
            var n = r.units[u] || 0;
            byPlayer[name].units[u] += n;
            total[u] += n;
        });
    });
    var players = Object.keys(byPlayer).map(function (k) {
        var p = byPlayer[k];
        p.pop = aeFarmPop(p.units);
        return p;
    }).sort(function (a, b) { return b.pop - a.pop || a.player.localeCompare(b.player); });
    var cols = unitCols.filter(function (u) { return total[u] > 0; });
    return {
        players: players,
        total: total,
        pop: aeFarmPop(total),
        cols: cols.length ? cols : unitCols,
        commands: records.length - unknown,
        unknown: unknown
    };
}

function aeFmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

function aeEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Game unit icon; image_base is a per-world global on every page.
function aeUnitImg(unit) {
    return (typeof image_base != "undefined")
        ? '<img src="' + image_base + "unit/unit_" + unit + '.webp" title="' + unit + '" alt="' + unit + '" style="vertical-align:middle;" /> '
        : aeEsc(unit) + " ";
}

function aeUnitsInline(units, unitCols) {
    var html = "";
    unitCols.forEach(function (u) {
        if (units[u] > 0) html += aeUnitImg(u) + aeFmt(units[u]) + " ";
    });
    return html.trim();
}

function aeBuildTableHtml(summary) {
    var cols = summary.cols;
    var h = '<table class="vis" id="ae_table" style="margin:0 auto 8px auto;">';
    h += "<tr><th>Jugador</th><th>Órdenes</th>";
    cols.forEach(function (u) { h += "<th>" + aeUnitImg(u) + "</th>"; });
    h += "<th>Población</th></tr>";
    h += "<tr style='font-weight:bold;'><td>Total</td><td style='text-align:center;'>" + summary.commands + "</td>";
    cols.forEach(function (u) { h += "<td style='text-align:center;'>" + aeFmt(summary.total[u]) + "</td>"; });
    h += "<td style='text-align:center;'>" + aeFmt(summary.pop) + "</td></tr>";
    summary.players.forEach(function (p) {
        h += "<tr><td>" + aeEsc(p.player) + "</td><td style='text-align:center;'>" + p.commands + "</td>";
        cols.forEach(function (u) { h += "<td style='text-align:center;'>" + aeFmt(p.units[u]) + "</td>"; });
        h += "<td style='text-align:center;'>" + aeFmt(p.pop) + "</td></tr>";
    });
    h += "</table>";
    return h;
}

function aeBuildBB(summary) {
    var cols = summary.cols;
    var bb = "[table][**][b]Jugador[/b][||]Órdenes";
    cols.forEach(function (u) { bb += "[||][unit]" + u + "[/unit]"; });
    bb += "[||]Población[/**]";
    bb += "[**]Total[||]" + summary.commands;
    cols.forEach(function (u) { bb += "[||]" + summary.total[u]; });
    bb += "[||]" + summary.pop + "[/**]";
    summary.players.forEach(function (p) {
        bb += "[*][player]" + p.player + "[/player][|]" + p.commands;
        cols.forEach(function (u) { bb += "[|]" + p.units[u]; });
        bb += "[|]" + p.pop + "[/*]";
    });
    bb += "[/table]";
    return bb;
}

// ---- cache: { host, units: { commandId: { u: {unit: n}, t: lastSeenMs } } }.
// Entries not seen for AE_CACHE_TTL_MS are dropped on save, so visiting
// several villages keeps each one cached while landed commands age out.
function aeCacheLoad() {
    try {
        var c = JSON.parse(localStorage[AE_CACHE_KEY] || "null");
        if (c && c.host === window.location.host && c.units) return c.units;
    } catch (e) { }
    return {};
}

function aeCacheSave(units) {
    var now = Date.now(), keep = {};
    for (var id in units) if (now - (units[id].t || 0) < AE_CACHE_TTL_MS) keep[id] = units[id];
    try { localStorage[AE_CACHE_KEY] = JSON.stringify({ host: window.location.host, units: keep }); } catch (e) { }
}

// ---- page side
function aeSitterParam() {
    return (game_data.player.sitter > 0) ? "&t=" + game_data.player.id : "";
}

// The command-icon hover preview URL (what the game fetches on mouseover).
function aeCommandUrl(rec) {
    return "/game.php?village=" + game_data.village.id + "&screen=info_command&ajax=details&id=" + rec.id + aeSitterParam();
}

function aeFetch(url) {
    return new Promise(function (resolve, reject) {
        $.get(url).done(resolve).fail(function (x) { reject(new Error("HTTP " + x.status)); });
    });
}

function aeSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function aeStatusBox() {
    var box = document.getElementById("ae_summary");
    if (!box) {
        box = document.createElement("div");
        box.id = "ae_summary";
        var anchor = aeContainer(document);
        anchor.parentNode.insertBefore(box, anchor);
    }
    return box;
}

function aeSetStatus(text) {
    aeStatusBox().innerHTML = '<p class="small grey" style="text-align:center;">' + aeEsc(text) + "</p>";
}

function aeAnnotateRow(rec, unitCols) {
    var label = rec.row.querySelector(".quickedit-label");
    var cell = label ? label.closest("td") : rec.row.querySelector("td");
    if (!cell) return;
    var old = cell.querySelector(".ae-units");
    if (old) old.remove();
    var span = document.createElement("span");
    span.className = "ae-units small";
    span.style.marginLeft = "6px";
    span.innerHTML = rec.units ? aeUnitsInline(rec.units, unitCols) : "<i>sin datos</i>";
    cell.appendChild(span);
}

function aeRender(summary, shown, declared) {
    var box = aeStatusBox();
    var html = aeBuildTableHtml(summary);
    if (summary.unknown > 0) {
        html += '<p class="small warn" style="text-align:center;">' + summary.unknown + " órdenes sin datos (no se pudo leer la orden).</p>";
    }
    if (declared > shown) {
        html += '<p class="small warn" style="text-align:center;">La página solo muestra ' + shown + " de " + declared + " órdenes; el resto no se ha contado.</p>";
    }
    html += "<details style='margin:4px 0 8px 0;'><summary>Tabla para el foro</summary>" +
        '<textarea readonly style="width:100%;" rows="8" onclick="this.select()">' + aeEsc(aeBuildBB(summary)) + "</textarea></details>";
    box.innerHTML = html;
    box.scrollIntoView(false);
}

// Drop rows whose countdown has run out so the list stays honest between page
// reloads. Uses the row's own data-endtime against server time; one interval
// per page.
function aeStartCleanup() {
    if (window.aeCleanupTimer) clearInterval(window.aeCleanupTimer);
    window.aeCleanupTimer = setInterval(function () {
        var now = (typeof Timing != "undefined" && Timing.getCurrentServerTime) ? Timing.getCurrentServerTime() : Date.now();
        $(AE_CONTAINER + " tr.command-row [data-endtime]").each(function () {
            if (parseInt($(this).attr("data-endtime"), 10) * 1000 <= now) $(this).closest("tr").remove();
        });
    }, 5000);
}

// Start one request every AE_RATE_MS with at most AE_MAX_INFLIGHT overlapping,
// so slow responses don't stretch a 1000-command village to many minutes while
// the request rate itself never exceeds 10/s. Each rec gets rec.units set
// ({unit: n} or null on any failure).
async function aeFetchAll(recs, onProgress) {
    var inflight = [], done = 0;
    for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        const p = aeFetch(aeCommandUrl(rec))
            .then(function (data) { return aeParseCommandDetails(data); }, function () { return null; })
            .then(function (units) {
                rec.units = units;
                done++;
                inflight.splice(inflight.indexOf(p), 1);
                onProgress(done);
            });
        inflight.push(p);
        if (i < recs.length - 1) {
            await aeSleep(AE_RATE_MS);
            while (inflight.length >= AE_MAX_INFLIGHT) await Promise.race(inflight);
        }
    }
    await Promise.all(inflight);
}

async function aeRun() {
    var container = aeContainer(document);
    if (!container) {
        console.log("apoyosEntrantes: no " + AE_CONTAINER + " on this page (" + location.href + ")");
        UI.ErrorMessage("Apoyos Entrantes: ejecuta este script en la página de información de un pueblo (info_village).", 8000);
        return;
    }
    var unitCols = aeUnitCols(game_data.units);
    var recs = aeParseCommands(document, game_data.player.name);
    if (recs.length === 0) {
        console.log("apoyosEntrantes: " + container.querySelectorAll("tr.command-row").length + " command rows, none are supports");
        UI.InfoMessage("Apoyos Entrantes: no hay apoyos entrantes hacia este pueblo.", 8000);
        return;
    }
    var declared = parseInt(container.getAttribute("data-commands"), 10) || 0;
    var shown = container.querySelectorAll("tr.command-row").length;

    var cache = aeCacheLoad();
    var now = Date.now();
    var toFetch = recs.filter(function (r) {
        if (cache[r.id] && cache[r.id].u) { r.units = cache[r.id].u; cache[r.id].t = now; return false; }
        return true;
    });
    var cached = recs.length - toFetch.length;
    var suffix = cached ? " (" + cached + " en caché)" : "";
    if (toFetch.length) {
        aeSetStatus("Leyendo apoyos… 0/" + toFetch.length + suffix);
        await aeFetchAll(toFetch, function (done) {
            aeSetStatus("Leyendo apoyos… " + done + "/" + toFetch.length + suffix);
        });
        toFetch.forEach(function (r) { if (r.units) cache[r.id] = { u: r.units, t: now }; });
    }
    aeCacheSave(cache);
    recs.forEach(function (r) { aeAnnotateRow(r, unitCols); });
    aeRender(aeAggregate(recs, unitCols), shown, declared);
    aeStartCleanup();
}

aeRun();

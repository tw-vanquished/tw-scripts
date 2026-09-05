// Login Locations by Vanquished
// Version 1.0, 2026-09-05
//
// Run on Ajustes > Accesos (screen=settings&mode=logins). The page lists the
// last 20 logins with Fecha / Tipo de dispositivo / IP / Sustituto. The script
// finds the IP column, looks up every UNIQUE address once (IPv4 and IPv6; the
// game shows IPv6 as a /64 prefix like 2a02:xxxx:xxxx:xxxx::, which the
// providers resolve fine) and adds a "Ubicación (aprox.)" column next to the IP
// with city, region, country and ISP. Hover a cell for ASN, coordinates and the
// provider that answered.
//
// Providers (both HTTPS + CORS *, no key): ipwho.is first, ipinfo.io as
// fallback. Geo-IP is approximate — the two providers can place the same
// IPv6 prefix in different cities — so the column says so. Results are cached
// in localStorage (llGeoCache, 7 days): re-running only fetches new addresses.
// If the logins come from more than one place, the minority rows are marked
// in red so a foreign login stands out. The failed-logins table has no IP
// column and is left alone.
//
// Manual quickbar script: one run = one pass, one request every 250 ms.
// Language-independent: the IP column is found by its content, not its header.

var LL_VERSION = "1.0";
var LL_CACHE_KEY = "llGeoCache";
var LL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var LL_RATE_MS = 250;
var LL_HEADER = "Ubicación (aprox.)";

var LL_IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

// IPv4 dotted quad, or IPv6 made of 1-4 hex-digit groups with at most one "::"
// (so "2a02:9130:80a8:9fe6::" and "::1" count, "sept 05, 10:39" does not).
function llIsIp(s) {
    s = (s || "").trim();
    if (LL_IPV4.test(s)) return true;
    if (!/^[0-9a-f:]+$/i.test(s) || s.indexOf(":") < 0) return false;
    var halves = s.split("::");
    if (halves.length > 2) return false;
    var groups = 0;
    for (var i = 0; i < halves.length; i++) {
        if (halves[i] === "") continue;
        var gs = halves[i].split(":");
        for (var j = 0; j < gs.length; j++) if (!/^[0-9a-f]{1,4}$/i.test(gs[j])) return false;
        groups += gs.length;
    }
    return halves.length == 2 ? groups < 8 : groups == 8;
}

// Finds the logins table: the table.vis whose data rows all carry an IP in the
// same column. Returns { table, col, entries: [{ tr, ip }], ips: [unique, in
// page order] } or null. Header text is not used, so any language works.
function llParseLogins(doc) {
    var tables = doc.querySelectorAll("table.vis");
    for (var t = 0; t < tables.length; t++) {
        var trs = Array.prototype.filter.call(tables[t].querySelectorAll("tr"), function (tr) {
            return tr.querySelector("td");
        });
        if (!trs.length) continue;
        var ncol = trs[0].children.length;
        for (var c = 0; c < ncol; c++) {
            var entries = [], ips = [], ok = true;
            for (var r = 0; r < trs.length; r++) {
                var cell = trs[r].children[c];
                var ip = cell ? cell.textContent.trim() : "";
                if (!llIsIp(ip)) { ok = false; break; }
                entries.push({ tr: trs[r], ip: ip });
                if (ips.indexOf(ip) < 0) ips.push(ip);
            }
            if (ok) return { table: tables[t], col: c, entries: entries, ips: ips };
        }
    }
    return null;
}

// Normalised lookup result: { city, region, country, cc, isp, asn, lat, lon, provider }.
function llFromIpwho(j) {
    if (!j || j.success === false || !j.country_code) return null;
    var conn = j.connection || {};
    return {
        city: j.city || "", region: j.region || "", country: j.country || "", cc: j.country_code || "",
        isp: conn.isp || conn.org || "", asn: conn.asn ? "AS" + conn.asn : "",
        lat: j.latitude, lon: j.longitude, provider: "ipwho.is"
    };
}

function llFromIpinfo(j) {
    if (!j || j.bogon || j.error || !j.country) return null;
    var m = /^(AS\d+)\s*(.*)$/.exec(j.org || "");
    var loc = (j.loc || "").split(",");
    return {
        city: j.city || "", region: j.region || "", country: "", cc: j.country || "",
        isp: m ? m[2] : (j.org || ""), asn: m ? m[1] : "",
        lat: loc.length == 2 ? parseFloat(loc[0]) : undefined, lon: loc.length == 2 ? parseFloat(loc[1]) : undefined,
        provider: "ipinfo.io"
    };
}

var LL_PROVIDERS = [
    { name: "ipwho.is", url: function (ip) { return "https://ipwho.is/" + encodeURIComponent(ip); }, parse: llFromIpwho },
    { name: "ipinfo.io", url: function (ip) { return "https://ipinfo.io/" + encodeURIComponent(ip) + "/json"; }, parse: llFromIpinfo }
];

// Tries the providers in order; resolves to a normalised result or null.
function llLookup(ip) {
    var i = 0;
    function next() {
        if (i >= LL_PROVIDERS.length) return Promise.resolve(null);
        var p = LL_PROVIDERS[i++];
        return fetch(p.url(ip))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { return p.parse(j) || next(); })
            .catch(function () { return next(); });
    }
    return next();
}

// "Barcelona, Catalunya (ES)" — whatever parts the provider knew.
function llPlace(g) {
    var parts = [];
    if (g.city) parts.push(g.city);
    if (g.region && g.region != g.city) parts.push(g.region);
    var s = parts.join(", ");
    var cc = g.cc || g.country;
    if (cc) s += (s ? " (" : "(") + cc + ")";
    return s || "?";
}

function llEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function llCellHtml(g) {
    if (!g) return '<span class="ll-geo-fail" title="Ningún proveedor respondió (¿sin conexión o límite diario?)">?</span>';
    var tip = [];
    if (g.country) tip.push(g.country);
    if (g.isp) tip.push(g.isp + (g.asn ? " (" + g.asn + ")" : ""));
    if (typeof g.lat == "number" && typeof g.lon == "number") tip.push(g.lat.toFixed(3) + ", " + g.lon.toFixed(3));
    tip.push("Fuente: " + g.provider + " (aproximado)");
    return '<span title="' + llEsc(tip.join("\n")) + '">' + llEsc(llPlace(g)) +
        (g.isp ? ' <span style="color:#666;font-size:0.9em">· ' + llEsc(g.isp) + '</span>' : '') + '</span>';
}

// --- cache ------------------------------------------------------------------

function llCacheLoad() {
    var all = {};
    try { all = JSON.parse(localStorage.getItem(LL_CACHE_KEY) || "{}") || {}; } catch (e) { all = {}; }
    var now = Date.now(), live = {};
    for (var ip in all) if (all[ip] && all[ip].t && now - all[ip].t < LL_CACHE_TTL_MS && all[ip].geo) live[ip] = all[ip];
    return live;
}

function llCacheSave(cache) {
    try { localStorage.setItem(LL_CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* quota / private mode */ }
}

// --- DOM --------------------------------------------------------------------

// Removes a previous run's column and note (so re-running never doubles them).
function llRemoveColumn(doc) {
    var old = doc.querySelectorAll(".ll-geo, .ll-note");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
}

// Adds the header + one pending cell per row right after the IP column.
// Returns { ip: [td, ...] }.
function llAddColumn(parsed) {
    var doc = parsed.table.ownerDocument;
    var trs = parsed.table.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
        if (!trs[i].querySelector("td") && trs[i].children.length > parsed.col) {
            var th = doc.createElement("th");
            th.className = "ll-geo";
            th.textContent = LL_HEADER;
            trs[i].children[parsed.col].insertAdjacentElement("afterend", th);
        }
    }
    var cells = {};
    parsed.entries.forEach(function (e) {
        var td = doc.createElement("td");
        td.className = "ll-geo";
        td.setAttribute("data-ip", e.ip);
        td.innerHTML = '<span style="color:#888">…</span>';
        e.tr.children[parsed.col].insertAdjacentElement("afterend", td);
        (cells[e.ip] = cells[e.ip] || []).push(td);
    });
    return cells;
}

function llFill(cells, ip, geo) {
    (cells[ip] || []).forEach(function (td) { td.innerHTML = llCellHtml(geo); });
}

// When the logins come from more than one place, mark every row whose place
// is not the most frequent one (by row count) in red.
function llHighlightMinority(parsed, cells, results) {
    var count = {}, place = {};
    parsed.entries.forEach(function (e) {
        var g = results[e.ip];
        var key = g ? llPlace(g) : "?";
        place[e.ip] = key;
        count[key] = (count[key] || 0) + 1;
    });
    var keys = Object.keys(count);
    if (keys.length < 2) return 0;
    var top = keys.sort(function (a, b) { return count[b] - count[a]; })[0];
    var marked = 0;
    for (var ip in cells) {
        if (place[ip] == top) continue;
        cells[ip].forEach(function (td) { td.style.color = "#c00"; td.style.fontWeight = "bold"; marked++; });
    }
    return marked;
}

function llNote(parsed, results, fetched) {
    var places = {};
    parsed.ips.forEach(function (ip) { if (results[ip]) places[llPlace(results[ip])] = 1; });
    var p = parsed.table.ownerDocument.createElement("p");
    p.className = "ll-note";
    p.style.cssText = "font-size:0.9em;color:#666;margin:4px 0 10px";
    p.textContent = parsed.ips.length + " IP" + (parsed.ips.length == 1 ? "" : "s") + " única" + (parsed.ips.length == 1 ? "" : "s") +
        " · " + Object.keys(places).length + " ubicaci" + (Object.keys(places).length == 1 ? "ón" : "ones") +
        " · " + fetched + " consulta" + (fetched == 1 ? "" : "s") + ", resto en caché" +
        " · Geolocalización aproximada (ipwho.is / ipinfo.io). Login Locations v" + LL_VERSION;
    parsed.table.insertAdjacentElement("afterend", p);
}

// --- main -------------------------------------------------------------------

function llPageMode() {
    var href = (typeof location != "undefined" && location.href) || "";
    var s = /[?&]screen=([^&#]+)/.exec(href), m = /[?&]mode=([^&#]+)/.exec(href);
    return { screen: s ? s[1] : null, mode: m ? m[1] : null };
}

var llState = { done: null, fetched: 0, results: {} };

// Looks up the unique IPs (cache first, one request per LL_RATE_MS for the
// rest) and fills the column as answers arrive. Returns a promise that
// resolves with { ip: geo|null } when every cell is settled.
function llRun(parsed, cells) {
    var cache = llCacheLoad();
    var results = {}, pending = [];
    parsed.ips.forEach(function (ip) {
        if (cache[ip]) { results[ip] = cache[ip].geo; llFill(cells, ip, cache[ip].geo); }
        else pending.push(ip);
    });
    llState.fetched = pending.length;
    var chain = Promise.resolve();
    pending.forEach(function (ip, idx) {
        chain = chain.then(function () {
            return new Promise(function (res) { setTimeout(res, idx ? LL_RATE_MS : 0); });
        }).then(function () {
            return llLookup(ip).then(function (geo) {
                results[ip] = geo;
                llFill(cells, ip, geo);
                if (geo) { cache[ip] = { t: Date.now(), geo: geo }; llCacheSave(cache); }
            });
        });
    });
    return chain.then(function () {
        llState.results = results;
        llHighlightMinority(parsed, cells, results);
        llNote(parsed, results, llState.fetched);
        return results;
    });
}

function llMain() {
    var page = llPageMode();
    if (page.screen != "settings" || page.mode != "logins") {
        if (typeof game_data != "undefined" && game_data.link_base_pure) {
            UI.InfoMessage("Abriendo Ajustes &gt; Accesos… vuelve a ejecutar el script allí.", 4000);
            location.href = game_data.link_base_pure + "settings&mode=logins";
        } else {
            UI.ErrorMessage("Ejecuta este script en Ajustes &gt; Accesos (screen=settings&mode=logins).", 8000);
        }
        return null;
    }
    llRemoveColumn(document);
    var parsed = llParseLogins(document);
    if (!parsed) {
        UI.ErrorMessage("No se encontró ninguna tabla con una columna de IPs en esta página.", 8000);
        return null;
    }
    var cells = llAddColumn(parsed);
    llState.done = llRun(parsed, cells);
    return llState.done;
}

llMain();

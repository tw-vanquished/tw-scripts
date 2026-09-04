// Outgoing Commands per Player by Vanquished
// Version 1.4, 2026-09-04
//
// Run on the tribe troop overview (screen=ally&mode=members_troops). Reads
// the "active commands" column (the commands_outgoing icon) for every tribe
// member and shows a compact, sortable summary: player + command count.
// Click either header to sort; click again to flip the direction. The name
// links to the player's profile and the mail icon opens a new message to them.
// Drag the bottom-right corner of the dialog to resize it; the size is kept
// in localStorage (ocSize) for the next run.
//
// Parsing is anchored on the column icon and the info_player links, so it
// works on any language server. Nothing is fetched: it reads the page only.

// Returns [{ id, name, count }] from the members_troops table, or null if the
// page has no outgoing-commands column. id comes from the info_player link.
function ocParseTable(doc) {
    var icon = doc.querySelector('table.vis th img[src*="commands_outgoing"]');
    if (!icon) return null;
    var th = icon.closest("th");
    var col = Array.prototype.indexOf.call(th.parentNode.children, th);
    var rows = [];
    var trs = th.closest("table").querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
        var link = trs[i].querySelector('td a[href*="screen=info_player"]');
        if (!link) continue; // header and the "Resumen" total row
        var cell = trs[i].children[col];
        var n = cell ? parseInt(cell.textContent.replace(/[^\d]/g, ""), 10) : NaN;
        var idm = /[?&]id=(\d+)/.exec(link.getAttribute("href") || "");
        rows.push({ id: idm ? idm[1] : null, name: link.textContent.trim(), count: isNaN(n) ? 0 : n });
    }
    return rows;
}

// Sort by "name" (case-insensitive) or "count"; dir 1 = asc, -1 = desc.
function ocSort(rows, key, dir) {
    return rows.slice().sort(function (a, b) {
        var r = key == "count"
            ? a.count - b.count
            : a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        return r * dir;
    });
}

function ocEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Profile link + mail icon (new message to the player). Relative game.php
// URLs keep the current world; village= is optional on both screens.
// image_base is the per-world asset root the game defines on every page.
function ocPlayerCell(row) {
    if (!row.id) return ocEsc(row.name);
    var mailUrl = "/game.php?screen=mail&mode=new&player=" + row.id;
    var icon = (typeof image_base != "undefined")
        ? '<img src="' + image_base + 'mail.webp" alt="MP" style="vertical-align:middle">'
        : "MP";
    return '<a href="/game.php?screen=info_player&id=' + row.id + '">' + ocEsc(row.name) + '</a> ' +
        '<a href="' + mailUrl + '" title="Enviar mensaje" style="margin-left:4px">' + icon + '</a>';
}

function ocRenderTable(rows, key, dir) {
    var arrow = dir == 1 ? " &#9650;" : " &#9660;";
    var total = 0;
    var html = '<table class="vis" style="width:100%">' +
        '<tr><th style="cursor:pointer" onclick="ocSetSort(\'name\')">Jugador' + (key == "name" ? arrow : "") + '</th>' +
        '<th style="cursor:pointer;text-align:right" onclick="ocSetSort(\'count\')">&Oacute;rdenes' + (key == "count" ? arrow : "") + '</th></tr>';
    var sorted = ocSort(rows, key, dir);
    for (var i = 0; i < sorted.length; i++) {
        total += sorted[i].count;
        html += '<tr><td>' + ocPlayerCell(sorted[i]) + '</td><td style="text-align:right">' + sorted[i].count + '</td></tr>';
    }
    html += '<tr><th>Total (' + sorted.length + ')</th><th style="text-align:right">' + total + '</th></tr></table>';
    return html;
}

var ocState = window.ocState || { rows: null, key: "count", dir: -1, size: null };
window.ocState = ocState;

function ocSetSort(key) {
    if (ocState.key == key) ocState.dir = -ocState.dir;
    else { ocState.key = key; ocState.dir = key == "count" ? -1 : 1; }
    var box = document.getElementById("oc-table");
    if (box) box.innerHTML = ocRenderTable(ocState.rows, ocState.key, ocState.dir);
}

// game_data.mode is unreliable (often null even on the right page), so the
// page check reads screen/mode from the URL instead (same as tribeInfo.js).
function ocPageMode() {
    var p = new URLSearchParams(window.location.search);
    return { screen: p.get("screen"), mode: p.get("mode") };
}

function ocMain() {
    var page = ocPageMode();
    if (page.screen != "ally" || page.mode != "members_troops") {
        UI.ErrorMessage("Ejecuta este script en Tribu &gt; Miembros &gt; Tropas (screen=ally&mode=members_troops).", 8000);
        return;
    }
    var rows = ocParseTable(document);
    if (!rows) {
        UI.ErrorMessage("No se encontr&oacute; la columna de &oacute;rdenes activas en esta p&aacute;gina.", 8000);
        return;
    }
    ocState.rows = rows;
    Dialog.show("oc_summary",
        '<h3>&Oacute;rdenes salientes por jugador</h3>' +
        '<div id="oc-table">' + ocRenderTable(rows, ocState.key, ocState.dir) + '</div>');
    ocMakeResizable();
}

// Resizing. The game dialog is #popup_box_<id> (bordered, sized by the game)
// wrapping .popup_box_content (scrolls at 85vh). A CSS resize handle on the
// content box does not move the outer border and lets the content spill past
// it, so instead a small grip in the dialog's bottom-right corner drives the
// OUTER box's width/height directly, with the content box filling it 100%.
// No size is forced by default: the dialog opens fitted to the table as
// usual; only a manual resize is remembered (localStorage ocSize).
var OC_MIN_W = 200, OC_MIN_H = 120;

function ocDialogParts() {
    var box = document.getElementById("popup_box_oc_summary");
    var content = box ? box.querySelector(".popup_box_content") : null;
    return box && content ? { box: box, content: content } : null;
}

function ocMakeResizable() {
    var d = ocDialogParts();
    if (!d) { setTimeout(ocMakeResizable, 50); return; } // dialog still mounting
    var size = ocLoadSize();
    if (size) ocApplySize(d, size.w, size.h);
    var grip = document.createElement("div");
    grip.id = "oc-grip";
    grip.title = "Arrastra para cambiar el tamaño";
    grip.style.cssText = "position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;z-index:3;" +
        "background:linear-gradient(135deg,transparent 45%,#804000 45%,#804000 55%,transparent 55%," +
        "transparent 70%,#804000 70%,#804000 80%,transparent 80%)";
    d.box.appendChild(grip); // .popup_box is position:relative: inner corner of the border
    grip.addEventListener("mousedown", function (e) {
        e.preventDefault();
        var sx = e.clientX, sy = e.clientY;
        var w0 = ocState.size ? ocState.size.w : d.box.clientWidth;
        var h0 = ocState.size ? ocState.size.h : d.box.clientHeight;
        function move(ev) { ocApplySize(d, w0 + ev.clientX - sx, h0 + ev.clientY - sy); }
        function up() {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
            ocSaveSize();
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
    });
}

// Sets the outer box to w x h (content-box, so the 19px border-image sits
// outside) and makes the content box fill it and scroll internally.
function ocApplySize(d, w, h) {
    w = Math.round(Math.max(OC_MIN_W, Math.min(w, window.innerWidth * 0.95)));
    h = Math.round(Math.max(OC_MIN_H, Math.min(h, window.innerHeight * 0.9)));
    d.box.style.boxSizing = "content-box";
    d.box.style.width = w + "px";
    d.box.style.height = h + "px";
    d.content.style.boxSizing = "border-box";
    d.content.style.width = "100%";
    d.content.style.height = "100%";
    d.content.style.maxHeight = "none";
    d.content.style.overflow = "auto";
    ocState.size = { w: w, h: h };
}

// Persisted size or null (no manual resize yet / corrupt value).
function ocLoadSize() {
    try {
        var s = JSON.parse(localStorage.ocSize || "null");
        if (s && s.w >= OC_MIN_W && s.h >= OC_MIN_H) return { w: Math.round(s.w), h: Math.round(s.h) };
    } catch (e) { /* corrupt value: treat as unset */ }
    return null;
}

function ocSaveSize() {
    if (ocState.size) localStorage.ocSize = JSON.stringify(ocState.size);
}

ocMain();

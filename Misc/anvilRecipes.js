// Anvil Recipes (Yunque del Rey Mercenario) by Vanquished
// Version 1.3, 2026-10-08
//
// The crafting event's recipe book, including the recipes you have NOT
// discovered yet, with an "Elaborar" button on every row. Run it from the
// quickbar or a bookmark on any game page:
//
//   javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Misc/anvilRecipes.js")
//
// It fetches the recipe book page in the background
// (screen=event_crafting&mode=recipe_book) and opens a dialog listing all 84
// recipes like the in-game book (same order, 12 per page, Anterior /
// Siguiente): the three metals, the item and its effect. Undiscovered rows
// are highlighted; the "Solo sin descubrir" box filters them. The header
// shows your metals in stock. "Elaborar" is enabled when you hold the three
// metals; it asks for confirmation and then sends the same request the anvil
// sends when you place those metals on it (ajaxaction=craft, material[]).
// The stock and the row are updated on success. "Copiar lista" copies the
// listed recipes as text.
//
// How it works: the recipe book page embeds all 84 recipes (id + result item)
// in its CraftingEvent.init() call, but only the discovered ones carry a
// materials list. Recipe ids are consecutive and ordered by the number of rare
// metals in the combination (0, 1, 2, 3) and lexicographically inside each
// group, so the id alone tells which three metals a recipe needs. Which item a
// recipe gives differs per player, so the list is yours only. Material names
// and rarities come from the page, so it works on any world and language.
//
// v1.3 (2026-10-08): the game's styled tooltips on the metal and item icons
//      (class tooltip + UI.ToolTip, as the book does).
// v1.2 (2026-10-08): opens directly on all recipes, "Solo sin descubrir"
//      filter box, stock in the header, Elaborar button per row (craft
//      verified in-game on es103: an undiscovered recipe was crafted and
//      the book revealed it).
// v1.1: options window + book-like paginated list. v1.0: console snippet.

(function () {
    "use strict";

    if (typeof game_data == "undefined" || !game_data.link_base_pure) {
        alert("Ejecuta este script dentro del juego.");
        return;
    }
    var BOOK_URL = game_data.link_base_pure + "event_crafting&mode=recipe_book";
    var ICON_BASE = (typeof image_base != "undefined") ? image_base + "events/crafting/material_icon/" : "";
    var PAGE_SIZE = 12; // the in-game book shows 12 recipes per page

    // --- parsing ---------------------------------------------------------

    // JSON value (object or array) starting at txt[start], found by bracket matching.
    function arGrab(txt, start) {
        var depth = 0, inStr = false;
        for (var i = start; i < txt.length; i++) {
            var c = txt[i];
            if (inStr) {
                if (c === "\\") i++;
                else if (c === '"') inStr = false;
            } else if (c === '"') inStr = true;
            else if (c === "[" || c === "{") depth++;
            else if (c === "]" || c === "}") {
                if (--depth === 0) return JSON.parse(txt.slice(start, i + 1));
            }
        }
        return null;
    }

    // {mats, inventory, recipes} from the recipe book HTML, or null when the
    // page has no CraftingEvent.init with a recipe array (event not active).
    function arParse(html) {
        var ri = html.indexOf('[{"recipe_id"');
        if (ri < 0) return null;
        var init = html.lastIndexOf("CraftingEvent.init", ri);
        if (init < 0) return null;
        var mi = html.indexOf('{"1"', init);
        var mats = arGrab(html, mi);
        var inventory = arGrab(html, html.indexOf('{"1"', mi + 1));
        var recipes = arGrab(html, ri);
        if (!mats || !recipes) return null;
        return { mats: mats, inventory: inventory || {}, recipes: recipes };
    }

    // All 3-metal combinations in recipe-id order: by number of rare metals,
    // then lexicographic. combos[recipe_id - lowest id] = [a, b, c].
    function arCombos(mats) {
        var combos = [];
        for (var a = 1; a <= 7; a++) for (var b = a; b <= 7; b++) for (var c = b; c <= 7; c++) combos.push([a, b, c]);
        function rare(cmb) { var n = 0; cmb.forEach(function (x) { if (mats[x] && mats[x].rarity > 1) n++; }); return n; }
        combos.sort(function (p, q) { return rare(p) - rare(q) || p.join("") - q.join(""); });
        return combos;
    }

    function arCanCraft(combo, inventory) {
        var need = {};
        combo.forEach(function (x) { need[x] = (need[x] || 0) + 1; });
        return Object.keys(need).every(function (x) { return inventory[x] && inventory[x].amount >= need[x]; });
    }

    // --- rendering -------------------------------------------------------

    function arEsc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function arMatIcon(id, mats) {
        var label = mats[id] ? mats[id].label : id;
        return ICON_BASE
            ? '<img class="tooltip" src="' + ICON_BASE + id + '.webp" title="' + arEsc(label) + '" alt="' + arEsc(label) + '" style="width:24px;height:24px;vertical-align:middle">'
            : arEsc(label);
    }
    function arDescHtml(item) {
        return (item.descriptions || []).map(function (d) { return d.text; }).join("<br>");
    }
    function arDescText(item) {
        return (item.descriptions || []).map(function (d) {
            return d.text.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "");
        }).join(" / ");
    }

    function arStockHtml(mats, inventory) {
        return Object.keys(mats).map(function (id) {
            var n = inventory[id] ? inventory[id].amount : 0;
            return arMatIcon(id, mats) + " <b>" + n + "</b>";
        }).join(" &nbsp; ");
    }

    function arRowHtml(x, mats, inventory, idx) {
        var tds = x.combo.map(function (m) { return "<td>" + arMatIcon(m, mats) + "</td>"; }).join("");
        var can = arCanCraft(x.combo, inventory);
        var mark = x.known ? "" : ' <span title="Sin descubrir" style="color:#b00;font-weight:bold">?</span>';
        return "<tr" + (x.known ? "" : ' style="background:#fff3c4"') + ">" + tds +
            '<td style="text-align:center">=</td>' +
            '<td><img class="tooltip" src="' + arEsc(x.r.item.image) + '" alt="" title="' + arEsc("<p>" + x.r.item.name + "</p>" + (x.r.item.descriptions || []).map(function (d) { return "<p>" + d.text + "</p>"; }).join("")) + '" style="width:24px;height:24px;vertical-align:middle"></td>' +
            '<td style="white-space:nowrap"><b>' + arEsc(x.r.item.name) + "</b>" + mark + "</td>" +
            '<td style="font-size:11px;min-width:340px">' + arDescHtml(x.r.item) + "</td>" +
            '<td><a href="#" class="btn ar-craft' + (can ? "" : " btn-disabled") + '" data-idx="' + idx + '"' +
            (can ? "" : ' title="No tienes los materiales"') + ">Elaborar</a></td></tr>";
    }

    function arShow(data) {
        var mats = data.mats, inventory = data.inventory, combos = arCombos(mats);
        var minId = Math.min.apply(null, data.recipes.map(function (r) { return r.recipe_id; }));
        // Book order (the array order the page ships), each with its combo.
        var all = data.recipes.map(function (r) {
            return { r: r, combo: combos[r.recipe_id - minId], known: !!r.materials };
        });
        var onlyUnknown = false, page = 0, rows = all, pages = 1;

        function listText() {
            var unknownCount = all.filter(function (x) { return !x.known; }).length;
            return (onlyUnknown ? rows.length + " recetas sin descubrir" : rows.length + " recetas (" + unknownCount + " sin descubrir)") + ":\n" +
                rows.map(function (x) {
                    return x.combo.map(function (m) { return mats[m].label; }).join(" + ") + "  =>  " + x.r.item.name +
                        (x.known ? "" : "  [sin descubrir]") + "  (" + arDescText(x.r.item) + ")";
                }).join("\n");
        }

        var html = "<h3>Yunque del Rey Mercenario: libro de recetas</h3>" +
            '<p>Materiales: <span id="ar-stock">' + arStockHtml(mats, inventory) + "</span></p>" +
            '<p><span id="ar-summary"></span> ' +
            '<label style="margin-left:10px"><input type="checkbox" id="ar-only-unknown"> Solo sin descubrir</label> ' +
            '<a href="#" id="ar-copy" class="btn" style="margin-left:10px">Copiar lista</a></p>' +
            '<table class="vis" style="width:100%" id="ar-table">' +
            '<tr><th colspan="3">Materiales</th><th></th><th colspan="2">Objeto</th><th>Efecto</th><th></th></tr>' +
            '<tbody id="ar-body"></tbody></table>' +
            '<p style="text-align:center;margin-top:6px">' +
            '<a href="#" id="ar-prev" class="btn">&laquo; Anterior</a> ' +
            '<span id="ar-page" style="margin:0 12px"></span> ' +
            '<a href="#" id="ar-next" class="btn">Siguiente &raquo;</a></p>';

        Dialog.show("anvil_recipes", html);
        // The game fits the dialog to its content, which squeezes the effect
        // column into a tall sliver; size the OUTER box (see outgoingCommands)
        // and let the content box fill it.
        var box = $("#popup_box_anvil_recipes");
        box.css({ width: "960px", maxWidth: "96vw" });
        box.find(".popup_box_content").css({ width: "100%", boxSizing: "border-box" });

        function refilter() {
            rows = onlyUnknown ? all.filter(function (x) { return !x.known; }) : all;
            pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
            page = Math.min(page, pages - 1);
            draw();
        }
        function draw() {
            var unknownCount = all.filter(function (x) { return !x.known; }).length;
            $("#ar-summary").html(rows.length + " recetas" + (onlyUnknown ? "" : ", " + unknownCount + " sin descubrir (filas resaltadas)") + ".");
            var slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            $("#ar-body").html(slice.map(function (x, i) { return arRowHtml(x, mats, inventory, page * PAGE_SIZE + i); }).join(""));
            $("#ar-stock").html(arStockHtml(mats, inventory));
            $("#ar-page").text("Página " + (page + 1) + " / " + pages);
            $("#ar-prev").toggleClass("btn-disabled", page === 0);
            $("#ar-next").toggleClass("btn-disabled", page >= pages - 1);
            // The game's styled tooltip (what the book shows on hover) instead of the browser's title bubble.
            if (typeof UI != "undefined" && UI.ToolTip) UI.ToolTip($("#popup_box_anvil_recipes .tooltip"));
        }

        // The same request the anvil's form sends (ajaxaction=craft with three
        // material[] values); TribalWars.post adds the village and the CSRF token.
        function craft(x) {
            var payload = x.combo.map(function (m) { return { name: "material[]", value: m }; });
            TribalWars.post("event_crafting", { ajaxaction: "craft" }, payload, function (resp) {
                var item = resp && resp.item ? resp.item : x.r.item;
                UI.SuccessMessage("Elaborado: " + arEsc(item.name));
                x.combo.forEach(function (m) { if (inventory[m]) inventory[m].amount--; });
                if (!x.known) {
                    x.known = true;
                    x.r.materials = x.combo.map(function (m) { return mats[m]; });
                }
                if (resp && resp.event_pass && typeof EventPass != "undefined" && EventPass.updateWidgetUI) {
                    try { EventPass.updateWidgetUI(resp.event_pass); } catch (e) { /* widget not on this page */ }
                }
                refilter();
            }, function () {
                draw();
            });
        }

        refilter();
        $("#ar-only-unknown").on("change", function () { onlyUnknown = this.checked; page = 0; refilter(); });
        $("#ar-prev").on("click", function (e) { e.preventDefault(); if (page > 0) { page--; draw(); } });
        $("#ar-next").on("click", function (e) { e.preventDefault(); if (page < pages - 1) { page++; draw(); } });
        $("#ar-body").on("click", ".ar-craft", function (e) {
            e.preventDefault();
            if ($(this).hasClass("btn-disabled")) return;
            var x = rows[parseInt($(this).attr("data-idx"), 10)];
            if (!x) return;
            var what = x.combo.map(function (m) { return mats[m].label; }).join(" + ") + " &rarr; <b>" + arEsc(x.r.item.name) + "</b>";
            UI.ConfirmationBox("&iquest;Elaborar " + what + "?", [{ text: "Elaborar", confirm: true, callback: function () { craft(x); } }]);
        });
        $("#ar-copy").on("click", function (e) {
            e.preventDefault();
            var ta = $('<textarea style="position:fixed;left:-9999px">').val(listText()).appendTo("body");
            ta[0].select();
            try { document.execCommand("copy"); UI.SuccessMessage("Lista copiada al portapapeles."); }
            catch (err) { UI.ErrorMessage("No se pudo copiar."); }
            ta.remove();
        });
    }

    // --- main ------------------------------------------------------------

    $.get(BOOK_URL).done(function (html) {
        var data = arParse(html);
        if (!data) {
            UI.ErrorMessage("No se encontr&oacute; el libro de recetas: &iquest;est&aacute; activo el evento del yunque en este mundo?", 8000);
            return;
        }
        arShow(data);
    }).fail(function () {
        UI.ErrorMessage("No se pudo cargar el libro de recetas.", 8000);
    });
})();

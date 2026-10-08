// Anvil Recipes (Yunque del Rey Mercenario) by Vanquished
// Version 1.1, 2026-10-08
//
// Shows the recipes of the crafting event like the in-game recipe book does
// (same order, 12 per page, Anterior / Siguiente), but including the recipes
// you have NOT discovered yet: the three metals each one needs, the item it
// produces and the item's effect. Run it from the quickbar or a bookmark on
// any game page:
//
//   javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Misc/anvilRecipes.js")
//
// A first window asks what to list: all recipes, or only the undiscovered
// ones. "Mostrar" fetches the recipe book page in the background
// (screen=event_crafting&mode=recipe_book) and opens the paginated list.
// Undiscovered rows are highlighted; a check mark means you hold the metals to
// craft that recipe right now. "Copiar lista" copies the listed recipes as text.
//
// How it works: the recipe book page embeds all 84 recipes (id + result item)
// in its CraftingEvent.init() call, but only the discovered ones carry a
// materials list. Recipe ids are consecutive and ordered by the number of rare
// metals in the combination (0, 1, 2, 3) and lexicographically inside each
// group, so the id alone tells which three metals a recipe needs. Which item a
// recipe gives differs per player, so the list is yours only. Material names
// and rarities come from the page, so it works on any world and language.
// Nothing is crafted, bought or sent anywhere.
//
// v1.1 (2026-10-08): quickbar/bookmark version: options window, book-like
//      paginated list, "craftable now" mark; works from any page.
// v1.0: console snippet printing the undiscovered recipes.

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

    // Rows in the book's own order (the array order the page ships), each with
    // its combo and whether it is already discovered.
    function arRows(data) {
        var combos = arCombos(data.mats);
        var minId = Math.min.apply(null, data.recipes.map(function (r) { return r.recipe_id; }));
        return data.recipes.map(function (r) {
            return { r: r, combo: combos[r.recipe_id - minId], known: !!r.materials, craftable: arCanCraft(combos[r.recipe_id - minId], data.inventory) };
        });
    }

    // --- rendering -------------------------------------------------------

    function arEsc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function arMatIcon(id, mats) {
        var label = mats[id] ? mats[id].label : id;
        return ICON_BASE
            ? '<img src="' + ICON_BASE + id + '.webp" title="' + arEsc(label) + '" alt="' + arEsc(label) + '" style="width:24px;height:24px;vertical-align:middle">'
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

    function arRowHtml(x, mats) {
        var tds = x.combo.map(function (m) { return "<td>" + arMatIcon(m, mats) + "</td>"; }).join("");
        var mark = x.known ? "" : (x.craftable
            ? ' <span title="Sin descubrir: tienes los materiales" style="color:green;font-weight:bold">&#10004;</span>'
            : ' <span title="Sin descubrir" style="color:#b00;font-weight:bold">?</span>');
        return "<tr" + (x.known ? "" : ' style="background:#fff3c4"') + ">" + tds +
            '<td style="text-align:center">=</td>' +
            '<td><img src="' + arEsc(x.r.item.image) + '" alt="" style="width:24px;height:24px;vertical-align:middle"></td>' +
            "<td><b>" + arEsc(x.r.item.name) + "</b>" + mark + "</td>" +
            '<td style="font-size:11px">' + arDescHtml(x.r.item) + "</td></tr>";
    }

    function arShowList(data, onlyUnknown) {
        var mats = data.mats;
        var rows = arRows(data);
        var unknownCount = rows.filter(function (x) { return !x.known; }).length;
        if (onlyUnknown) rows = rows.filter(function (x) { return !x.known; });
        var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), page = 0;

        var text = (onlyUnknown ? rows.length + " recetas sin descubrir" : rows.length + " recetas (" + unknownCount + " sin descubrir)") + ":\n" +
            rows.map(function (x) {
                return x.combo.map(function (m) { return mats[m].label; }).join(" + ") + "  =>  " + x.r.item.name +
                    (x.known ? "" : "  [sin descubrir]") + "  (" + arDescText(x.r.item) + ")";
            }).join("\n");

        var html = "<h3>Yunque del Rey Mercenario: " + (onlyUnknown ? "recetas sin descubrir" : "todas las recetas") + "</h3>" +
            "<p>" + rows.length + " recetas" + (onlyUnknown ? "" : ", " + unknownCount + " sin descubrir (filas resaltadas)") + ". " +
            '<span style="color:green;font-weight:bold">&#10004;</span> = sin descubrir y tienes los materiales ahora mismo, ' +
            '<span style="color:#b00;font-weight:bold">?</span> = sin descubrir. ' +
            '<a href="#" id="ar-copy" class="btn">Copiar lista</a></p>' +
            '<table class="vis" style="width:100%" id="ar-table">' +
            '<tr><th colspan="3">Materiales</th><th></th><th colspan="2">Objeto</th><th>Efecto</th></tr>' +
            '<tbody id="ar-body"></tbody></table>' +
            '<p style="text-align:center;margin-top:6px">' +
            '<a href="#" id="ar-prev" class="btn">&laquo; Anterior</a> ' +
            '<span id="ar-page" style="margin:0 12px"></span> ' +
            '<a href="#" id="ar-next" class="btn">Siguiente &raquo;</a></p>';

        Dialog.show("anvil_recipes", html);

        function draw() {
            var slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            $("#ar-body").html(slice.map(function (x) { return arRowHtml(x, mats); }).join(""));
            $("#ar-page").text("Página " + (page + 1) + " / " + pages);
            $("#ar-prev").toggleClass("btn-disabled", page === 0);
            $("#ar-next").toggleClass("btn-disabled", page >= pages - 1);
        }
        draw();
        $("#ar-prev").on("click", function (e) { e.preventDefault(); if (page > 0) { page--; draw(); } });
        $("#ar-next").on("click", function (e) { e.preventDefault(); if (page < pages - 1) { page++; draw(); } });
        $("#ar-copy").on("click", function (e) {
            e.preventDefault();
            var ta = $('<textarea style="position:fixed;left:-9999px">').val(text).appendTo("body");
            ta[0].select();
            try { document.execCommand("copy"); UI.SuccessMessage("Lista copiada al portapapeles."); }
            catch (err) { UI.ErrorMessage("No se pudo copiar."); }
            ta.remove();
        });
    }

    // --- options window + main -----------------------------------------------

    function arLoad(onlyUnknown) {
        $.get(BOOK_URL).done(function (html) {
            var data = arParse(html);
            if (!data) {
                UI.ErrorMessage("No se encontr&oacute; el libro de recetas: &iquest;est&aacute; activo el evento del yunque en este mundo?", 8000);
                return;
            }
            arShowList(data, onlyUnknown);
        }).fail(function () {
            UI.ErrorMessage("No se pudo cargar el libro de recetas.", 8000);
        });
    }

    Dialog.show("anvil_recipes_options",
        "<h3>Yunque del Rey Mercenario: recetas</h3>" +
        '<p><label><input type="radio" name="ar-mode" value="all"> Mostrar todas las recetas</label><br>' +
        '<label><input type="radio" name="ar-mode" value="unknown" checked> Mostrar solo las recetas sin descubrir</label></p>' +
        '<p style="text-align:center"><a href="#" id="ar-run" class="btn">Mostrar</a></p>');
    $("#ar-run").on("click", function (e) {
        e.preventDefault();
        var onlyUnknown = $('input[name="ar-mode"]:checked').val() !== "all";
        Dialog.close();
        arLoad(onlyUnknown);
    });
})();

// Anvil Recipes (Yunque del Rey Mercenario) by Vanquished
// Version 1.0, 2026-10-08
//
// Console snippet, not a quickbar script. Open the crafting event, click the
// "Libro de recetas" tab (screen=event_crafting&mode=recipe_book), press F12,
// paste this into the Console and hit Enter. It prints every recipe you have
// NOT discovered yet, with the item it will produce and the item's effect.
//
// How: the recipe book page embeds all 84 recipes (id + result item) in its
// CraftingEvent.init() call, but only the discovered ones carry a materials
// list. Recipe ids are consecutive and ordered by the number of rare metals in
// the combination (0, 1, 2, 3) and lexicographically inside each group, so the
// id alone tells which three metals a recipe needs. Material names and
// rarities are read from the page, so it works on any world and language.
// Nothing is crafted, bought or sent anywhere.
//
// To print all 84 recipes instead of only the undiscovered ones, delete
// ".filter(r => !r.materials)" below.

(() => {
  const src = [...document.scripts].map(s => s.textContent).find(t => t.includes('[{"recipe_id"'));
  if (!src) return console.log('Open Libro de recetas (screen=event_crafting&mode=recipe_book) first');
  const grab = (txt, from) => { let d = 0; for (let i = from; ; i++) { if (txt[i] === '[' || txt[i] === '{') d++; else if (txt[i] === ']' || txt[i] === '}') { if (--d === 0) return JSON.parse(txt.slice(from, i + 1)); } } };
  const mats = grab(src, src.indexOf('{"1"')), recipes = grab(src, src.indexOf('[{"recipe_id"'));
  const combos = []; for (let a = 1; a <= 7; a++) for (let b = a; b <= 7; b++) for (let c = b; c <= 7; c++) combos.push([a, b, c]);
  const rare = c => c.filter(x => mats[x].rarity > 1).length;
  combos.sort((p, q) => rare(p) - rare(q) || p.join('') - q.join(''));
  const min = Math.min(...recipes.map(r => r.recipe_id));
  const rows = recipes.filter(r => !r.materials).sort((a, b) => a.recipe_id - b.recipe_id).map(r => combos[r.recipe_id - min].map(x => mats[x].label).join(' + ') + '  =>  ' + r.item.name + '  (' + r.item.descriptions.map(d => d.text.replace(/<[^>]+>/g, ' ')).join(' / ') + ')');
  console.log(rows.length + ' recetas sin descubrir:\n' + rows.join('\n'));
})();

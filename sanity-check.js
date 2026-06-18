// Common-sense sanity check for the recipe library.
//
//   node sanity-check.js
//
// Flags any parsed ingredient whose estimated macros are physically impossible
// — e.g. a wrong food-table match giving "340 g pasta -> 265 g protein". Run it
// after importing or after editing the food table in nutrition.js.

const { estimateBreakdown } = require("./nutrition.js");

const all = [...safeLoad("./recipes.store.json"), ...require("./recipes.js")];

// Physical limits per gram of a whole food:
//   - protein: nothing whole-food exceeds ~0.35 g/g; even lean meat raw ~0.23.
//     (Protein powders legitimately hit ~0.78, so we exempt them.)
//   - energy: pure fat is 8.84 kcal/g, so >9.2 kcal/g is impossible.
//   - macro mass: protein+carb+fat can't exceed the ingredient's own weight.
const PROTEIN_POWDER = /whey|casein|collagen|protein powder|protein isolate|protein shake/i;

let flags = 0;
for (const r of all) {
  const b = estimateBreakdown(r.ingredients, r.servings);
  for (const i of b.items) {
    if (i.kcal == null || !i.grams) continue;
    const issues = [];
    if (!PROTEIN_POWDER.test(i.name) && i.p / i.grams > 0.45) issues.push(`${((i.p / i.grams) * 100).toFixed(0)} g protein/100g`);
    if (i.kcal / i.grams > 9.2) issues.push(`${(i.kcal / i.grams).toFixed(1)} kcal/g`);
    if (i.p + i.c + i.f > i.grams * 1.05) issues.push(`macro mass ${(i.p + i.c + i.f).toFixed(0)}g > weight ${i.grams}g`);
    if (issues.length) {
      console.log(`⚠ ${r.title}\n    "${i.name}" -> ${i.grams}g, ${i.kcal}kcal, ${i.p}g P  [${issues.join("; ")}]`);
      flags++;
    }
  }
}

console.log(flags ? `\n${flags} impossible ingredient(s) — check the food table in nutrition.js` : "\n✓ All ingredients within physical limits.");
process.exit(flags ? 1 : 0);

function safeLoad(p) {
  try { return require(p); } catch { return []; }
}

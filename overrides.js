// ───────────────────────────────────────────────────────────────────────────
// PERSONAL INGREDIENT OVERRIDES
// ───────────────────────────────────────────────────────────────────────────
// The general food table (nutrition.js) uses standard/generic values. But the
// specific products YOU buy can differ a lot. List those here. Any recipe that
// uses one of these ingredients gets its FINAL macros adjusted by the difference
// between your product and the generic value (only the delta is applied, so the
// rest of the recipe's published numbers stay intact).
//
// To add one: copy a block, set `re` to match the ingredient text, and fill in
// `per100` with YOUR product's macros per 100 g. `note` is just a reminder.
//
//   per100: { kcal, p (protein g), c (carbs g), f (fat g) }   — all per 100 g
// ───────────────────────────────────────────────────────────────────────────

const OVERRIDES = [
  {
    name: "low-fat mayo",
    re: /mayonnaise|mayo\b|maionez/i,
    per100: { kcal: 250, p: 1, c: 9, f: 24 }, // vs generic ~680 kcal/100g
    note: "I use low-fat mayo (~250 kcal/100g), not regular (~680).",
  },
];

if (typeof module !== "undefined") module.exports = OVERRIDES;
if (typeof window !== "undefined") window.OVERRIDES = OVERRIDES;

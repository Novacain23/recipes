# Cut & Keep — Curated Recipe Browser + Online Parser

A local web app that **parses online recipes**, scores them against your
cut-while-keeping-muscle goals, and shows the ones that fit:

- ~500 kcal per portion (accepts 350–650)
- protein as close to 50g as possible (35g hard floor)
- filling (favors high protein + fiber)
- fast & easy (≤35 min active)
- bulk-friendly — cook once, eat 2–3 days
- **no beef** (not standardized/countable in Romania)

## Run it

```bash
node server.js
# open http://localhost:5173
```

No dependencies — Node 18+ built-ins only.

## How parsing works

Paste any recipe URL in the top bar → **Import**. The server:
1. Fetches the page.
2. Extracts its **schema.org/Recipe** structured data (the JSON-LD that
   almost every recipe site publishes) — name, image, yield, times,
   ingredients, instructions, and **published per-serving nutrition**.
3. Scores it against your filters (`parser.js → scoreRecipe`): near 500 kcal,
   ≥35g protein, no beef, fast, bulk-friendly. Returns a **fit score** and a
   plain-English verdict.
4. If it passes, it's saved to `recipes.store.json` and shown with an
   **imported** badge. Rejections show *why* (e.g. "contains beef", "720 kcal
   is outside range").

If a page has no structured nutrition, it's rejected — you can't count macros
on it, which is the whole point.

## Auto-finding recipes (no manual import)

`find-recipes.js` batch-imports real recipe URLs for you:

```bash
node find-recipes.js <url> <url> ...     # specific URLs
node find-recipes.js --file urls.txt     # a list, one URL per line
```

It fetches each page, parses it, scores + validates, and saves every passing
recipe to `recipes.store.json`. The app ships pre-populated with several real
recipes found this way (each with a photo + link to the original). Note: some
sites (Cloudflare-protected blogs, big publishers that block bots) return
403/402 to server-side fetches — those just get skipped.

## Features

- **Photo** of the dish (pulled from the recipe's structured data).
- **Link to the original recipe** on every imported card.
- **Portions + portion size in grams** shown on every card and in the detail
  view (batch grams ÷ servings; everything in grams).
- **Per-ingredient calorie & macro breakdown** (`nutrition.js`): each
  ingredient line is parsed (quantity + food) and looked up in a built-in
  food table using **raw** values (recipe weights are raw — raw chicken breast
  is ~110 kcal/100g, not the 165 of cooked). Gives estimated kcal/P/C/F per
  ingredient, batch total, and per portion (~15% mean error). A small amount of
  cooking oil is part of the food table and counted.
- **Macro validation**: the published per-serving macros are cross-checked
  against the ingredient estimate. The detail view shows ✓ (within 25%),
  ⚠ (mismatch — treat with caution), or ℹ (not enough matched ingredients).
  The headline macros always use the source's published figures.
- Live filters: max calories, min protein, max active time, protein source,
  bulk-friendly toggle, text search.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Local HTTP server: static UI + `/api/recipes`, `/api/import`, `/api/recipe` (delete) |
| `parser.js` | JSON-LD Recipe extraction + curation scoring |
| `nutrition.js` | Per-ingredient calorie/macro estimator (food table) |
| `recipes.js` | 12 hand-curated seed recipes (shipped defaults) |
| `recipes.store.json` | Imported recipes (created on first import) |
| `index.html` / `styles.css` / `app.js` | The UI |

Opening `index.html` directly (file://) still works for browsing the seed
recipes, but **importing needs the server running**.

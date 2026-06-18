// Recipe finder / batch importer.
//
//   node find-recipes.js <url> <url> ...        import specific URLs
//   node find-recipes.js --file urls.txt        import a newline-separated list
//   node find-recipes.js                         re-run the built-in candidate list
//
// Fetches each page, parses its schema.org Recipe data, scores it against the
// cutting filters, validates the published macros against an ingredient
// estimate, and saves every PASSING recipe to recipes.store.json (deduped).
// This is how the app gets populated without you importing by hand.

const fs = require("fs");
const path = require("path");
const { parseRecipeFromHtml, scoreRecipe } = require("./parser.js");
const { validateMacros, standardizationProblems } = require("./nutrition.js");

// Collects ingredients that blocked otherwise-good recipes, so they can be added
// to the food table in one pass. Printed at the end of a run.
const MISSING = new Map();

const STORE = path.join(__dirname, "recipes.store.json");

// Built-in candidates — real recipe pages that publish structured nutrition.
const CANDIDATES = [
  "https://www.allrecipes.com/recipe/223042/chicken-parmesan/",
];

async function fetchHtml(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE, "utf8")); } catch { return []; }
}

async function run(urls) {
  const store = loadStore();
  const have = new Set(store.map((r) => r.source));
  let added = 0, rejected = 0, failed = 0, held = 0;

  for (const url of urls) {
    if (have.has(url)) { console.log(`• skip (already have): ${url}`); continue; }
    try {
      const html = await fetchHtml(url);
      const recipe = parseRecipeFromHtml(html, url);
      if (recipe.error) { console.log(`✕ ${url}\n    ${recipe.error}`); failed++; continue; }

      const verdict = scoreRecipe(recipe);
      const val = validateMacros(recipe);
      const tag = `${recipe.title} — ${recipe.kcal}kcal/${recipe.protein}p, ${recipe.servings} servings`;

      if (!verdict.pass) {
        rejected++;
        console.log(`✕ reject ${tag}\n    ${verdict.reasons.join(" ")}`);
        continue;
      }

      // RULE: every stored recipe must be fully standardized (all ingredients
      // convert to grams + have a macro match). If not, hold it and record the
      // offending ingredients so the food table can be extended, then re-run.
      const probs = standardizationProblems(recipe);
      if (probs.length) {
        held++;
        console.log(`⏸ HOLD   ${tag}\n    not standardized: ${probs.map((p) => `"${p.line.trim()}" [${p.issue}]`).join(", ")}`);
        probs.forEach((p) => MISSING.set(p.line.trim().toLowerCase(), (MISSING.get(p.line.trim().toLowerCase()) || 0) + 1));
        continue;
      }

      store.unshift({ ...recipe, fitScore: verdict.fitScore, validation: val });
      have.add(url);
      added++;
      console.log(`✓ ADDED  ${tag}  [fit ${verdict.fitScore}%] ${recipe.image ? "📷" : "no-photo"}`);
      if (val.status === "mismatch") console.log(`    ⚠ macro check: ${val.note}`);
    } catch (e) {
      failed++;
      console.log(`✕ ${url}\n    fetch/parse failed: ${e.message}`);
    }
  }

  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  console.log(`\nDone. +${added} added, ${rejected} rejected, ${held} held (need foods), ${failed} failed. Store now has ${store.length} recipes.`);
  if (MISSING.size) {
    console.log(`\n── Ingredients to add to the food table (then re-run) ──`);
    [...MISSING.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n}x  ${k}`));
  }
}

// CLI
let urls = CANDIDATES;
const args = process.argv.slice(2);
if (args[0] === "--file") {
  urls = fs.readFileSync(args[1], "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
} else if (args.length) {
  urls = args;
}
run(urls);

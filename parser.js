// Online recipe parser + curation scorer.
//
// parseRecipeFromHtml(html, url):
//   Extracts schema.org/Recipe data from a page's JSON-LD (the structured
//   data the vast majority of recipe sites publish). Returns a normalized
//   recipe object with PER-PORTION macros, or { error } if no usable data.
//
// scoreRecipe(recipe, filters):
//   Judges a parsed recipe against the user's goals (kcal, protein, no beef,
//   bulk-friendly) and returns a verdict { pass, fitScore, reasons }.

// ---------- helpers ----------

// Decode HTML entities (&#39; &amp; &#8217; …) and drop ®/™ so ingredient text is clean.
function decodeEntities(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&(apos|#39);/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/[®™]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Pull a leading number out of strings like "350 kcal", "30 g", "4 servings".
function num(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const m = String(value).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// ISO-8601 duration (PT1H30M) -> minutes.
function isoToMinutes(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const total = h * 60 + min;
  return total || null;
}

// Recursively find the first object whose @type is (or includes) "Recipe".
function findRecipeNode(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const t = node["@type"];
  const types = Array.isArray(t) ? t : [t];
  if (types.some((x) => typeof x === "string" && x.toLowerCase() === "recipe")) return node;
  // dive into @graph or any nested object/array
  for (const key of Object.keys(node)) {
    if (key === "@type") continue;
    const found = findRecipeNode(node[key]);
    if (found) return found;
  }
  return null;
}

// Extract every JSON-LD block from raw HTML and search each for a Recipe node.
function extractJsonLdRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let raw = b[1].trim();
    // strip HTML comments sometimes wrapping JSON-LD
    raw = raw.replace(/^<!--/, "").replace(/-->$/, "").trim();
    try {
      const json = JSON.parse(raw);
      const recipe = findRecipeNode(json);
      if (recipe) return recipe;
    } catch {
      // some sites emit multiple concatenated JSON objects; try a lenient split
      try {
        const json = JSON.parse(`[${raw.replace(/}\s*{/g, "},{")}]`);
        const recipe = findRecipeNode(json);
        if (recipe) return recipe;
      } catch {
        /* skip malformed block */
      }
    }
  }
  return null;
}

// schema.org image can be a URL string, an array, or an ImageObject {url}.
function normalizeImage(image) {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    for (const i of image) {
      const u = normalizeImage(i);
      if (u) return u;
    }
    return null;
  }
  if (typeof image === "object") return image.url || image.contentUrl || null;
  return null;
}

function normalizeYield(recipeYield) {
  if (recipeYield == null) return null;
  if (Array.isArray(recipeYield)) {
    for (const y of recipeYield) {
      const n = num(y);
      if (n) return Math.round(n);
    }
    return null;
  }
  const n = num(recipeYield);
  return n ? Math.round(n) : null;
}

function normalizeIngredients(node) {
  const ing = node.recipeIngredient || node.ingredients || [];
  return (Array.isArray(ing) ? ing : [ing]).map((s) => String(s).trim()).filter(Boolean);
}

function flattenInstructions(ins, out = []) {
  if (!ins) return out;
  if (typeof ins === "string") {
    // sometimes a single blob with newlines
    ins.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean).forEach((s) => out.push(s));
    return out;
  }
  if (Array.isArray(ins)) {
    ins.forEach((i) => flattenInstructions(i, out));
    return out;
  }
  if (typeof ins === "object") {
    if (ins["@type"] === "HowToSection" && ins.itemListElement) {
      flattenInstructions(ins.itemListElement, out);
    } else if (ins.text) {
      out.push(String(ins.text).trim());
    } else if (ins.name) {
      out.push(String(ins.name).trim());
    }
  }
  return out;
}

function emojiFor(proteinType, name, ingredients) {
  const byType = { chicken: "🍗", turkey: "🦃", fish: "🐟", pork: "🥩", eggs: "🥚", plant: "🍲" };
  if (proteinType === "fish" && /shrimp|prawn|crab|scallop|creve/i.test(name)) return "🦐";
  if (byType[proteinType]) return byType[proteinType];
  const hay = (name + " " + ingredients.join(" ")).toLowerCase();
  if (/pasta|noodle|paste/.test(hay)) return "🍝";
  if (/salad|salat/.test(hay)) return "🥗";
  return "🍽️";
}

function detectProteinType(name, ingredients) {
  const types = [
    ["turkey", /turkey|curcan/],
    ["chicken", /chicken|pui/],
    ["fish", /salmon|tuna|fish|cod|trout|shrimp|prawn|crab|scallop|somon|peşte|peste|creve(ţ|t)/],
    ["pork", /pork|porc|ham|şuncă|sunca/],
    ["eggs", /egg|ou\b|omelet/],
    ["plant", /lentil|bean|chickpea|tofu|linte|fasole|năut/],
  ];
  // The title is the strongest signal — a "Ground Turkey" recipe shouldn't be
  // tagged chicken just because an ingredient list mentions chicken broth.
  const title = name.toLowerCase();
  for (const [type, re] of types) if (re.test(title)) return type;
  // fall back to ingredients, ignoring broth/stock mentions
  const ing = ingredients.join(" ").toLowerCase().replace(/(chicken|beef|vegetable)\s+(stock|broth|bouillon)/g, "");
  for (const [type, re] of types) if (re.test(ing)) return type;
  return "other";
}

// ---------- main parse ----------

function parseRecipeFromHtml(html, url = "") {
  const node = extractJsonLdRecipe(html);
  if (!node) {
    return { error: "No schema.org Recipe data found on this page. Macros can't be counted automatically." };
  }

  const nutrition = node.nutrition || {};
  const kcal = num(nutrition.calories);
  const protein = num(nutrition.proteinContent);
  const carbs = num(nutrition.carbohydrateContent);
  const fat = num(nutrition.fatContent);
  const fiber = num(nutrition.fiberContent);

  const ingredients = normalizeIngredients(node).map(decodeEntities);
  const steps = flattenInstructions(node.recipeInstructions).map(decodeEntities);
  const servings = normalizeYield(node.recipeYield) || 1;
  const name = decodeEntities((node.name || "Untitled recipe").toString().trim());

  const totalMinutes = isoToMinutes(node.totalTime);
  const activeMinutes = isoToMinutes(node.prepTime) ||
    (isoToMinutes(node.cookTime) ? Math.round(isoToMinutes(node.cookTime) * 0.6) : null) ||
    totalMinutes;

  const proteinType = detectProteinType(name, ingredients);
  return {
    id: "imp-" + Math.random().toString(36).slice(2, 9),
    title: name,
    emoji: emojiFor(proteinType, name, ingredients),
    image: normalizeImage(node.image),
    protein_type: proteinType,
    source: url,
    // schema.org nutrition is per serving -> already per portion
    kcal: kcal != null ? Math.round(kcal) : null,
    protein: protein != null ? Math.round(protein) : null,
    carbs: carbs != null ? Math.round(carbs) : null,
    fat: fat != null ? Math.round(fat) : null,
    fiber: fiber != null ? Math.round(fiber) : null,
    activeMinutes: activeMinutes || null,
    totalMinutes: totalMinutes || activeMinutes || null,
    servings,
    keepsDays: servings >= 4 ? 3 : servings >= 2 ? 2 : 1,
    tags: ["imported"],
    ingredients,
    steps,
    notes: "Imported & auto-parsed from the source. Verify macros against the original page.",
  };
}

// ---------- curation scoring ----------

const DEFAULT_FILTERS = {
  kcalTarget: 500,      // ideal, used for fit scoring
  kcalTolerance: 150,   // fit-score spread
  kcalMin: 300,         // hard floor
  kcalMax: 650,         // hard ceiling
  proteinMin: 30,       // hard floor
  proteinTarget: 50,    // ideal
  maxActiveMinutes: 35,
  requireNoBeef: true,
  bulkMinServings: 2,
};

// Only true beef terms — must not catch "minced garlic", "salmon steak", etc.
const BEEF_RE = /\b(beef|ground beef|minced beef|beef mince|brisket|veal|sirloin|ribeye|rib eye|t-bone|flank steak|skirt steak|chuck roast|bison|vit(ă|a)\b|carne de vit)/i;

// US-specific products that aren't reliably available in Romanian shops.
const HARD_TO_FIND = /alfredo sauce|ranch (dressing|seasoning|mix|packet)|cream of (mushroom|chicken|celery)|condensed (soup|cream)|(taco|fajita|ranch|sloppy joe) seasoning (mix|packet)|bisquick|cool whip|ro-?tel|velveeta|monterey jack|pepper jack|grits|cornbread|crescent roll|canned biscuit|graham cracker|jell-?o|half-and-half|pumpkin pie spice|old bay|hidden valley|frank'?s redhot|sloppy joe/i;

// Ingredients the user wants to avoid (pasta substitutes & cauliflower rice).
const AVOID_INGREDIENT = /chickpea pasta|lentil pasta|legume pasta|protein pasta|high-?protein pasta|banza|edamame pasta|cauliflower rice|riced cauliflower|cauliflower gnocchi/i;
// Cooking methods the user wants to avoid (slow cooker / crockpot).
const AVOID_METHOD = /slow[-\s]?cook|crock[-\s]?pot/i;

function scoreRecipe(recipe, filters = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const reasons = [];
  let pass = true;

  // Must have countable macros — core to the user's whole point.
  if (recipe.kcal == null || recipe.protein == null) {
    return { pass: false, fitScore: 0, reasons: ["No calorie/protein data published — can't count macros, so it's out."] };
  }

  // No beef (ingredients aren't standardized in RO).
  if (f.requireNoBeef) {
    const beefHit = recipe.ingredients.find((i) => BEEF_RE.test(i));
    if (beefHit) {
      pass = false;
      reasons.push(`Contains beef ("${beefHit.trim()}") — excluded.`);
    }
  }

  // No US-only products (can't buy them in Romania).
  const exoticHit = recipe.ingredients.find((i) => HARD_TO_FIND.test(i));
  if (exoticHit) {
    pass = false;
    reasons.push(`Needs a hard-to-find ingredient in RO ("${exoticHit.trim()}") — excluded.`);
  }

  // User-avoided ingredients (pasta substitutes, cauliflower rice).
  const avoidHit = recipe.ingredients.find((i) => AVOID_INGREDIENT.test(i));
  if (avoidHit) {
    pass = false;
    reasons.push(`Uses an avoided ingredient ("${avoidHit.trim()}") — excluded.`);
  }

  // User-avoided cooking method (slow cooker / crockpot).
  const methodText = `${recipe.title || ""} ${(recipe.steps || []).join(" ")}`;
  if (AVOID_METHOD.test(methodText)) {
    pass = false;
    reasons.push("Slow-cooker / crockpot recipe — excluded.");
  }

  // Calories within the accepted window.
  if (recipe.kcal < f.kcalMin || recipe.kcal > f.kcalMax) {
    pass = false;
    reasons.push(`${recipe.kcal} kcal/portion is outside the ${f.kcalMin}–${f.kcalMax} range.`);
  }

  // Protein floor.
  if (recipe.protein < f.proteinMin) {
    pass = false;
    reasons.push(`${recipe.protein}g protein is below the ${f.proteinMin}g minimum.`);
  }

  // Speed.
  if (recipe.activeMinutes != null && recipe.activeMinutes > f.maxActiveMinutes) {
    pass = false;
    reasons.push(`${recipe.activeMinutes} min active is slower than ${f.maxActiveMinutes} min.`);
  }

  // Bulk-friendly.
  if (recipe.servings < f.bulkMinServings) {
    reasons.push(`Only ${recipe.servings} serving(s) — not really a bulk-cook (kept, but flagged).`);
  }

  // Fit score: how close to the 500 kcal / 50g protein ideal (0–100).
  const kcalScore = Math.max(0, 100 - (Math.abs(recipe.kcal - f.kcalTarget) / f.kcalTolerance) * 100);
  const proteinScore = Math.max(0, 100 - (Math.abs(recipe.protein - f.proteinTarget) / f.proteinTarget) * 100);
  const fitScore = Math.round(kcalScore * 0.45 + proteinScore * 0.55);

  if (pass && !reasons.length) reasons.push("Fits all filters. ✅");
  return { pass, fitScore, reasons };
}

module.exports = { parseRecipeFromHtml, scoreRecipe, DEFAULT_FILTERS, extractJsonLdRecipe };

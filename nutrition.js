// Per-ingredient calorie & macro estimator.
//
// Recipe sites only publish TOTAL nutrition, never per-ingredient. To give a
// breakdown we parse each ingredient line (quantity + unit + food) and look the
// food up in a compact nutrition table (values per 100 g unless noted).
//
// This is an ESTIMATE — clearly labeled as such in the UI. When the parsed
// per-ingredient totals are available we also reconcile them against the
// recipe's official totals so the numbers stay honest.

// per 100 g: kcal, protein, carbs, fat.
// IMPORTANT: recipe ingredient lines give RAW weights, so these are RAW values
// (raw meat is less calorie-dense than cooked — calories are conserved through
// cooking, only water is lost, so raw-weight x raw-density ~= cooked total).
const FOODS = [
  { re: /chicken breast|piept de pui|chicken fillet/i, per100: { kcal: 120, p: 23, c: 0, f: 2.6 } }, // raw skinless (standardized)
  { re: /chicken thigh|pulpe de pui/i, per100: { kcal: 120, p: 20, c: 0, f: 4.1 } }, // raw skinless
  { re: /chicken|pui/i, per100: { kcal: 135, p: 21, c: 0, f: 5 } }, // raw, mixed
  { re: /ground turkey|turkey mince|carne tocat(ă|a) de curcan/i, per100: { kcal: 150, p: 19, c: 0, f: 8.3 } }, // raw 93/7
  { re: /turkey|curcan/i, per100: { kcal: 115, p: 24, c: 0, f: 1.5 } }, // raw breast
  { re: /pork tenderloin|mu(ş|s)chiule(ţ|t)|pork loin/i, per100: { kcal: 120, p: 21, c: 0, f: 3.5 } }, // raw lean
  { re: /pork|porc/i, per100: { kcal: 210, p: 19, c: 0, f: 14 } }, // raw
  { re: /ham|(ş|s)unc(ă|a)/i, per100: { kcal: 120, p: 18, c: 1.5, f: 5 } }, // lean turkey ham
  { re: /salmon|somon/i, per100: { kcal: 208, p: 20, c: 0, f: 13 } }, // raw (standardized USDA)
  { re: /tuna|\bton\b/i, per100: { kcal: 116, p: 26, c: 0, f: 1 } }, // canned in water, drained (\bton\b: avoid "bosTON")
  { re: /shrimp|prawn|creve(ţ|t)/i, per100: { kcal: 99, p: 24, c: 0.2, f: 0.3 } }, // raw
  { re: /\bfish|cod|trout|mahi|tilapia|halibut|haddock|sea bass|pollock|p(e| e)(ş|s)te/i, per100: { kcal: 100, p: 21, c: 0, f: 1.5 } }, // raw lean
  { re: /chorizo|sausage|c(â|a)rna(ţ|t)|salam|kielbasa/i, per100: { kcal: 300, p: 18, c: 2, f: 25 } },
  { re: /tahini/i, per100: { kcal: 595, p: 17, c: 21, f: 54 } },
  { re: /shredded coconut|desiccated coconut|coconut flakes|fulgi de cocos/i, per100: { kcal: 660, p: 7, c: 24, f: 65 } },
  { re: /mirin/i, per100: { kcal: 230, p: 0.3, c: 55, f: 0 } },
  { re: /vinaigrette|dressing|sos pentru salat/i, per100: { kcal: 250, p: 1, c: 8, f: 24 } },
  { re: /\btofu/i, per100: { kcal: 144, p: 17, c: 3, f: 9 } }, // firm
  { re: /edamame/i, per100: { kcal: 121, p: 12, c: 9, f: 5 } },
  { re: /halloumi/i, per100: { kcal: 321, p: 22, c: 2, f: 25 } },
  { re: /egg white|albu(ş|s)/i, per100: { kcal: 52, p: 11, c: 0.7, f: 0.2 } },
  { re: /egg|ou(ă|a)?\b/i, per100: { kcal: 143, p: 13, c: 1.1, f: 9.5 } },
  { re: /cottage cheese|br(â|a)nz(ă|a) de vaci/i, per100: { kcal: 98, p: 11, c: 3.4, f: 4.3 } },
  { re: /greek yogurt|iaurt grec/i, per100: { kcal: 59, p: 10, c: 3.6, f: 0.4 } },
  { re: /yogurt|iaurt/i, per100: { kcal: 61, p: 3.5, c: 4.7, f: 3.3 } },
  { re: /feta/i, per100: { kcal: 264, p: 14, c: 4, f: 21 } },
  { re: /cream cheese|cremă de br(â|a)nz|light cream/i, per100: { kcal: 200, p: 7, c: 6, f: 17 } }, // light
  { re: /parmesan|parmigiano|pecorino/i, per100: { kcal: 431, p: 38, c: 4, f: 29 } },
  { re: /mozzarella/i, per100: { kcal: 160, p: 24, c: 3, f: 6 } }, // your low-cal mozzarella
  { re: /cheddar|ca(ş|s)caval|shredded cheese|grated cheese|mexican cheese/i, per100: { kcal: 350, p: 25, c: 2, f: 27 } }, // standardized
  { re: /cheese|br(â|a)nz(ă|a)/i, per100: { kcal: 350, p: 23, c: 2, f: 28 } }, // generic (mexican blend etc.) — after the specific cheeses
  { re: /alfredo|cream sauce|sos alfredo/i, per100: { kcal: 180, p: 2, c: 4, f: 17 } }, // jarred
  { re: /whey|protein powder|protein isolate|protein shake|casein|\bwpc\b|\bwpi\b/i, per100: { kcal: 375, p: 78, c: 8, f: 5 } },
  { re: /\boats|ov(ă|a)z/i, per100: { kcal: 379, p: 13, c: 67, f: 7 } },
  { re: /breadcrumb|bread crumbs|panko|pesmet/i, per100: { kcal: 350, p: 12, c: 70, f: 4 } },
  { re: /naan|pita|tortilla|flatbread|wrap\b/i, per100: { kcal: 280, p: 8, c: 50, f: 5 } },
  { re: /\bbread\b|p(â|a)ine|\btoast\b|bun\b|roll\b/i, per100: { kcal: 265, p: 9, c: 49, f: 3.2 } }, // \btoast\b: avoid "toasted sesame oil"
  { re: /quinoa/i, per100: { kcal: 368, p: 14, c: 64, f: 6 } }, // dry
  { re: /cauliflower rice|riced cauliflower|orez de conopid/i, per100: { kcal: 25, p: 2, c: 5, f: 0.3 } },
  { re: /(cooked|frozen|microwave|steamed|pre-?cooked|leftover)[\w\s]*\brice|rice[\w\s]*(cooked|frozen|steamed)/i, per100: { kcal: 130, p: 2.7, c: 28, f: 0.3 } }, // cooked rice
  { re: /\brice|orez/i, per100: { kcal: 360, p: 7, c: 79, f: 0.7 } }, // dry
  // pastes — must come before the pasta matcher so "tomato paste" isn't read as pasta
  { re: /tomato paste|past(ă|a) de ro(ş|s)i|tomato pur(é|e)e/i, per100: { kcal: 82, p: 4, c: 19, f: 0.5 } },
  { re: /harissa|curry paste|chili paste|gochujang|sambal/i, per100: { kcal: 90, p: 3, c: 13, f: 3 } },
  { re: /chickpea pasta|lentil pasta|legume pasta|protein pasta|high-?protein pasta|banza/i, per100: { kcal: 360, p: 20, c: 57, f: 6 } }, // dry, higher protein
  { re: /orzo|couscous|cu(ş|s)cu(ş|s)/i, per100: { kcal: 360, p: 12, c: 72, f: 1.5 } }, // dry
  { re: /bulgur|bulghur|cracked wheat/i, per100: { kcal: 342, p: 12, c: 76, f: 1.3 } }, // dry
  { re: /pasta|noodle|fusilli|spaghetti|macaroni|penne|rigatoni|paste\b/i, per100: { kcal: 371, p: 13, c: 75, f: 1.5 } }, // dry (note: "paste" handled below before tomato/chili paste)
  { re: /polenta|m(ă|a)m(ă|a)lig(ă|a)|cornmeal/i, per100: { kcal: 362, p: 8, c: 79, f: 1.5 } },
  { re: /sweet potato|cartof dulce|batat/i, per100: { kcal: 86, p: 1.6, c: 20, f: 0.1 } }, // before potato so it wins
  { re: /potato|cartof/i, per100: { kcal: 77, p: 2, c: 17, f: 0.1 } },
  { re: /lentil|linte/i, per100: { kcal: 352, p: 25, c: 60, f: 1 } }, // dry
  { re: /chickpea|n(ă|a)ut/i, per100: { kcal: 139, p: 8, c: 22, f: 2.6 } }, // canned
  { re: /black bean|kidney bean|white bean|cannellini|cannelini|navy bean|pinto|butter bean|fasole/i, per100: { kcal: 91, p: 6, c: 16, f: 0.4 } }, // canned, drained (standardized)
  { re: /broccoli/i, per100: { kcal: 34, p: 2.8, c: 7, f: 0.4 } },
  { re: /spinach|spanac/i, per100: { kcal: 23, p: 2.9, c: 3.6, f: 0.4 } },
  { re: /\bkale\b/i, per100: { kcal: 35, p: 3, c: 4.4, f: 0.5 } },
  { re: /brussel/i, per100: { kcal: 43, p: 3.4, c: 9, f: 0.3 } },
  { re: /cauliflower|conopid/i, per100: { kcal: 25, p: 1.9, c: 5, f: 0.3 } },
  { re: /tomatillo/i, per100: { kcal: 32, p: 1, c: 6, f: 1 } },
  { re: /green bean|fasole verde/i, per100: { kcal: 31, p: 1.8, c: 7, f: 0.2 } },
  { re: /zucchini|dovlecel/i, per100: { kcal: 17, p: 1.2, c: 3.1, f: 0.3 } },
  { re: /bell pepper|red pepper|green pepper|yellow pepper|ardei/i, per100: { kcal: 31, p: 1, c: 6, f: 0.3 } }, // not plain "pepper" (seasoning)
  { re: /tomato sauce|marinara|pasta sauce|passata|crushed tomato|sos de ro(ş|s)i/i, per100: { kcal: 20, p: 1, c: 4, f: 0.3 } }, // before plain tomato
  { re: /tomato|ro(ş|s)i/i, per100: { kcal: 18, p: 0.9, c: 3.9, f: 0.2 } }, // standardized
  { re: /onion|ceap(ă|a)/i, per100: { kcal: 40, p: 1.1, c: 9, f: 0.1 } },
  { re: /carrot|morcov/i, per100: { kcal: 41, p: 0.9, c: 10, f: 0.2 } },
  { re: /cucumber|castrave/i, per100: { kcal: 15, p: 0.7, c: 3.6, f: 0.1 } },
  { re: /\bcorn\b(?!\s*tortilla)|porumb/i, per100: { kcal: 86, p: 3.3, c: 19, f: 1.2 } }, // not cornstarch/corn tortilla
  { re: /cabbage|coleslaw|slaw mix|varz(ă|a)/i, per100: { kcal: 25, p: 1.3, c: 6, f: 0.1 } },
  { re: /mushroom|ciuperc/i, per100: { kcal: 22, p: 3.1, c: 3.3, f: 0.3 } },
  { re: /romaine|lettuce|salad greens|mixed greens|sal(a|ă)t(ă|a) verde/i, per100: { kcal: 17, p: 1.2, c: 3, f: 0.2 } },
  { re: /tzatziki/i, per100: { kcal: 60, p: 3, c: 4, f: 3.5 } },
  { re: /coconut aminos|liquid aminos|coco aminos/i, per100: { kcal: 90, p: 1, c: 20, f: 0 } },
  { re: /celery|(ţ|t)elin/i, per100: { kcal: 16, p: 0.7, c: 3, f: 0.2 } },
  { re: /peas|maz(ă|a)re/i, per100: { kcal: 81, p: 5, c: 14, f: 0.4 } },
  { re: /flour|f(ă|a)in/i, per100: { kcal: 364, p: 10, c: 76, f: 1 } },
  { re: /soyaki|teriyaki/i, per100: { kcal: 120, p: 3, c: 27, f: 0.2 } }, // soy-teriyaki sauce
  { re: /dried cranberr|craisin|raisin|stafide|dried fruit/i, per100: { kcal: 325, p: 0, c: 82, f: 1 } }, // before berries (cranberries contains "berries")
  { re: /berries|fruct|berry|strawberr|blueberr|raspberr/i, per100: { kcal: 50, p: 0.7, c: 12, f: 0.3 } },
  { re: /\bapple|m(ă|a)r\b/i, per100: { kcal: 52, p: 0.3, c: 14, f: 0.2 } },
  { re: /mango/i, per100: { kcal: 60, p: 0.8, c: 15, f: 0.4 } },
  { re: /pineapple|ananas/i, per100: { kcal: 50, p: 0.5, c: 13, f: 0.1 } },
  { re: /chia/i, per100: { kcal: 486, p: 17, c: 42, f: 31 } },
  { re: /almond milk|oat milk|soy milk|rice milk|cashew milk|plant.?based milk|lapte vegetal/i, per100: { kcal: 20, p: 0.6, c: 1, f: 1.5 } }, // unsweetened plant milk — before nuts/butter
  { re: /peanut butter|nut butter|almond butter|unt de arahide/i, per100: { kcal: 588, p: 25, c: 20, f: 50 } },
  { re: /\balmond/i, per100: { kcal: 579, p: 21, c: 22, f: 50 } }, // standardized
  { re: /cashew/i, per100: { kcal: 553, p: 18, c: 30, f: 44 } }, // standardized
  { re: /walnut|pecan|pistachio|hazelnut|macadamia|\bnuts?\b|migdal|aluni|nuc(ă|i)/i, per100: { kcal: 650, p: 15, c: 14, f: 65 } },
  { re: /sour cream|sm(â|a)nt(â|a)n(ă|a)/i, per100: { kcal: 180, p: 3, c: 4, f: 17 } },
  { re: /collagen/i, per100: { kcal: 360, p: 90, c: 0, f: 0 } },
  { re: /granola/i, per100: { kcal: 471, p: 10, c: 64, f: 20 } },
  { re: /cocoa|cacao/i, per100: { kcal: 228, p: 20, c: 58, f: 14 } },
  { re: /corn tortilla|tortilla de porumb/i, per100: { kcal: 218, p: 6, c: 45, f: 3 } },
  { re: /radish|ridich/i, per100: { kcal: 16, p: 0.7, c: 3.4, f: 0.1 } },
  { re: /jalapeno|jalape(ñ|n)o/i, per100: { kcal: 29, p: 0.9, c: 6, f: 0.4 } },
  { re: /maple syrup|sirop de ar(ţ|t)ar/i, per100: { kcal: 260, p: 0, c: 67, f: 0 } },
  { re: /coconut cream|sm(â|a)nt(â|a)n(ă|a) de cocos/i, per100: { kcal: 330, p: 3, c: 6, f: 34 } },
  { re: /coconut milk|lapte de cocos/i, per100: { kcal: 197, p: 2, c: 3, f: 20 } }, // canned
  { re: /mayonnaise|mayo\b|maionez/i, per100: { kcal: 680, p: 1, c: 1, f: 75 } },
  { re: /sweet (thai )?chili sauce|sweet chilli|bang bang sauce|thai chili sauce/i, per100: { kcal: 225, p: 0.5, c: 55, f: 0.2 } }, // sugary
  { re: /enchilada sauce|salsa|hot sauce|sriracha|sambal|gochujang|chili sauce|buffalo sauce|frank|redhot|red hot|worcestershire/i, per100: { kcal: 60, p: 1.5, c: 11, f: 1 } },
  { re: /arugula|rocket|rucol/i, per100: { kcal: 25, p: 2.6, c: 3.7, f: 0.7 } },
  { re: /olive oil|coconut oil|avocado oil|vegetable oil|canola oil|sunflower oil|ulei/i, per100: { kcal: 884, p: 0, c: 0, f: 100 } },
  { re: /sesame oil/i, per100: { kcal: 884, p: 0, c: 0, f: 100 } },
  { re: /pesto/i, per100: { kcal: 450, p: 5, c: 6, f: 46 } },
  { re: /sesame seeds?|susan/i, per100: { kcal: 573, p: 18, c: 23, f: 50 } },
  { re: /\bsugar\b|brown sugar|zah(ă|a)r/i, per100: { kcal: 387, p: 0, c: 100, f: 0 } },
  { re: /scallion|green onion|spring onion|ceap(ă|a) verde/i, per100: { kcal: 32, p: 1.8, c: 7, f: 0.2 } },
  { re: /olives?|m(ă|a)sline/i, per100: { kcal: 115, p: 0.8, c: 6, f: 11 } }, // after oils so "olive oil" wins
  { re: /\bmilk\b|\blapte\b/i, per100: { kcal: 44, p: 3.5, c: 5, f: 1 } }, // skim (your default)
  { re: /\bbutter|unt\b/i, per100: { kcal: 350, p: 0.5, c: 0.5, f: 38 } }, // your low-cal butter
  { re: /cornstarch|corn starch|amidon|maizena/i, per100: { kcal: 381, p: 0.3, c: 91, f: 0.1 } }, // USDA
  { re: /sweet potato|cartof dulce|batat/i, per100: { kcal: 86, p: 1.6, c: 20, f: 0.1 } },
  { re: /avocado/i, per100: { kcal: 160, p: 2, c: 9, f: 15 } },
  { re: /honey|miere/i, per100: { kcal: 304, p: 0.3, c: 82, f: 0 } },
  { re: /soy sauce|sos de soia/i, per100: { kcal: 53, p: 8, c: 5, f: 0.1 } },
  { re: /mustard|mu(ş|s)tar/i, per100: { kcal: 66, p: 4, c: 5, f: 4 } },
];

// foods that are negligible / seasoning — counted as ~0
const NEGLIGIBLE = /salt|pepper|sare|piper|garlic|usturoi|ginger|ghimbir|paprika|cumin|oregano|basil|dill|chives|rosemary|thyme|parsley|p(ă|a)trunjel|cilantro|coriander|mint|ment(ă|a)|cardamom|sumac|turmeric|nutmeg|clove\b|bay leaf|cayenne|chili flake|red pepper flake|marjoram|tarragon|sage|vinegar|o(ţ|t)et|za'?atar|capers|saffron|\bdijon\b|fish sauce|herb|spice|seasoning|condiment|curry powder|chili powder|cinnamon|vanilla|sweetener|stevia|water|ap(ă|a)|stock|broth|bouillon|sup(ă|a)|lemon|l(ă|a)m(â|a)ie|lime|juice of|zest|slurry|sprinkle|garnish|to serve|to taste|topping|for serving|for servings|baking powder|baking soda|bay leaf|bay leaves|cooking spray|for greasing|for cooking|nutritional yeast|^oil[, ]|nori\b|to garnish/i;

// rough grams for non-weight units — keys are regex fragments matched against the unit word
const UNIT_GRAMS = {
  "egg|\\bou(ă|a)?\\b": 50,
  "tbsp|tablespoon|lingur(a|ă)": 14, // checked before tsp (tbsp contains no "tsp")
  "tsp|teaspoon|linguri(ţ|t)": 5,
  "clove|c(ă|a)(ţ|t)el": 5,
  "slice|felie": 25,
  "scoop": 30,
};

// Approx grams for a whole countable food ("1 medium onion", "8 chicken thighs").
const COUNT_GRAMS = [
  [/avocado/, 150], [/onion|ceap/, 110], [/bell pepper|pepper|ardei/, 120],
  [/tomato|ro(ş|s)i/, 120], [/carrot|morcov/, 60], [/sweet potato|cartof dulce|batat/, 130],
  [/potato|cartof/, 170], [/zucchini|dovlecel/, 200], [/cucumber|castrave/, 200],
  [/scallion|green onion|spring onion/, 15], [/salmon|fillet|file/, 140],
  [/banana|banan/, 120], [/celery|(ţ|t)elin/, 40], [/tortilla/, 35],
  [/radish|ridich/, 12], [/jalapeno|jalape(ñ|n)o/, 15], [/\bapple|m(ă|a)r\b/, 180],
  [/egg\b/, 50], [/pita/, 60], [/head.*(romaine|lettuce|cabbage)|romaine|lettuce/, 300],
  [/mango/, 200], [/lime|lemon|l(ă|a)m(â|a)ie/, 60],
  // poultry pieces (raw, boneless skinless unless noted)
  [/chicken thigh|pulp(ă|a) de pui/, 120], [/drumstick|copan/, 110],
  [/chicken breast|chicken fillet|piept de pui/, 170], [/chicken|pui/, 140],
  // a "bag" of pre-cut produce (coleslaw/greens), typical ~340 g
  [/coleslaw|slaw mix|bag of (salad|greens|spinach|coleslaw)/, 340],
];
function countItemGrams(name) {
  const n = name.toLowerCase();
  for (const [re, g] of COUNT_GRAMS) if (re.test(n)) return g;
  return null;
}

// Unquantified garnish / serving-suggestion lines — ignored (count as ~0), even
// when they name a real food ("sesame seeds, for garnish", "serve with naan").
const SERVING_RE = /garnish|for serving|for servings|to serve|to garnish|for topping|\btopping|optional topping|drizzle|serve with|side of|steamed rice|naan bread|to taste|for cooking|for greasing|cooking spray/i;

// A line contributes no countable macros: either a known seasoning, or a
// serving/garnish suggestion with no parseable quantity.
function isNegligible(line) {
  if (NEGLIGIBLE.test(line) && !findFood(line)) return true;
  if (ingredientGrams(line) == null && SERVING_RE.test(line)) return true;
  return false;
}

// Personal overrides (your specific products). Loaded from overrides.js.
// NB: named OVERRIDE_LIST (not OVERRIDES) — overrides.js already declares a global
// `const OVERRIDES`, and two top-level `const`s with the same name collide in the
// browser's shared script scope (throws, halting this file).
const OVERRIDE_LIST = (typeof module !== "undefined" && typeof require !== "undefined")
  ? require("./overrides.js")
  : (typeof window !== "undefined" && window.OVERRIDES) || [];

function overrideFor(name) {
  for (const o of OVERRIDE_LIST) if (o.re.test(name)) return o;
  return null;
}

// Generic food-table lookup (ignores personal overrides) — used to measure the
// delta an override introduces vs. the standard value the recipe assumed.
function findFoodStandard(name) {
  // flavoring liquids — keep "rice vinegar" from matching rice, "chicken stock" from chicken, etc.
  if (/stock|broth|bouillon|sup(ă|a)\b|vinegar|o(ţ|t)et|fish sauce|sos de pe(ş|s)te/i.test(name)) return null;
  for (const f of FOODS) if (f.re.test(name)) return f.per100;
  return null;
}

function findFood(name) {
  const o = overrideFor(name);
  if (o) return o.per100; // your product wins
  return findFoodStandard(name);
}

// Approximate grams in 1 US cup, by food (cups are volume, so food-dependent).
function cupGrams(name) {
  const n = name.toLowerCase();
  if (/water|broth|stock|juice|liquid|ap(ă|a)|sup(ă|a)|suc/.test(n)) return 240; // liquids
  if (/spinach|lettuce|greens|kale|arugula|rocket|spanac/.test(n)) return 30;
  if (/broccoli|cauliflower|cabbage|conopid|varz/.test(n)) return 90;
  if (/berries|berry|fruct/.test(n)) return 150;
  if (/corn|peas|maz(ă|a)re|porumb/.test(n)) return 160;
  if (/bean|chickpea|lentil|fasole|n(ă|a)ut|linte/.test(n)) return 175; // cooked/canned
  if (/cottage cheese|br(â|a)nz(ă|a) de vaci/.test(n)) return 226;
  if (/yogurt|iaurt|milk|lapte/.test(n)) return 245;
  if (/cheese|mozzarella|cheddar|feta|parmesan|ca(ş|s)caval/.test(n)) return 112; // shredded
  if (/cooked rice|cooked quinoa|orez fiert/.test(n)) return 160;
  if (/\brice|quinoa|orez/.test(n)) return 185; // dry
  if (/cooked pasta|paste fierte/.test(n)) return 200;
  if (/pasta|noodle|paste/.test(n)) return 100; // dry
  if (/oats|ov(ă|a)z|flour|f(ă|a)in/.test(n)) return 100;
  return 150; // sensible default
}

// Parse "800 g chicken breast", "8 oz pasta", "2 lbs chicken", "1 cup broccoli",
// "4 eggs", "1 tbsp olive oil", "2 cans tuna". Handles metric + US units.
// "1 1/2" -> "1.5", standalone "1/2" -> "0.5", unicode "½"/"⅓" -> decimals
const UNICODE_FRAC = { "½": ".5", "⅓": ".333", "⅔": ".667", "¼": ".25", "¾": ".75", "⅛": ".125", "⅕": ".2", "⅖": ".4" };
function normalizeNumbers(s) {
  // "1½" -> "1.5", lone "½" -> "0.5"
  s = s.replace(/(\d)\s*([½⅓⅔¼¾⅛⅕⅖])/g, (_, d, f) => d + UNICODE_FRAC[f]);
  s = s.replace(/([½⅓⅔¼¾⅛⅕⅖])/g, (m) => "0" + UNICODE_FRAC[m]);
  s = s.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (_, a, b, c) => (parseInt(a) + parseInt(b) / parseInt(c)).toString());
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, (_, b, c) => (parseInt(b) / parseInt(c)).toString());
  return s;
}

function parseQuantity(line) {
  // Take the FIRST weight in the line — for "2 lbs chicken (20 oz cooked)" that's
  // the raw 2 lbs; for "3 fillets (~480 g)" it's the useful 480 g. Embedded gram
  // annotations like "1/4 cup 84g harissa" are picked up by the weight match too.
  // strip filler words that sit between the number and the unit ("1 heaping cup")
  const lower = normalizeNumbers(line.toLowerCase()).replace(/\b(heaping|packed|rounded|scant|level|generous|about|approx(?:imately)?|roughly)\b/g, " ");

  // "N (X oz each) ..." -> count × per-item weight (e.g. "4 (5 oz) salmon fillets").
  // Only for imperial per-item sizes or an explicit "each"; a metric "(~480 g)"
  // annotation is a TOTAL, not per-item, so we let the normal weight match take it.
  let mm = lower.match(/(\d+(?:\.\d+)?)([^\d(]*)\(\s*(?:about\s*|~\s*)?(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|lb|lbs?|pounds?)\b/);
  if (mm) {
    const gap = mm[2];
    const u = mm[4];
    const isImperial = /^(oz|ounce|lb|pound)/.test(u);
    // don't fire if the leading number already carries its own weight unit
    // ("2 lbs chicken (20 oz cooked)") — that's an annotation, not a multiplier.
    const leadHasUnit = /\b(g|kg|oz|ounce|lb|lbs|pound|ml|cup)/.test(gap);
    if (!leadHasUnit && (isImperial || /each/.test(lower))) {
      const count = parseFloat(mm[1]);
      let each = parseFloat(mm[3]);
      if (/^(lb|pound)/.test(u)) each *= 453.6;
      else if (/^(oz|ounce)/.test(u)) each *= 28.35;
      return { grams: Math.round(count * each), basis: "count×weight" };
    }
  }

  // explicit weight: metric + imperial
  let m = lower.match(/(\d+(?:[.,]\d+)?)[\s-]*(kg|lbs?|pounds?|oz|ounces?|grams?|g|ml|l)\b/);
  if (m) {
    let qty = parseFloat(m[1].replace(",", "."));
    const unit = m[2];
    if (unit === "kg" || unit === "l") qty *= 1000;
    else if (/^(lb|pound)/.test(unit)) qty *= 453.6;
    else if (/^(oz|ounce)/.test(unit)) qty *= 28.35;
    return { grams: Math.round(qty), basis: "weight" };
  }

  // cups (volume -> grams depends on the food)
  m = lower.match(/(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*cups?\b/);
  if (m) {
    let raw = m[1].replace(",", ".");
    let cups = raw.includes("/") ? raw.split("/").reduce((a, b) => parseFloat(a) / parseFloat(b)) : parseFloat(raw);
    return { grams: Math.round(cups * cupGrams(lower)), basis: "cup" };
  }

  // "1 can / 2 cans" — assume ~240 g usable (beans/tuna drained, ~400 g tomatoes handled loosely)
  m = lower.match(/(\d+(?:[.,]\d+)?)\s*cans?\b/) || lower.match(/(\d+(?:[.,]\d+)?)\s*conserv/);
  if (m) {
    const cans = parseFloat(m[1].replace(",", "."));
    const each = /tomato|ro(ş|s)i/.test(lower) ? 400 : 240;
    return { grams: cans * each, basis: "can" };
  }

  // leading count, then a known unit word appearing anywhere in the line
  // (handles "8 whole eggs", "1 tbsp olive oil", "2 cloves garlic")
  m = lower.match(/(\d+(?:[.,]\d+)?)/);
  if (m) {
    const count = parseFloat(m[1].replace(",", "."));
    for (const key of Object.keys(UNIT_GRAMS)) {
      if (new RegExp(key).test(lower)) return { grams: count * UNIT_GRAMS[key], basis: "unit" };
    }
    // a bare count of a countable food (e.g. "3 salmon fillets") -> treat as portions; skip precise grams
    return { grams: null, count, basis: "count" };
  }
  return { grams: null, basis: "unknown" };
}

// Total grams for an ingredient line (weight + count-of-produce fallback).
function ingredientGrams(line) {
  const q = parseQuantity(line);
  if (q.grams != null) return Math.round(q.grams);
  if (q.count != null) {
    const g = countItemGrams(line);
    if (g != null) return Math.round(q.count * g);
  }
  return null;
}

// Leading measurement words to peel off (looped, so "1 ½ cup" -> "cup" -> gone,
// and descriptors like "boneless, skinless" are dropped for a clean food name).
const UNIT_WORD = /^\s*[,.()-]*\s*(kg|kilograms?|grams?|g|lbs?|pounds?|oz|ounces?|ml|l|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|cloves?|slices?|cans?|jars?|packs?|packages?|bags?|boxes?|scoops?|sticks?|pinch(?:es)?|sprinkle|dash(?:es)?|handful|bunch|head|stalks?|sprigs?|fillets?|breasts?|thighs?|heaping|packed|rounded|scant|level|generous|about|approx(?:imately)?|roughly|optional|large|medium|small|whole|fresh|ripe|dried|ground|boneless|skinless|cooked|raw|diced|chopped|minced|sliced|grated|shredded|of|the)\b[\s:.-]*/i;

// Strip the original quantity + unit (cups/oz/tsp/¼/nested parens/etc.), leaving the food.
function foodName(line) {
  let s = line;
  while (/\([^()]*\)/.test(s)) s = s.replace(/\([^()]*\)/g, " "); // drop nested "((210 grams))"
  s = s
    .replace(/[()]/g, " ")                       // any stray unbalanced parens
    .replace(/[½⅓⅔¼¾⅛⅕⅖⅜⅝⅞]/g, " ")             // unicode fractions ¼ ½ ¾ …
    .replace(/\b\d+\s*g(?:rams?)?\b/gi, " ")     // embedded "84g" / "210 grams"
    .replace(/\d+\s*\/\s*\d+/g, " ")             // fractions "1/2"
    .replace(/\d+(?:\.\d+)?/g, " ")              // any remaining numbers
    .replace(/^\s*optional\s*:/i, " ");          // "Optional: ..."
  let prev;
  do { prev = s; s = s.replace(UNIT_WORD, " "); } while (s !== prev);
  s = s.trim(); // so a leading food word ("crushed tomatoes") isn't seen as a trailing prep modifier
  // drop trailing prep/modifier phrases ("chicken breasts cut into cubes" -> "chicken breasts")
  s = s.replace(/\s*[,;].*$/, "");
  s = s.replace(/\s+(cut in|cut into|sliced|diced|chopped|minced|cubed|grated|shredded|peeled|trimmed|halved|quartered|crushed|crumbled|drained|rinsed|thawed|divided|softened|melted|beaten|cooked|raw|fresh|for |to )\b.*$/i, "");
  return s.replace(/^[\s,.()-]+/, "").replace(/\s{2,}/g, " ").trim();
}

// Rewrite an ingredient line in grams: "8 cups broccoli" -> "720 g broccoli".
// Lines we can't weigh (garnishes, "to taste") show just the cleaned food name.
function gramify(line) {
  const g = ingredientGrams(line);
  const name = foodName(line);
  if (g == null) return name || line.replace(/\s{2,}/g, " ").trim();
  return name ? `${g} g ${name}` : `${g} g`;
}

// Cooking yield: raw measured grams -> approximate COOKED weight. Dry grains/pasta
// soak up water and grow; meat loses water and shrinks. Used for the "real" plate
// weight (calories are unchanged — they live on the raw figure).
function cookedFactor(line) {
  const n = line.toLowerCase();
  if (/\b(cooked|canned|fierte?|fiert|leftover|pre-?cooked|steamed)\b/.test(n)) return 1; // already cooked
  if (/\brice\b|orez/.test(n)) return 3;
  if (/quinoa|bulgur/.test(n)) return 3;
  if (/pasta|noodle|orzo|couscous|macaroni|penne|spaghetti|rigatoni|fusilli|paste\b/.test(n)) return 2.3;
  if (/lentil|linte|dried? bean|dry bean/.test(n)) return 2.5;
  if (/\boats|ov(ă|a)z/.test(n)) return 2;
  if (/chicken|turkey|pork|beef|bison|chorizo|sausage|salmon|tuna|fish|shrimp|prawn|cod|tilapia|mahi|pui|porc|curcan|peste|somon|creve/.test(n)) return 0.72; // water loss
  return 1;
}

// Convert measurements embedded in prose (method steps) to grams:
// "add 3 cups of water" -> "add 720 g water". Keeps the surrounding text intact.
function gramifyText(text) {
  if (typeof text !== "string") return text;
  const s = normalizeNumbers(text);
  return s.replace(/(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(cups?|tablespoons?|tbsps?|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?)\b/gi,
    (m, qty, unit, offset, full) => {
      const after = full.slice(offset + m.length).match(/^[\s,]*(?:of\s+)?([a-z][a-z\s-]{0,18})/i);
      const food = after ? after[1] : "";
      const range = /-/.test(qty); // "1-2 tablespoons" -> use the upper value
      const n = range ? qty.split("-").pop().trim() : qty;
      const g = ingredientGrams(`${n} ${unit} ${food}`);
      return g != null ? `${range ? "~" : ""}${g} g` : m;
    });
}

// Returns { items: [...], totals, perPortion, confidence }
function estimateBreakdown(ingredients, servings = 1) {
  const items = [];
  let total = { kcal: 0, p: 0, c: 0, f: 0 };
  let batchGrams = 0;       // raw, as-measured
  let cookedGrams = 0;      // after cooking yield (rice expands, meat shrinks)
  let gramsAllKnown = true;

  for (const line of ingredients) {
    if (isNegligible(line)) {
      const sg = ingredientGrams(line);
      items.push({ name: line, grams: sg != null ? Math.round(sg) : null, kcal: 0, p: 0, c: 0, f: 0, note: "seasoning" });
      continue;
    }
    const food = findFood(line);
    const q = parseQuantity(line);
    // bare count of a known produce ("1 medium onion") -> estimate its weight
    if (food && q.grams == null && q.count != null) {
      const g = countItemGrams(line);
      if (g != null) q.grams = q.count * g;
    }
    if (food && q.grams != null) {
      const factor = q.grams / 100;
      const it = {
        name: line,
        grams: Math.round(q.grams),
        kcal: Math.round(food.kcal * factor),
        p: +(food.p * factor).toFixed(1),
        c: +(food.c * factor).toFixed(1),
        f: +(food.f * factor).toFixed(1),
      };
      it.cooked = Math.round(q.grams * cookedFactor(line));
      items.push(it);
      total.kcal += it.kcal; total.p += it.p; total.c += it.c; total.f += it.f;
      batchGrams += q.grams;
      cookedGrams += q.grams * cookedFactor(line);
    } else {
      if (q.grams != null) { batchGrams += q.grams; cookedGrams += q.grams * cookedFactor(line); } // grams known even if food unmatched
      else gramsAllKnown = false;
      items.push({ name: line, grams: q.grams != null ? Math.round(q.grams) : null, kcal: null, note: food ? "qty unclear" : "not in food table" });
    }
  }

  const known = items.filter((i) => i.kcal != null && i.note !== "seasoning").length;
  const confidence = ingredients.length ? Math.round((known / ingredients.length) * 100) : 0;

  return {
    items,
    totals: {
      kcal: Math.round(total.kcal),
      p: Math.round(total.p),
      c: Math.round(total.c),
      f: Math.round(total.f),
    },
    perPortion: {
      kcal: Math.round(total.kcal / servings),
      p: Math.round(total.p / servings),
      c: Math.round(total.c / servings),
      f: Math.round(total.f / servings),
    },
    batchGrams: Math.round(batchGrams),
    portionGrams: Math.round(batchGrams / servings),
    cookedBatchGrams: Math.round(cookedGrams),
    cookedPortionGrams: Math.round(cookedGrams / servings),
    gramsApprox: !gramsAllKnown, // true if some ingredient weights couldn't be parsed
    confidence,
  };
}

// Breakdown whose per-ingredient numbers are SCALED so they sum to the recipe's
// own published per-serving macros. This keeps the headline and the breakdown
// consistent (the raw estimate is only an approximation; the published total is
// what we present as authoritative). Each macro is scaled by its own factor so
// every column's total matches the headline. Falls back to the raw estimate when
// the recipe has no published macros.
// Recompute a recipe's per-portion macros to reflect PERSONAL overrides. Starts
// from the published figures and applies only the delta (your product − generic)
// for each overridden ingredient, so the rest of the recipe's numbers are kept.
// Returns null when the recipe uses no overridden ingredients.
function adjustMacros(recipe) {
  const servings = recipe.servings || 1;
  const d = { kcal: 0, p: 0, c: 0, f: 0 };
  const applied = [];
  for (const line of recipe.ingredients || []) {
    const o = overrideFor(line);
    if (!o) continue;
    const grams = ingredientGrams(line);
    if (grams == null) continue;
    const base = findFoodStandard(line) || { kcal: 0, p: 0, c: 0, f: 0 };
    const factor = grams / 100;
    d.kcal += (o.per100.kcal - base.kcal) * factor;
    d.p += (o.per100.p - base.p) * factor;
    d.c += (o.per100.c - base.c) * factor;
    d.f += (o.per100.f - base.f) * factor;
    applied.push(o.name);
  }
  if (!applied.length) return null;
  const adj = (pub, delta) => (pub != null ? Math.round(pub + delta / servings) : null);
  return {
    kcal: adj(recipe.kcal, d.kcal),
    protein: adj(recipe.protein, d.p),
    carbs: adj(recipe.carbs, d.c),
    fat: adj(recipe.fat, d.f),
    applied: [...new Set(applied)],
  };
}

// HYBRID basis decision: use the canonical (standardized-ingredient) totals when
// they're within 25% of the recipe's published per-portion kcal (and coverage is
// decent); otherwise keep the published figures (guards against quantity-parse
// outliers). Personal overrides are already baked into both via findFood/adjustMacros.
const HYBRID_TOLERANCE = 0.25;
function effectiveBasis(recipe) {
  const servings = recipe.servings || 1;
  const est = estimateBreakdown(recipe.ingredients || [], servings);
  const adj = adjustMacros(recipe); // override-adjusted published
  const pub = adj
    ? { kcal: adj.kcal, p: adj.protein, c: adj.carbs, f: adj.fat }
    : { kcal: recipe.kcal, p: recipe.protein, c: recipe.carbs, f: recipe.fat };
  let useCanonical = false;
  if (est.totals.kcal > 0) {
    if (pub.kcal == null) useCanonical = true; // no published number -> trust ingredients
    else if (est.confidence >= 40 && Math.abs(est.perPortion.kcal - pub.kcal) / pub.kcal <= HYBRID_TOLERANCE) useCanonical = true;
  }
  return { est, pub, servings, useCanonical };
}

// Per-portion macros actually shown (card/modal headline + filters).
function effectiveMacros(recipe) {
  const { est, pub, useCanonical } = effectiveBasis(recipe);
  if (useCanonical) return { kcal: est.perPortion.kcal, protein: est.perPortion.p, carbs: est.perPortion.c, fat: est.perPortion.f, source: "canonical" };
  return { kcal: pub.kcal, protein: pub.p, carbs: pub.c, fat: pub.f, source: "published" };
}

function reconciledBreakdown(recipe) {
  const { est: b, pub, servings, useCanonical } = effectiveBasis(recipe);

  if (useCanonical) {
    // ingredients are the source of truth — show canonical per-ingredient values as-is
    return { ...b, scaled: false, source: "canonical", rawPerPortion: b.perPortion };
  }

  // outlier: scale per-ingredient values so they sum to the published headline
  const published = pub;
  const factor = {};
  for (const m of ["kcal", "p", "c", "f"]) {
    const pubTotal = published[m] != null ? published[m] * servings : null;
    factor[m] = pubTotal != null && b.totals[m] > 0 ? pubTotal / b.totals[m] : 1;
  }
  const items = b.items.map((i) =>
    i.kcal == null ? i : {
      ...i,
      kcal: Math.round(i.kcal * factor.kcal),
      p: +(i.p * factor.p).toFixed(1),
      c: +(i.c * factor.c).toFixed(1),
      f: +(i.f * factor.f).toFixed(1),
    }
  );
  const totals = {
    kcal: published.kcal != null ? published.kcal * servings : b.totals.kcal,
    p: published.p != null ? published.p * servings : b.totals.p,
    c: published.c != null ? published.c * servings : b.totals.c,
    f: published.f != null ? published.f * servings : b.totals.f,
  };
  const perPortion = {
    kcal: Math.round(totals.kcal / servings),
    p: Math.round(totals.p / servings),
    c: Math.round(totals.c / servings),
    f: Math.round(totals.f / servings),
  };
  return { ...b, items, totals, perPortion, scaled: true, source: "published", rawPerPortion: b.perPortion };
}

// Standardization status of one ingredient line:
//   "seasoning" — negligible (salt/herbs/water), counts as ~0, no macros needed
//   "ok"        — converts to grams AND matches a food (has macros)
//   "no-grams"  — matches a food but quantity can't be parsed to grams
//   "no-food"   — has a weight but no macro match in the food table
function ingredientStatus(line) {
  if (isNegligible(line)) return "seasoning";
  const food = findFood(line);
  const grams = ingredientGrams(line);
  if (food && grams != null) return "ok";
  if (!food) return "no-food";
  return "no-grams";
}

// A recipe is "standardized" when every ingredient is either a seasoning or ok.
// Returns the list of offending lines (empty = fully standardized).
function standardizationProblems(recipe) {
  const probs = [];
  for (const line of recipe.ingredients || []) {
    const s = ingredientStatus(line);
    if (s === "no-food" || s === "no-grams") probs.push({ line, issue: s });
  }
  return probs;
}

// Cross-check a recipe's PUBLISHED macros against the ingredient-based estimate.
// Returns a flag + human note so the UI can warn when a source's numbers look off.
function validateMacros(recipe) {
  const b = estimateBreakdown(recipe.ingredients || [], recipe.servings || 1);
  const out = { estPortionKcal: b.perPortion.kcal, estPortionProtein: b.perPortion.p, confidence: b.confidence };
  if (recipe.kcal == null || b.confidence < 40) {
    out.status = "unverified";
    out.note = "Not enough matched ingredients to verify the published macros.";
    return out;
  }
  const kcalDelta = Math.round(((b.perPortion.kcal - recipe.kcal) / recipe.kcal) * 100);
  out.kcalDeltaPct = kcalDelta;
  if (Math.abs(kcalDelta) <= 25) {
    out.status = "ok";
    out.note = `Published ${recipe.kcal} kcal/portion checks out (ingredient estimate ${b.perPortion.kcal}, ${kcalDelta > 0 ? "+" : ""}${kcalDelta}%).`;
  } else {
    out.status = "mismatch";
    out.note = `Published ${recipe.kcal} kcal/portion vs ingredient estimate ${b.perPortion.kcal} (${kcalDelta > 0 ? "+" : ""}${kcalDelta}%) — treat the macros with caution.`;
  }
  return out;
}

if (typeof module !== "undefined") module.exports = { estimateBreakdown, reconciledBreakdown, effectiveMacros, adjustMacros, validateMacros, parseQuantity, findFood, gramify, gramifyText, foodName, ingredientGrams, ingredientStatus, standardizationProblems };
if (typeof window !== "undefined") {
  window.estimateBreakdown = estimateBreakdown;
  window.reconciledBreakdown = reconciledBreakdown;
  window.adjustMacros = adjustMacros;
  window.validateMacros = validateMacros;
  window.gramify = gramify;
  window.gramifyText = gramifyText;
  window.foodName = foodName;
  window.effectiveMacros = effectiveMacros;
}

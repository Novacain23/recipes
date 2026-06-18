// Harvest candidate recipe URLs from roundup/category pages on known-good blogs.
// Fetches each listing page, extracts same-domain links that look like single
// recipe posts (one slug, not category/tag/page/author), dedupes, prints them.
//
//   node harvest.js > urls.txt   then   node find-recipes.js --file urls.txt

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Roundup / category pages that link to many individual recipes.
const LISTINGS = [
  "https://kaynutrition.com/category/recipes/chicken/",
  "https://kaynutrition.com/category/recipes/meal-prep/",
  "https://kaynutrition.com/category/recipes/dinner/",
  "https://kaynutrition.com/category/recipes/fish-seafood/",
  "https://eatthegains.com/high-protein-chicken-recipes/",
  "https://eatthegains.com/high-protein-meal-prep/",
  "https://eatthegains.com/macro-friendly-recipes/",
  "https://eatthegains.com/high-protein-lunch-recipes/",
  "https://thegirlonbloor.com/high-protein-meal-prep-recipes/",
  "https://thecleaneatingcouple.com/high-protein-meal-prep-recipes/",
  "https://thecleaneatingcouple.com/high-protein-dinners/",
  "https://thecleaneatingcouple.com/high-protein-chicken-recipes/",
  "https://skinnyspatula.com/category/high-protein/",
  "https://www.killingthyme.net/high-protein-lunch-ideas/",
];

// Path segments that are NOT recipes.
const SKIP = /\/(category|tag|author|page|recipes|recipe-index|about|contact|privacy|shop|subscribe|web-stories|wp-|feed|comment)/i;

async function harvest(url) {
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return [];
    const html = await r.text();
    const origin = new URL(url).origin;
    const links = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]);
    const out = [];
    for (let href of links) {
      try {
        const u = new URL(href);
        if (u.origin !== origin) continue;             // same domain only
        const path = u.pathname.replace(/\/$/, "");
        const segs = path.split("/").filter(Boolean);
        if (segs.length !== 1) continue;               // single-slug = recipe post
        if (SKIP.test(u.pathname)) continue;
        if (segs[0].length < 6) continue;              // skip short nav slugs
        out.push(u.origin + "/" + segs[0] + "/");
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

(async () => {
  const all = new Set();
  for (const L of LISTINGS) {
    const found = await harvest(L);
    found.forEach((u) => all.add(u));
    console.error(`  ${L} -> ${found.length} links`);
  }
  console.error(`\nTotal unique candidate recipes: ${all.size}`);
  [...all].forEach((u) => console.log(u));
})();

// Local server for the curated recipe app.
//
//   node server.js   ->   http://localhost:5173
//
// Serves the static UI and exposes a small API that actually PARSES online
// recipes: paste a URL, the server fetches the page, extracts schema.org
// Recipe data, scores it against the cutting filters, and (if it fits) stores
// it. No external dependencies — Node 18+ built-ins only.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { parseRecipeFromHtml, scoreRecipe, DEFAULT_FILTERS } = require("./parser.js");

const PORT = process.env.PORT || 5173;
const BOOT = Date.now(); // cache-busting version for static assets
const ROOT = __dirname;
const STORE = path.join(ROOT, "recipes.store.json");
const SEED = require("./recipes.js"); // shipped curated recipes

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

function loadImported() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return [];
  }
}
function saveImported(list) {
  fs.writeFileSync(STORE, JSON.stringify(list, null, 2));
}

function allRecipes() {
  // Only imported recipes are shown — every one has a photo + source link.
  // (The original hand-curated seeds without photos were dropped per user request.)
  return loadImported().map((r) => ({ ...r, origin: "imported" }));
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      headers: {
        // many recipe sites block non-browser agents
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  // ---- API ----
  if (u.pathname === "/api/recipes" && req.method === "GET") {
    return sendJson(res, 200, { recipes: allRecipes(), filters: DEFAULT_FILTERS });
  }

  if (u.pathname === "/api/import" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const url = (body.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return sendJson(res, 400, { error: "Please provide a valid http(s) URL." });

      const html = await fetchHtml(url);
      const recipe = parseRecipeFromHtml(html, url);
      if (recipe.error) return sendJson(res, 422, { error: recipe.error });

      const verdict = scoreRecipe(recipe, body.filters);

      if (verdict.pass) {
        const imported = loadImported();
        if (!imported.some((r) => r.source === url)) {
          imported.unshift({ ...recipe, fitScore: verdict.fitScore });
          saveImported(imported);
        }
      }
      return sendJson(res, 200, { recipe: { ...recipe, fitScore: verdict.fitScore }, verdict });
    } catch (err) {
      return sendJson(res, 500, { error: "Couldn't fetch/parse that page: " + err.message });
    }
  }

  if (u.pathname === "/api/recipe" && req.method === "DELETE") {
    const id = u.searchParams.get("id");
    const imported = loadImported().filter((r) => r.id !== id);
    saveImported(imported);
    return sendJson(res, 200, { ok: true });
  }

  // ---- static files ----
  let filePath = path.join(ROOT, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { error: "forbidden" });

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    // Stamp a fresh ?v= on local script/style URLs so the browser can't serve
    // a stale cached JS/CSS after a change (version = server boot time).
    if (ext === ".html") {
      content = Buffer.from(
        content.toString("utf8").replace(/(src|href)="([\w.-]+\.(?:js|css))"/g, `$1="$2?v=${BOOT}"`)
      );
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store, must-revalidate",
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🍳 Cut & Keep running at  http://localhost:${PORT}\n`);
  console.log("  Paste any recipe URL in the app to parse, score & curate it.\n");
});

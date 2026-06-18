// UI logic for the curated recipe browser.
// Recipes come from the server API (/api/recipes). When opened as a plain file
// (no server), it falls back to the embedded RECIPES seed dataset.

let ALL = [];

const state = {
  search: "",
  kcalMax: 650,
  proteinMin: 30,
  timeMax: 30,
  proteinTypes: new Set(),
  bulkOnly: false,
};

const els = {
  grid: document.getElementById("grid"),
  search: document.getElementById("search"),
  kcalMax: document.getElementById("kcalMax"),
  proteinMin: document.getElementById("proteinMin"),
  timeMax: document.getElementById("timeMax"),
  bulkOnly: document.getElementById("bulkOnly"),
  proteinChips: document.getElementById("proteinChips"),
  kcalVal: document.getElementById("kcalVal"),
  proteinVal: document.getElementById("proteinVal"),
  timeVal: document.getElementById("timeVal"),
  resultCount: document.getElementById("resultCount"),
  reset: document.getElementById("reset"),
  modal: document.getElementById("modal"),
  modalCard: document.getElementById("modalCard"),
  importUrl: document.getElementById("importUrl"),
  importBtn: document.getElementById("importBtn"),
  importResult: document.getElementById("importResult"),
};

const hasServer = location.protocol.startsWith("http");
// True once we confirm the live curation API is reachable (local `node server.js`).
// On a static host (e.g. GitHub Pages) it stays false, so the import box hides.
let apiLive = false;

async function loadRecipes() {
  if (hasServer) {
    // 1. Local dev server with the live curation API.
    try {
      const r = await fetch("/api/recipes");
      if (r.ok) {
        const data = await r.json();
        ALL = data.recipes;
        apiLive = true;
        applyServerMode();
        buildProteinChips();
        render();
        return;
      }
    } catch (e) {
      /* no API here — fall through to the baked dataset */
    }
    // 2. Static host: load the curated recipes baked into the deployed bundle.
    try {
      const r = await fetch("recipes.store.json");
      if (r.ok) {
        ALL = (await r.json()).map((x) => ({ ...x, origin: "imported" }));
        applyServerMode();
        buildProteinChips();
        render();
        return;
      }
    } catch (e) {
      console.warn("Static recipe store unavailable, using embedded seed", e);
    }
  }
  // 3. file:// fallback — embedded seed only.
  ALL = (typeof RECIPES !== "undefined" ? RECIPES : []).map((r) => ({ ...r, origin: "seed" }));
  applyServerMode();
  buildProteinChips();
  render();
}

// Hide the URL-import controls unless the live curation API is running.
function applyServerMode() {
  const importBar = document.querySelector(".import");
  if (importBar && !apiLive) importBar.hidden = true;
}

function buildProteinChips() {
  els.proteinChips.innerHTML = "";
  const types = [...new Set(ALL.map((r) => r.protein_type))].sort();
  types.forEach((type) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = type;
    if (state.proteinTypes.has(type)) chip.classList.add("active");
    chip.addEventListener("click", () => {
      if (state.proteinTypes.has(type)) state.proteinTypes.delete(type);
      else state.proteinTypes.add(type);
      chip.classList.toggle("active");
      render();
    });
    els.proteinChips.appendChild(chip);
  });
}

function matches(r) {
  const m = dispMacros(r);
  if (m.kcal != null && m.kcal > state.kcalMax) return false;
  if (m.protein != null && m.protein < state.proteinMin) return false;
  if (r.activeMinutes != null && r.activeMinutes > state.timeMax) return false;
  if (state.proteinTypes.size && !state.proteinTypes.has(r.protein_type)) return false;
  if (state.bulkOnly && (r.keepsDays || 0) < 3) return false;
  if (state.search) {
    const hay = (r.title + " " + (r.tags || []).join(" ") + " " + (r.ingredients || []).join(" ")).toLowerCase();
    if (!hay.includes(state.search.toLowerCase())) return false;
  }
  return true;
}

function macroBox(num, lbl, cls = "") {
  return `<div class="macro ${cls}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
}

// Final macros to display: hybrid of standardized-ingredient totals and the
// recipe's published figures (effectiveMacros), with personal overrides applied.
function dispMacros(r) {
  if (typeof effectiveMacros === "function") {
    const m = effectiveMacros(r);
    const a = typeof adjustMacros === "function" ? adjustMacros(r) : null;
    return { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, source: m.source, adjusted: !!a, applied: (a && a.applied) || [] };
  }
  return { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, source: "published", adjusted: false, applied: [] };
}

function cardMedia(r) {
  if (r.image) return `<div class="card-photo" style="background-image:url('${r.image}')"></div>`;
  return `<div class="card-emoji">${r.emoji}</div>`;
}

function portionGrams(r) {
  if (typeof estimateBreakdown !== "function" || !r.ingredients) return null;
  const b = estimateBreakdown(r.ingredients, r.servings || 1);
  const g = b.cookedPortionGrams || b.portionGrams; // prefer cooked plate weight
  return g ? { g, approx: b.gramsApprox } : null;
}

function card(r) {
  const el = document.createElement("article");
  el.className = "card";
  const fit = r.fitScore != null ? `<span class="fit">★ ${r.fitScore}% fit</span>` : "";
  const badge = r.origin === "imported" ? `<span class="badge imported">imported</span>` : "";
  const pg = portionGrams(r);
  const m = dispMacros(r);
  el.innerHTML = `
    ${cardMedia(r)}
    <div class="card-body">
      <div class="card-title">${r.title} ${badge}</div>
      <div class="macros">
        ${macroBox(m.kcal ?? "?", "kcal", "kcal")}
        ${macroBox((m.protein ?? "?") + "g", "protein", "protein")}
        ${macroBox((r.activeMinutes ?? "?") + "m", "active")}
      </div>
      <div class="meta">
        <span class="pill">🍽️ ${r.servings} portions</span>
        ${pg ? `<span class="pill">⚖️ ${pg.approx ? "~" : ""}${pg.g} g/portion</span>` : ""}
        <span class="pill">❄️ keeps ${r.keepsDays}d</span>
        ${r.fiber != null ? `<span class="pill">🌾 ${r.fiber}g fiber</span>` : ""}
        ${fit}
      </div>
    </div>`;
  el.addEventListener("click", () => openModal(r));
  return el;
}

function render() {
  els.kcalVal.textContent = `≤ ${state.kcalMax}`;
  els.proteinVal.textContent = `≥ ${state.proteinMin}g`;
  els.timeVal.textContent = `≤ ${state.timeMax} min`;

  const list = ALL.filter(matches).sort((a, b) => (b.protein || 0) - (a.protein || 0));
  els.grid.innerHTML = "";
  if (!list.length) {
    els.grid.innerHTML = `<div class="empty">No recipes match these filters. Try loosening them or import a new one.</div>`;
  } else {
    list.forEach((r) => els.grid.appendChild(card(r)));
  }
  els.resultCount.textContent = `${list.length} of ${ALL.length} recipes`;
}

function breakdownTable(r) {
  const fn = typeof reconciledBreakdown === "function" ? reconciledBreakdown : (typeof estimateBreakdown === "function" ? estimateBreakdown : null);
  if (!fn || !r.ingredients) return "";
  const b = fn === reconciledBreakdown ? reconciledBreakdown(r) : estimateBreakdown(r.ingredients, r.servings || 1);
  const nm = (name) => (typeof foodName === "function" ? foodName(name) : name);
  const qty = (i) => (i.grams != null ? `${i.grams} g` : "—");
  const rows = b.items
    .map((i) => {
      if (i.kcal == null) return `<tr class="dim"><td>${nm(i.name)}</td><td>${qty(i)}</td><td colspan="4">${i.note || "not counted"}</td></tr>`;
      if (i.note === "seasoning") return `<tr class="dim"><td>${nm(i.name)}</td><td>${qty(i)}</td><td colspan="4">~0 (seasoning)</td></tr>`;
      return `<tr><td>${nm(i.name)}</td><td>${qty(i)}</td><td>${i.kcal}</td><td>${i.p}g</td><td>${i.c}g</td><td>${i.f}g</td></tr>`;
    })
    .join("");
  const cookedBatch = b.cookedBatchGrams && b.cookedBatchGrams !== b.batchGrams ? ` <span class="cooked">≈ ${b.cookedBatchGrams} g cooked</span>` : "";
  const cookedPortion = b.cookedPortionGrams && b.cookedPortionGrams !== b.portionGrams ? ` <span class="cooked">≈ ${b.cookedPortionGrams} g cooked</span>` : "";
  const note = (b.source === "canonical"
    ? `Totals are computed from your standardized ingredient macros (${b.confidence}% of items matched the food table). `
    : `This recipe's ingredient parse diverged from its published macros, so per-ingredient values are scaled to the published headline (the trustworthy total here). `) +
    `Quantities are as-measured (raw); the "cooked" weight estimates the finished dish (dry rice/pasta absorb water and grow; meat loses water).`;
  const label = b.source === "canonical" ? "standardized ingredients" : "scaled to published";
  return `
    <div class="section-title">Per-ingredient breakdown <span class="est">${label} · ${b.confidence}% matched</span></div>
    <table class="bd">
      <thead><tr><th>Ingredient</th><th>Qty (raw)</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td><strong>Total — all ${r.servings} portions</strong></td><td><strong>${b.batchGrams ? b.batchGrams + " g" : ""}</strong>${cookedBatch}</td><td><strong>${b.totals.kcal}</strong></td><td><strong>${b.totals.p}g</strong></td><td><strong>${b.totals.c}g</strong></td><td><strong>${b.totals.f}g</strong></td></tr>
        <tr><td><strong>Per portion</strong></td><td><strong>${b.portionGrams ? b.portionGrams + " g" : ""}</strong>${cookedPortion}</td><td><strong>${b.perPortion.kcal}</strong></td><td><strong>${b.perPortion.p}g</strong></td><td><strong>${b.perPortion.c}g</strong></td><td><strong>${b.perPortion.f}g</strong></td></tr>
      </tfoot>
    </table>
    <p class="est-note">${note}</p>`;
}

function openModal(r) {
  const photo = r.image
    ? `<div class="modal-photo" style="background-image:url('${r.image}')"></div>`
    : `<div class="modal-emoji">${r.emoji}</div>`;
  const source = r.source
    ? `<a class="source-link" href="${r.source}" target="_blank" rel="noopener">↗ View original recipe</a>`
    : "";
  const pg = portionGrams(r);
  const m = dispMacros(r);
  const val = typeof validateMacros === "function" ? validateMacros(r) : null;
  const valHtml = val
    ? `<div class="validation ${val.status}">${val.status === "ok" ? "✓" : val.status === "mismatch" ? "⚠" : "ℹ"} ${val.note}</div>`
    : "";
  const adjHtml = m.adjusted
    ? `<div class="validation ok">✓ Macros adjusted for your ingredients: ${m.applied.join(", ")}.</div>`
    : "";
  els.modalCard.innerHTML = `
    <button class="close-x" data-close>×</button>
    ${photo}
    <h2>${r.title}</h2>
    <div class="serving-line">Makes <strong>${r.servings} portions</strong>${pg ? ` · <strong>${pg.approx ? "~" : ""}${pg.g} g per portion</strong> (batch ~${pg.g * r.servings} g)` : ""} · keeps ${r.keepsDays} days${r.totalMinutes ? ` · ${r.totalMinutes} min total` : ""}${r.activeMinutes ? ` (${r.activeMinutes} active)` : ""}</div>
    ${source}
    ${adjHtml}
    ${valHtml}
    <div class="modal-macros">
      ${macroBox(m.kcal ?? "?", "kcal", "kcal")}
      ${macroBox((m.protein ?? "?") + "g", "protein", "protein")}
      ${macroBox((m.carbs ?? "?") + "g", "carbs")}
      ${macroBox((m.fat ?? "?") + "g", "fat")}
      ${r.fiber != null ? macroBox(r.fiber + "g", "fiber") : ""}
    </div>
    <div class="section-title">Ingredients (whole batch)</div>
    <ul>${r.ingredients.map((i) => `<li>${typeof gramify === "function" ? gramify(i) : i}</li>`).join("")}</ul>
    ${breakdownTable(r)}
    <div class="section-title">Method</div>
    <ol>${(r.steps || []).map((s) => `<li>${typeof gramifyText === "function" ? gramifyText(s) : s}</li>`).join("")}</ol>
    ${r.notes ? `<div class="note">💡 ${r.notes}</div>` : ""}
  `;
  els.modal.hidden = false;
}

function closeModal() { els.modal.hidden = true; }

// ---- import flow ----
async function doImport() {
  const url = els.importUrl.value.trim();
  if (!url) return;
  if (!hasServer) {
    showImport(`<span class="bad">Importing needs the server. Run <code>node server.js</code> and open http://localhost:5173</span>`);
    return;
  }
  els.importBtn.disabled = true;
  els.importBtn.textContent = "Parsing…";
  showImport(`<span class="dimtext">Fetching & parsing ${url} …</span>`);
  try {
    const resp = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    if (data.error) {
      showImport(`<span class="bad">✕ ${data.error}</span>`);
    } else {
      const { recipe, verdict } = data;
      const cls = verdict.pass ? "good" : "bad";
      const head = verdict.pass
        ? `<span class="good">✓ Added "${recipe.title}" — ${recipe.kcal}kcal / ${recipe.protein}g protein · ${verdict.fitScore}% fit</span>`
        : `<span class="bad">✕ "${recipe.title}" rejected</span>`;
      showImport(`${head}<ul class="reasons">${verdict.reasons.map((x) => `<li>${x}</li>`).join("")}</ul>`);
      if (verdict.pass) {
        els.importUrl.value = "";
        await loadRecipes();
      }
    }
  } catch (e) {
    showImport(`<span class="bad">✕ ${e.message}</span>`);
  } finally {
    els.importBtn.disabled = false;
    els.importBtn.textContent = "Import";
  }
}

function showImport(html) {
  els.importResult.innerHTML = html;
  els.importResult.hidden = false;
}

// ---- events ----
els.search.addEventListener("input", (e) => { state.search = e.target.value; render(); });
els.kcalMax.addEventListener("input", (e) => { state.kcalMax = +e.target.value; render(); });
els.proteinMin.addEventListener("input", (e) => { state.proteinMin = +e.target.value; render(); });
els.timeMax.addEventListener("input", (e) => { state.timeMax = +e.target.value; render(); });
els.bulkOnly.addEventListener("change", (e) => { state.bulkOnly = e.target.checked; render(); });
els.importBtn.addEventListener("click", doImport);
els.importUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") doImport(); });

els.modal.addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

els.reset.addEventListener("click", () => {
  state.search = ""; state.kcalMax = 650; state.proteinMin = 30; state.timeMax = 30;
  state.proteinTypes.clear(); state.bulkOnly = false;
  els.search.value = ""; els.kcalMax.value = 650; els.proteinMin.value = 30;
  els.timeMax.value = 30; els.bulkOnly.checked = false;
  [...els.proteinChips.children].forEach((c) => c.classList.remove("active"));
  render();
});

loadRecipes();

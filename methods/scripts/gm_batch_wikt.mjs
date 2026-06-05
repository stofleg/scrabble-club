/**
 * Batch : récupère les définitions Wiktionnaire pour toutes les
 * entrées GM sans def dans Firestore (rech_custom).
 *
 * Usage : node scripts/gm_batch_wikt.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { createRequire } from "module";

/* ── Config ── */
const FB_BASE = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 4;
const DELAY_MS = 150; // pause entre groupes de 4

/* ── Charger THEMODS_DATA depuis themods_data.js ── */
const src = readFileSync(new URL("../themods_data.js", import.meta.url), "utf8");
const window = {};
eval(src);
const GM_DATA = window.THEMODS_DATA.gm;

/* ── norm() ── */
function norm(w) {
  if (!w) return "";
  return w.toUpperCase()
    .replace(/Œ/g, "OE").replace(/Æ/g, "AE")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z]/g, "");
}

/* ── letterCount() ── */
function letterCount(w) {
  return w.replace(/[Œœ]/g, "OE").replace(/[Ææ]/g, "AE")
    .replace(/[^A-Za-zÀ-ÿ]/g, "").length;
}

/* ── _rechParseWikt() — copie exacte de recherche.js ── */
function parseWikt(wikitext) {
  if (!wikitext) return null;
  const frIdx = wikitext.indexOf("{{langue|fr}}");
  if (frIdx < 0) return null;
  const after = wikitext.slice(frIdx);
  const nextLang = after.slice(15).search(/\n==\s*\{\{langue\|(?!fr)/);
  const fr = nextLang > 0 ? after.slice(0, nextLang + 15) : after;

  for (const line of fr.split("\n")) {
    if (!line.startsWith("# ") || line.startsWith("## ")) continue;
    const d = line.slice(2)
      .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
      .replace(/\{\{[^}]+\}\}/g, "")
      .replace(/'''([^']+)'''/g, "$1")
      .replace(/''([^']+)''/g, "$1")
      .replace(/\s+/g, " ").trim();
    if (d) return d;
  }
  return null;
}

/* ── Firestore helpers ── */
function cvTo(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(cvTo) } };
  if (typeof val === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, v]) => [k, cvTo(v)])) } };
  return { stringValue: String(val) };
}
function cvFrom(val) {
  if (val.nullValue !== undefined) return null;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.arrayValue) return (val.arrayValue.values || []).map(cvFrom);
  if (val.mapValue) return Object.fromEntries(Object.entries(val.mapValue.fields || {}).map(([k, v]) => [k, cvFrom(v)]));
  return null;
}
function toFs(obj) { return { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, cvTo(v)])) }; }
function fromFs(doc) {
  if (!doc?.fields) return null;
  return Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, cvFrom(v)]));
}

async function fbGet(col, id) {
  try {
    const r = await fetch(`${FB_BASE}/${col}/${id}`);
    if (r.status === 404) return { ok: false, err: "not_found" };
    if (!r.ok) return { ok: false, err: "error_" + r.status };
    return { ok: true, data: fromFs(await r.json()) };
  } catch (e) { return { ok: false, err: "network" }; }
}

async function fbSet(col, id, obj) {
  try {
    const r = await fetch(`${FB_BASE}/${col}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toFs(obj))
    });
    if (r.ok) return { ok: true };
    return { ok: false, err: "error_" + r.status };
  } catch (e) { return { ok: false, err: "network" }; }
}

/* ── Wiktionnaire fetch (essaie chaque display jusqu'à trouver une déf) ── */
async function fetchWiktAny(displays) {
  for (const display of displays) {
    try {
      const url = "https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&titles=" + encodeURIComponent(display);
      const resp = await fetch(url, { headers: { "User-Agent": "METHODS-batch/1.0" } });
      const data = await resp.json();
      const page = Object.values(data.query?.pages || {})[0];
      const wikitext = page?.revisions?.[0]?.slots?.main?.["*"] || page?.revisions?.[0]?.["*"] || "";
      const def = parseWikt(wikitext);
      if (def) return def;
    } catch {}
  }
  return null;
}

/* ── Collecter les entrées GM uniques ── */
const seenCanons = new Set();
const items = [];

for (const section of GM_DATA) {
  for (const entry of (section.entries || [])) {
    const sortedForms = [...entry.forms].filter(f => f && f.trim())
      .sort((a, b) => norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0);
    if (!sortedForms.length) continue;
    const canon = norm(sortedForms[0]);
    if (seenCanons.has(canon)) continue;
    seenCanons.add(canon);
    // Toutes les graphies comme candidats Wikt (sans doublon de display)
    const seenDisp = new Set();
    const allDisplays = [];
    for (const f of sortedForms) {
      const d = f.split(",")[0].trim().toLowerCase().replace(/\*/g, "");
      if (d && !seenDisp.has(d)) { seenDisp.add(d); allDisplays.push(d); }
    }
    items.push({ canon, allDisplays, forms: entry.forms });
  }
}

console.log(`\n📚 ${items.length} entrées GM uniques\n`);
if (DRY_RUN) console.log("⚠️  Mode --dry-run : aucune écriture Firestore\n");

/* ── Traitement ── */
let processed = 0, added = 0, skipped = 0, failed = 0, errors = 0;
const missing = []; // entrées sans def Wiktionnaire

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processOne(item) {
  const { canon, allDisplays, forms } = item;

  // Vérifier Firestore
  const r = await fbGet("rech_custom", canon);
  if (r.ok && r.data?.def !== undefined) {
    skipped++;
    return;
  }
  if (r.err === "network") { errors++; return; }

  // Essayer toutes les graphies sur Wiktionnaire
  const def = await fetchWiktAny(allDisplays);

  if (!def) {
    missing.push({ canon, allDisplays, forms });
    failed++;
    return;
  }

  // Sauvegarder
  if (!DRY_RUN) {
    const existing = r.ok && r.data ? r.data : {};
    const wr = await fbSet("rech_custom", canon, { ...existing, def });
    if (!wr.ok) { errors++; return; }
  }

  added++;
}

/* ── Boucle principale ── */
for (let i = 0; i < items.length; i += CONCURRENCY) {
  const batch = items.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(processOne));
  processed = Math.min(i + CONCURRENCY, items.length);

  // Progression sur la même ligne
  process.stdout.write(
    `\r  ${processed}/${items.length}  ✓ ${added}  ⊘ ${skipped}  ✕ ${failed}  ⚠ ${errors}   `
  );

  if (i + CONCURRENCY < items.length) await sleep(DELAY_MS);
}

console.log(`\n\n✅ Terminé`);
console.log(`   ✓ ${added} définitions ajoutées`);
console.log(`   ⊘ ${skipped} déjà présentes`);
console.log(`   ✕ ${failed} sans résultat Wiktionnaire`);
if (errors) console.log(`   ⚠  ${errors} erreurs réseau`);

if (missing.length) {
  console.log(`\n📋 Mots sans définition Wiktionnaire (${missing.length}) :\n`);
  for (const { canon, allDisplays, forms } of missing) {
    console.log(`  ${forms.join(" / ")}  [${canon}]  (essayé: ${allDisplays.join(", ")})`);
  }
}

/**
 * Pour chaque entrée GM sans définition dans Firestore (rech_custom),
 * cherche si l'une de ses formes existe dans SEQODS_DATA (ODS9) et,
 * si oui, récupère la définition ODS et l'écrit dans Firestore.
 *
 * Usage : node scripts/gm_fill_from_ods.mjs [--dry-run]
 */

import { readFileSync } from "fs";

const FB_BASE = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const DRY_RUN = process.argv.includes("--dry-run");

/* ── Charger les données ── */
const window = {};
eval(readFileSync(new URL("../data.js",         import.meta.url), "utf8"));
eval(readFileSync(new URL("../themods_data.js",  import.meta.url), "utf8"));

const { c: ODS_C, f: ODS_F } = window.SEQODS_DATA;
const GM_DATA = window.THEMODS_DATA.gm;

/* ── Construire la map canon → def ODS ── */
const odsMap = new Map(); // canon → def string
for (let i = 0; i < ODS_C.length; i++) {
  const def = ODS_F?.[i];
  if (def) odsMap.set(ODS_C[i], def);
}
console.log(`\n📖 ODS : ${odsMap.size} entrées avec définition\n`);

/* ── norm() ── */
function norm(w) {
  if (!w) return "";
  return w.toUpperCase()
    .replace(/Œ/g, "OE").replace(/Æ/g, "AE")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z]/g, "");
}

function letterCount(w) {
  return w.replace(/[Œœ]/g, "OE").replace(/[Ææ]/g, "AE")
    .replace(/[^A-Za-zÀ-ÿ]/g, "").length;
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
  } catch { return { ok: false, err: "network" }; }
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
  } catch { return { ok: false, err: "network" }; }
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
    // Tous les canons de toutes les formes
    const allCanons = [...new Set(sortedForms.map(f => norm(f.split(",")[0].trim())).filter(Boolean))];
    items.push({ canon, allCanons, forms: sortedForms });
  }
}

console.log(`📚 ${items.length} entrées GM uniques`);
if (DRY_RUN) console.log("⚠️  Mode --dry-run : aucune écriture Firestore\n");

/* ── Traitement ── */
const CONCURRENCY = 8;
let processed = 0, added = 0, skipped = 0, stillMissing = 0, errors = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processOne({ canon, allCanons, forms }) {
  // Vérifier Firestore
  const r = await fbGet("rech_custom", canon);
  if (r.ok && r.data?.def !== undefined) { skipped++; return; }
  if (r.err === "network") { errors++; return; }

  // Chercher dans ODS parmi tous les canons de l'entrée
  let odsDef = null;
  for (const c of allCanons) {
    const d = odsMap.get(c);
    if (d) { odsDef = d; break; }
  }

  if (!odsDef) { stillMissing++; return; }

  if (!DRY_RUN) {
    const existing = r.ok && r.data ? r.data : {};
    const wr = await fbSet("rech_custom", canon, { ...existing, def: odsDef });
    if (!wr.ok) { errors++; return; }
  }
  added++;
}

for (let i = 0; i < items.length; i += CONCURRENCY) {
  await Promise.all(items.slice(i, i + CONCURRENCY).map(processOne));
  processed = Math.min(i + CONCURRENCY, items.length);
  process.stdout.write(
    `\r  ${processed}/${items.length}  ✓ ${added}  ⊘ ${skipped}  ✕ ${stillMissing}  ⚠ ${errors}   `
  );
}

console.log(`\n\n✅ Terminé`);
console.log(`   ✓ ${added} définitions ODS ajoutées`);
console.log(`   ⊘ ${skipped} déjà présentes dans Firestore`);
console.log(`   ✕ ${stillMissing} toujours sans définition`);
if (errors) console.log(`   ⚠  ${errors} erreurs réseau`);

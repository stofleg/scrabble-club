/**
 * Migre les documents Firestore rech_custom/{ancien_canon} → {nouveau_canon}
 * pour les 473 entrées GM où le canon alphabétique diffère du canon longueur.
 *
 * Usage : node scripts/gm_migrate_canons.mjs [--dry-run]
 */

import { readFileSync } from "fs";

const FB_BASE = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 8;

const window = {};
eval(readFileSync(new URL("../themods_data.js", import.meta.url), "utf8"));
const GM_DATA = window.THEMODS_DATA.gm;

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

/* ── Collecter les paires (ancien → nouveau) canon ── */
const migrations = [];
const seen = new Set();

for (const s of GM_DATA) {
  for (const e of (s.entries || [])) {
    const forms = (e.forms || []).filter(f => f && f.trim());
    if (forms.length < 1) continue;

    const byLen  = [...forms].sort((a, b) => letterCount(a) - letterCount(b));
    const byAlph = [...forms].sort((a, b) => norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0);

    const oldCanon = norm(byLen[0]);
    const newCanon = norm(byAlph[0]);

    if (oldCanon === newCanon || seen.has(oldCanon)) continue;
    seen.add(oldCanon);
    migrations.push({ oldCanon, newCanon });
  }
}

console.log(`\n🔄 ${migrations.length} canons à migrer`);
if (DRY_RUN) console.log("⚠️  Mode --dry-run : aucune écriture\n");
else console.log();

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Traitement ── */
let processed = 0, copied = 0, skipped = 0, errors = 0;

async function processOne({ oldCanon, newCanon }) {
  const r = await fbGet("rech_custom", oldCanon);
  if (r.err === "network") { errors++; return; }
  if (!r.ok || !r.data) { skipped++; return; } // rien dans Firestore → rien à migrer

  // Vérifier si le nouveau canon a déjà des données
  const rNew = await fbGet("rech_custom", newCanon);
  if (rNew.err === "network") { errors++; return; }

  // Fusionner : nouveau canon prend priorité si déjà renseigné
  const merged = { ...r.data, ...(rNew.ok && rNew.data ? rNew.data : {}) };

  if (!DRY_RUN) {
    const wr = await fbSet("rech_custom", newCanon, merged);
    if (!wr.ok) { errors++; return; }
  }
  copied++;
}

for (let i = 0; i < migrations.length; i += CONCURRENCY) {
  await Promise.all(migrations.slice(i, i + CONCURRENCY).map(processOne));
  processed = Math.min(i + CONCURRENCY, migrations.length);
  process.stdout.write(`\r  ${processed}/${migrations.length}  ✓ ${copied} copiés  ⊘ ${skipped} vides  ⚠ ${errors}   `);
  if (!DRY_RUN && i + CONCURRENCY < migrations.length) await sleep(50);
}

console.log(`\n\n✅ Terminé`);
console.log(`   ✓ ${copied} documents copiés vers le nouveau canon`);
console.log(`   ⊘ ${skipped} entrées sans document Firestore (rien à migrer)`);
if (errors) console.log(`   ⚠  ${errors} erreurs réseau`);

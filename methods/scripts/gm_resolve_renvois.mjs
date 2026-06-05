/**
 * Résout les renvois ODS (-->) dans les définitions GM stockées dans Firestore.
 * Stratégies :
 *  1. Résoudre la chaîne --> dans l'ODS
 *  2. Si circulaire/échoué, essayer les autres formes de l'entrée GM
 *  3. Si def mixte (contenu réel + renvoi partiel), extraire le contenu réel
 *
 * Usage : node scripts/gm_resolve_renvois.mjs [--dry-run]
 */

import { readFileSync } from "fs";

const FB_BASE = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const DRY_RUN = process.argv.includes("--dry-run");

/* ── Charger les données ── */
const window = {};
eval(readFileSync(new URL("../data.js",        import.meta.url), "utf8"));
eval(readFileSync(new URL("../themods_data.js", import.meta.url), "utf8"));

const { c: ODS_C, f: ODS_F } = window.SEQODS_DATA;
const GM_DATA = window.THEMODS_DATA.gm;

/* ── Helpers ── */
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

/* ── ODS map (canon → def brute) ── */
const rawOdsMap = new Map();
for (let i = 0; i < ODS_C.length; i++) {
  if (ODS_F?.[i]) rawOdsMap.set(ODS_C[i], ODS_F[i]);
}

/* ── Résolution de renvoi ── */
function resolveRenvoi(def, fromCanon, depth = 0) {
  if (!def || !def.includes("-->") || depth > 5) return def;
  // Extraire la cible du dernier --> (plusieurs variantes de pattern)
  const m = def.match(/-->\s*([A-Za-zÀ-ÿœæŒÆ][A-Za-zÀ-ÿœæŒÆ ''-]*?)(?:\s+(?:n\.|adj|v\.|adv|interj|art|pron|prép|conj)\b.*)?\.?\s*(?:\d+[. ].*)?$/);
  if (!m) return def;
  const target = norm(m[1].trim());
  if (!target || target === fromCanon) return def; // circulaire
  const resolved = rawOdsMap.get(target);
  if (!resolved) return def;
  if (resolved === def) return def;
  return resolveRenvoi(resolved, target, depth + 1);
}

/* ── Extraire contenu réel d'une def mixte ── */
// Ex: "1. n.m. --> aulne. 2. n.f. Anc. Mesure de longueur."
// → extraire la partie sans --> : "n.f. Anc. Mesure de longueur."
function extractRealContent(def) {
  const parts = def.split(/\d+\.\s*/g).filter(Boolean);
  const real = parts.filter(p => !p.includes("-->")).map(p => p.trim()).filter(Boolean);
  if (real.length === 0) return null;
  return real.join(" / ");
}

/* ── Collecte GM : canon → allCanons (toutes les formes) ── */
const seenCanons = new Set();
const items = [];
for (const section of GM_DATA) {
  for (const entry of (section.entries || [])) {
    const sf = [...entry.forms].filter(f => f && f.trim())
      .sort((a, b) => norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0);
    if (!sf.length) continue;
    const canon = norm(sf[0]);
    if (seenCanons.has(canon)) continue;
    seenCanons.add(canon);
    const allCanons = [...new Set(sf.map(f => norm(f.split(",")[0].trim())).filter(Boolean))];
    items.push({ canon, allCanons, forms: sf });
  }
}
// Map rapide canon → allCanons pour les lookups dans processOne
const canonToAllCanons = new Map(items.map(it => [it.canon, it.allCanons]));

console.log(`\n📚 ${items.length} entrées GM à vérifier`);
if (DRY_RUN) console.log("⚠️  Mode --dry-run : aucune écriture Firestore\n");
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

/* ── Traitement ── */
const CONCURRENCY = 8;
let processed = 0, updated = 0, skipped = 0, unresolvable = 0, errors = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processOne({ canon }) {
  const r = await fbGet("rech_custom", canon);
  if (r.err === "network") { errors++; return; }

  const currentDef = r.ok && r.data?.def;
  if (!currentDef || !currentDef.includes("-->")) { skipped++; return; }

  let newDef = null;

  // Stratégie 1 : résoudre le renvoi ODS
  const resolved = resolveRenvoi(currentDef, canon);
  if (resolved && !resolved.includes("-->") && resolved !== currentDef) {
    newDef = resolved;
  }

  // Stratégie 2 : contenu réel dans une def mixte
  if (!newDef && currentDef.match(/\d+\.\s*/)) {
    const real = extractRealContent(currentDef);
    if (real) newDef = real;
  }

  // Stratégie 3 : essayer les autres formes de l'entrée GM
  if (!newDef) {
    const allCanons = canonToAllCanons.get(canon) || [];
    for (const altCanon of allCanons) {
      if (altCanon === canon) continue;
      const altDef = rawOdsMap.get(altCanon);
      if (!altDef || altDef.includes("-->")) continue;
      newDef = altDef;
      break;
    }
  }

  if (!newDef) { unresolvable++; return; }

  if (!DRY_RUN) {
    const wr = await fbSet("rech_custom", canon, { ...r.data, def: newDef });
    if (!wr.ok) { errors++; return; }
  }
  updated++;
}

for (let i = 0; i < items.length; i += CONCURRENCY) {
  await Promise.all(items.slice(i, i + CONCURRENCY).map(processOne));
  processed = Math.min(i + CONCURRENCY, items.length);
  process.stdout.write(
    `\r  ${processed}/${items.length}  ✓ ${updated} résolus  ⊘ ${skipped} ok  ✕ ${unresolvable} non résolubles  ⚠ ${errors}   `
  );
}

console.log(`\n\n✅ Terminé`);
console.log(`   ✓ ${updated} renvois résolus et mis à jour`);
console.log(`   ⊘ ${skipped} définitions sans renvoi (ok)`);
console.log(`   ✕ ${unresolvable} renvois non résolubles`);
if (errors) console.log(`   ⚠  ${errors} erreurs réseau`);

/**
 * Pour chaque entrée GM ayant une définition résolue dans l'ODS,
 * écrit cette définition dans Firestore (priorité ODS sur Wiktionnaire).
 * Les 4 entrées sans def ODS conservent leur définition Wiktionnaire existante.
 *
 * Usage : node scripts/gm_restore_ods_defs.mjs [--dry-run]
 */

import { readFileSync } from "fs";

const FB_BASE = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 8;

/* ── Charger les données ── */
const window = {};
eval(readFileSync(new URL("../data.js",        import.meta.url), "utf8"));
eval(readFileSync(new URL("../themods_data.js", import.meta.url), "utf8"));

const { e: ODS_E, f: ODS_F } = window.SEQODS_DATA;
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

/* ── ODS map : toutes les formes affichées (e[]) → définition ── */
const rawMap = new Map();
for (let i = 0; i < ODS_E.length; i++) {
  if (!ODS_E[i] || !ODS_F?.[i]) continue;
  for (const form of ODS_E[i].split(",").map(f => f.trim()).filter(Boolean)) {
    const canon = norm(form);
    if (canon) rawMap.set(canon, ODS_F[i]);
  }
}

/* ── Résolution de renvoi ── */
function resolveRenvoi(def, fromCanon, depth = 0) {
  if (!def || !def.includes("-->") || depth > 5) return def;
  const m = def.match(/-->\s*([A-Za-zÀ-ÿœæŒÆ][A-Za-zÀ-ÿœæŒÆ ''-]*?)(?:\s+(?:n\.|adj|v\.|adv|interj|art|pron|prép|conj)\b.*)?\.?\s*(?:\d+[. ].*)?$/);
  if (!m) return def;
  const target = norm(m[1].trim());
  if (!target || target === fromCanon) return def;
  const resolved = rawMap.get(target);
  if (!resolved || resolved === def) return def;
  return resolveRenvoi(resolved, target, depth + 1);
}

/* ── Extraire contenu réel d'une def mixte ── */
function extractRealContent(def) {
  const parts = def.split(/\d+\.\s*/g).filter(Boolean);
  const real = parts.filter(p => !p.includes("-->")).map(p => p.trim()).filter(Boolean);
  return real.length ? real.join(" / ") : null;
}

/* ── Meilleure def ODS résolue pour une entrée GM ── */
function bestOdsDef(canon, allCanons) {
  // Stratégie 1 : def directe ou renvoi résolu, sur chaque canal
  for (const c of allCanons) {
    const raw = rawMap.get(c); if (!raw) continue;
    if (!raw.includes("-->")) return raw;
    const res = resolveRenvoi(raw, c);
    if (res && !res.includes("-->")) return res;
    if (raw.match(/\d+\.\s*/)) {
      const r = extractRealContent(raw);
      if (r) return r;
    }
  }
  // Stratégie 2 : forme alternative sans renvoi
  for (const c of allCanons) {
    const altDef = rawMap.get(c);
    if (altDef && !altDef.includes("-->")) return altDef;
  }
  return null;
}

/* ── Collecter les entrées GM ── */
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
    const odsDef = bestOdsDef(canon, allCanons);
    if (odsDef) items.push({ canon, odsDef });
    // Sinon : pas d'entrée → on ne touche pas à Firestore (garde Wiktionnaire)
  }
}

console.log(`\n📚 ${items.length} entrées GM avec def ODS à écrire`);
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
let processed = 0, written = 0, errors = 0;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processOne({ canon, odsDef }) {
  if (DRY_RUN) { written++; return; }
  // Lire pour préserver les autres champs (excl, etc.)
  const r = await fbGet("rech_custom", canon);
  if (r.err === "network") { errors++; return; }
  const existing = r.ok && r.data ? r.data : {};
  const wr = await fbSet("rech_custom", canon, { ...existing, def: odsDef });
  if (!wr.ok) { errors++; return; }
  written++;
}

for (let i = 0; i < items.length; i += CONCURRENCY) {
  await Promise.all(items.slice(i, i + CONCURRENCY).map(processOne));
  processed = Math.min(i + CONCURRENCY, items.length);
  process.stdout.write(`\r  ${processed}/${items.length}  ✓ ${written}  ⚠ ${errors}   `);
  if (!DRY_RUN && i + CONCURRENCY < items.length) await sleep(50);
}

console.log(`\n\n✅ Terminé`);
console.log(`   ✓ ${written} définitions ODS écrites`);
if (errors) console.log(`   ⚠  ${errors} erreurs réseau`);

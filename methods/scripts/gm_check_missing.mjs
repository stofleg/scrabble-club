import { readFileSync } from "fs";

const FB = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";

const src = readFileSync(new URL("../themods_data.js", import.meta.url), "utf8");
const window = {};
eval(src);
const GM = window.THEMODS_DATA.gm;

function letterCount(w) {
  return w.replace(/[Œœ]/g,"OE").replace(/[Ææ]/g,"AE").replace(/[^A-Za-zÀ-ÿ]/g,"").length;
}
function norm(w) {
  if (!w) return "";
  return w.toUpperCase()
    .replace(/Œ/g,"OE").replace(/Æ/g,"AE")
    .normalize("NFD").replace(/[̀-ͯ]/g,"")
    .replace(/[^A-Z]/g,"");
}

async function fbGetDef(canon) {
  try {
    const r = await fetch(`${FB}/rech_custom/${encodeURIComponent(canon)}`);
    if (r.status === 404) return null;
    if (!r.ok) return undefined;
    const d = await r.json();
    const v = d?.fields?.def?.stringValue;
    return (v !== undefined) ? v : null;
  } catch { return undefined; }
}

// Build item list
const seen = new Set(), items = [];
for (const s of GM) {
  for (const e of (s.entries || [])) {
    const sf = [...e.forms].filter(f => f && f.trim()).sort((a,b) => norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0);
    if (!sf.length) continue;
    const canon = norm(sf[0]);
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    items.push({ canon, forms: sf });
  }
}

// Check Firestore in batches of 10
const BATCH = 10;
const missing = [], errors = [];
let done = 0;

for (let i = 0; i < items.length; i += BATCH) {
  const batch = items.slice(i, i + BATCH);
  const results = await Promise.all(batch.map(it => fbGetDef(it.canon)));
  for (let j = 0; j < batch.length; j++) {
    const def = results[j];
    if (def === undefined) errors.push(batch[j]);
    else if (!def) missing.push(batch[j]);
  }
  done += batch.length;
  process.stderr.write(`\r  ${done}/${items.length}  manquants: ${missing.length}`);
}
process.stderr.write("\n\n");

console.log(`Total entrées GM : ${items.length}`);
console.log(`Avec définition  : ${items.length - missing.length - errors.length}`);
console.log(`Sans définition  : ${missing.length}`);
if (errors.length) console.log(`Erreurs réseau   : ${errors.length}`);
console.log("");

if (missing.length) {
  console.log(`=== Mots sans définition (${missing.length}) ===\n`);
  missing.forEach(it => console.log(it.forms.join(" / ")));
}
if (errors.length) {
  console.log(`\n=== Erreurs réseau (${errors.length}) ===\n`);
  errors.forEach(it => console.log(it.canon));
}

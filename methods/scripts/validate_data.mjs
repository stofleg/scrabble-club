#!/usr/bin/env node
/**
 * Validation de l'intégrité des fichiers de données locaux.
 * À lancer après toute modification manuelle de themods_data.js ou ods_data.js.
 *
 * Usage: node scripts/validate_data.mjs
 */

import { readFileSync } from "fs";
import { createContext, runInContext } from "vm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let ok = true;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    console.error(`  ✗ ${label}: ${e.message}`);
    ok = false;
  }
}

function loadFile(rel) {
  const ctx = { window: {} };
  createContext(ctx);
  runInContext(readFileSync(join(ROOT, rel), "utf8"), ctx);
  return ctx.window;
}

/* ── themods_data.js ── */
console.log("\nthemods_data.js");
const tm = loadFile("themods_data.js");
check("window.THEMODS_DATA is object", () => {
  if (!tm.THEMODS_DATA || typeof tm.THEMODS_DATA !== "object")
    throw new Error("missing or wrong type");
});
check("THEMODS_DATA.gm is array", () => {
  if (!Array.isArray(tm.THEMODS_DATA?.gm))
    throw new Error("gm is not an array");
});
check("THEMODS_DATA.gm non-empty", () => {
  if (tm.THEMODS_DATA.gm.length === 0)
    throw new Error("gm is empty");
});
check("Initialisation line is '='", () => {
  const src = readFileSync(join(ROOT, "themods_data.js"), "utf8");
  if (/window\.\w+\s*-->/.test(src.slice(0, 50)))
    throw new Error("Line 1 uses '-->' operator instead of '='");
});

/* ── ods_data.js ── */
console.log("\nods_data.js");
// ods_data.js extends THEMODS_DATA — load themods_data first
const ods_ctx = { window: {} };
createContext(ods_ctx);
runInContext(readFileSync(join(ROOT, "themods_data.js"), "utf8"), ods_ctx);
runInContext(readFileSync(join(ROOT, "ods_data.js"), "utf8"), ods_ctx);
const od = ods_ctx.window;

check("THEMODS_DATA still valid after ods_data.js", () => {
  if (!od.THEMODS_DATA || typeof od.THEMODS_DATA !== "object")
    throw new Error("THEMODS_DATA destroyed by ods_data.js");
});
check("THEMODS_DATA.gm still array after ods_data.js", () => {
  if (!Array.isArray(od.THEMODS_DATA?.gm))
    throw new Error("gm destroyed by ods_data.js");
});
check("Initialisation line is '='", () => {
  const src = readFileSync(join(ROOT, "ods_data.js"), "utf8");
  if (/window\.\w+\s*-->/.test(src.slice(0, 50)))
    throw new Error("Line 1 uses '-->' operator instead of '='");
});

/* ── data.js (structure minimale) ── */
console.log("\ndata.js (structure)");
check("Initialisation line is '='", () => {
  const src = readFileSync(join(ROOT, "data.js"), "utf8");
  // Check only the first 50 chars for the --> operator pattern
  const head = src.slice(0, 50);
  if (/window\.\w+\s*-->/.test(head))
    throw new Error(`Line 1 uses '-->' operator instead of '=': ${head}`);
});

/* ── Résumé ── */
console.log();
if (ok) {
  console.log("✅ Tous les fichiers de données sont valides.\n");
  process.exit(0);
} else {
  console.error("❌ Des erreurs ont été détectées.\n");
  process.exit(1);
}

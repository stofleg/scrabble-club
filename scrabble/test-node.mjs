// Test rapide en Node — vérifie scoring + top finder sur cas connus
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger les modules
const { Dictionary } = await import("./dictionary.js");
const { emptyBoard, scoreMove, applyMove, BOARD_BONUSES, LETTER_BAG, drawRack } = await import("./engine.js");
const { findTop } = await import("./topfinder.js");

// Monkey-patch fetch pour Node
globalThis.fetch = async (url) => {
  const path = join(__dirname, url);
  return { ok: true, text: async () => readFileSync(path, "utf8") };
};
globalThis.performance = { now: () => Number(process.hrtime.bigint() / 1000000n) };

const dict = new Dictionary();
await dict.load("ods9.txt");
console.log();

// --- Test 1 : validation de mots ---
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${actual} (attendu: ${expected})`);
}
console.log("=== Validation dictionnaire ===");
check('has("MUSIQUE")', dict.has("MUSIQUE"), true);
check('has("ZQXJK")', dict.has("ZQXJK"), false);
check('has("AZTEQUE")', dict.has("AZTEQUE"), true);
check('hasPrefix("SCRAB")', dict.hasPrefix("SCRAB"), true);
check('hasPrefix("XQZ")', dict.hasPrefix("XQZ"), false);

// --- Test 2 : scoring d'un coup connu ---
console.log("\n=== Scoring ===");
// MUSIQUE sur plateau vide en partant de (7,7) horizontal
let board = emptyBoard();
let move = { word: "MUSIQUE", row: 7, col: 7, dir: "H", blanks: [] };
let r = scoreMove(board, move, dict);
// M(2)+U(1)+S(1)+I(1)+Q(8 sur DL→16)+U(1)+E(1) = 23, ×2 (centre DW) = 46, +bonus 7 lettres ? non MUSIQUE = 7 lettres → +50 = 96
console.log(`MUSIQUE en (7,7) H → score=${r.score}, mots=${r.words.map(w => w.word+"("+w.score+")").join(",")}, errs=${r.errors.join("|")}`);

// --- Test 3 : top finder sur plateau vide avec MUSIQUE en chevalet ---
console.log("\n=== Top finder, plateau vide, rack=MUSIQUE ===");
let t0 = performance.now();
let top = findTop(emptyBoard(), "MUSIQUE".split(""), dict);
let t1 = performance.now();
console.log(`Top: ${top?.move.word} (${top?.score} pts) en ${(t1-t0).toFixed(0)} ms`);
console.log(`Position: ${top?.move.dir} (${top?.move.row},${top?.move.col})`);

// --- Test 4 : top finder sur plateau vide avec quelques tirages ---
console.log("\n=== Benchmark top finder (5 tirages aléatoires) ===");
for (let i = 0; i < 5; i++) {
  const { rack } = drawRack({ ...LETTER_BAG }, 7, { minVowels: 2, minConsonants: 2 });
  t0 = performance.now();
  const top = findTop(emptyBoard(), rack, dict);
  t1 = performance.now();
  console.log(`  ${rack.join("")} → ${top?.move.word || "—"} (${top?.score || 0} pts) en ${(t1-t0).toFixed(0)} ms`);
}

// --- Test 5 : top finder sur plateau non vide ---
console.log("\n=== Top finder, plateau avec MUSIQUE déjà posé, rack=ABCDEFG ===");
board = applyMove(emptyBoard(), { word: "MUSIQUE", row: 7, col: 7, dir: "H", blanks: [] });
t0 = performance.now();
top = findTop(board, "ABCDEFG".split(""), dict);
t1 = performance.now();
console.log(`Top: ${top?.move.word || "—"} (${top?.score || 0} pts) en ${(t1-t0).toFixed(0)} ms`);
console.log("Plateau :");
for (let r = 5; r < 10; r++) {
  let s = "";
  for (let c = 5; c < 13; c++) s += (board[r][c]?.letter || ".") + " ";
  console.log("  " + s);
}

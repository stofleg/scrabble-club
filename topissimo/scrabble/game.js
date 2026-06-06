// Détection mode app (PWA standalone/fullscreen/minimal-ui)
(function () {
  const isApp =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true;
  if (isApp) document.body.classList.add("app-mode");
})();

// ============================================================
//  La Garenna — Jeu Scrabble (mode entraînement)
//
//  Boucle :
//    - Tirage aléatoire (7 lettres, min voyelles/consonnes)
//    - Le top est calculé en arrière-plan
//    - Le joueur clique sur la grille → curseur (H, ou V au 2e clic)
//    - Il tape son mot, les jetons sortent du chevalet
//    - Entrée valide :
//        si score == top : on enregistre, on passe au coup suivant
//                          (top placé sur le plateau)
//        sinon : feedback, on garde le tirage, on peut réessayer
//                ou cliquer "Voir le top" pour révéler & passer
// ============================================================

import {
  emptyBoard, BOARD_BONUSES, BOARD_SIZE, LETTER_VALUE, LETTER_BAG,
  VOWELS, drawForDuplicate, scoreMove, applyMove,
  bagTotalVowels, bagTotalConsonants, GAME_MODES, modeDisplayName,
} from "./engine.js";
import { Dictionary } from "./dictionary.js";
import { findTop, findTopRanked } from "./topfinder.js";

// État du mode review (parcours coup par coup)
const review = {
  active: false,
  game: null,           // prepared_games row
  result: null,         // prepared_game_results row (peut être null)
  historyByMove: {},    // moveNo → entrée du joueur
  step: 1,              // coup courant affiché (1..N)
};

// ============================================================
//  État
// ============================================================
// Modes d'accès via URL :
//   ?prepared=ID → jouer la partie pré-tirée
//   ?review=ID   → revoir une partie déjà jouée (lecture seule)
const URL_PARAMS = new URLSearchParams(location.search);
const PREPARED_ID = URL_PARAMS.get("prepared");
const REVIEW_ID = URL_PARAMS.get("review");
const TRAINING_ID = URL_PARAMS.get("training");
const PUZZLE_GAME_ID = URL_PARAMS.get("puzzle");
const PUZZLE_MOVE_NO = +URL_PARAMS.get("move") || 1;

const state = {
  dict: null,
  bag: { ...LETTER_BAG },
  board: emptyBoard(),
  rack: [],           // array of {letter, used:bool, id}
  // Partie pré-tirée
  prepared: null,     // { id, name, mode, withJoker, timePerMove, moves: [...] }
  preparedIdx: 0,     // index du prochain coup à jouer
  cursor: null,       // {row, col, dir:"H"|"V"} ou null
  pending: [],        // [{row, col, letter, rackId, isBlank}]
  jokerPending: false,// vrai si on attend la lettre à associer au ?
  topMove: null,      // {score, move, words}
  moveNo: 1,
  totalScore: 0,
  sumNeg: 0,
  // Chrono global
  started: false,
  chronoStart: null,
  chronoPenalty: 0,
  chronoFinal: null,
  // Chrono par coup
  moveStart: null,            // performance.now() au début du coup
  moveTimeLeft: 0,            // secondes restantes (si timePerMove > 0)
  // Surbrillance du dernier coup
  lastPlaced: [],             // [{row, col}]
  // Historique pour feuille de route
  history: [],                // [{moveNo, rack, top, played, score, isTop, timeMs, status}]
  // Mode joker : nb de jokers "actifs" restants (2 au départ en mode joker)
  spareJokers: 0,
  // Meilleur essai sur le coup courant (réinitialisé à chaque coup)
  bestAttempt: null,          // { word, score }
  // Annotations sur la grille (mode entraînement)
  annotations: {},            // "r,c" → { tl, tr, bl, br, center, dot }
  arrowAnnotations: [],       // [{fromR, fromC, toR, toC}]
  annotTool: "",              // outil sélectionné dans la toolbar
  settings: loadSettings(),
};

function loadSettings() {
  const defaults = {
    rackPos: "bottom", sortRack: false, showCoords: true,
    timePerMove: 0, gameMode: "duplicate", withJoker: false,
    colorTheme: "classic",
  };
  try {
    return Object.assign(defaults, JSON.parse(localStorage.getItem("scrabbleSettings") || "{}"));
  } catch { return defaults; }
}
async function loadSettingsFromSupabase() {
  const pid = +(localStorage.getItem("currentPlayerId") || 0);
  if (!pid) return;
  if (!window._sb) await loadSupabaseClient();
  const { data, error } = await window._sb.from("players").select("settings").eq("id", pid).maybeSingle();
  if (error || !data?.settings) return;
  Object.assign(state.settings, data.settings);
  saveSettings();              // miroir local
  applyRackPos();
  applyColorTheme();
  renderRack();
  renderBoard();
  renderGameTitle();
}
async function saveSettingsToSupabase() {
  const pid = +(localStorage.getItem("currentPlayerId") || 0);
  if (!pid) return;
  if (!window._sb) await loadSupabaseClient();
  // On ne pousse que les préférences UI (pas la durée/mode imposés par un tournoi)
  const persisted = {
    rackPos: state.settings.rackPos,
    sortRack: state.settings.sortRack,
    showCoords: state.settings.showCoords,
    colorTheme: state.settings.colorTheme,
  };
  await window._sb.from("players").update({ settings: persisted }).eq("id", pid);
}

function currentMode() {
  return GAME_MODES[state.settings.gameMode] || GAME_MODES.duplicate;
}
function saveSettings() {
  localStorage.setItem("scrabbleSettings", JSON.stringify(state.settings));
}

// ============================================================
//  Helpers DOM
// ============================================================
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const bonusClass = (ch) => ({
  ".":"normal", "d":"dl", "t":"tl", "D":"dw", "T":"tw", "*":"center"
}[ch] || "normal");
const bonusLabel = (ch) => ({
  "d":"LD", "t":"LT", "D":"MD", "T":"MT",
}[ch] || "");

function tileHtml(letter, value, opts = {}) {
  const cls = ["tile"];
  if (opts.blank) cls.push("blank");
  if (opts.pending) cls.push("pending");
  if (opts.used) cls.push("used");
  if (opts.empty) cls.push("empty");
  if (opts.empty) return `<div class="${cls.join(" ")}"></div>`;
  return `<div class="${cls.join(" ")}">${letter || ""}<span class="val">${value ?? ""}</span></div>`;
}

// ============================================================
//  Rendu
// ============================================================
const ROW_LETTERS = "ABCDEFGHIJKLMNO";

function renderBoard() {
  const div = $("#board");
  const showCoords = state.settings.showCoords;
  let html = "<table>";
  if (showCoords) {
    html += `<tr><td class="coord corner"></td>`;
    for (let c = 0; c < BOARD_SIZE; c++) html += `<td class="coord">${c + 1}</td>`;
    html += `<td class="coord corner"></td></tr>`;
  }
  for (let r = 0; r < BOARD_SIZE; r++) {
    html += "<tr>";
    if (showCoords) html += `<td class="coord">${ROW_LETTERS[r]}</td>`;
    for (let c = 0; c < BOARD_SIZE; c++) {
      const bonus = BOARD_BONUSES[r][c];
      const cls = [bonusClass(bonus)];
      const tile = cellTile(r, c);
      if (tile) cls.push("has-tile");
      const isCursor = state.cursor && state.cursor.row === r && state.cursor.col === c;
      if (isCursor) cls.push("cursor", state.cursor.dir === "H" ? "dir-h" : "dir-v");
      if (state.lastPlaced.some(p => p.row === r && p.col === c)) cls.push("last-placed");
      let tileHtmlStr = "";
      if (tile) {
        const tcls = ["tile"];
        if (tile.isBlank) tcls.push("blank");
        if (tile.pending) tcls.push("pending");
        const tval = tile.isBlank ? "" : LETTER_VALUE[tile.letter];
        // Les tuiles "pending" sont draggables (pour les déplacer)
        const dragAttr = tile.pending ? `draggable="true" data-pending-r="${r}" data-pending-c="${c}"` : "";
        tileHtmlStr = `<div class="${tcls.join(" ")}" ${dragAttr}>${tile.letter}<span class="val">${tval ?? ""}</span></div>`;
      }
      // Badge de score live au-dessus de la dernière lettre du mot
      let badge = "";
      const bc = badgeCell();
      if (bc && bc.row === r && bc.col === c) {
        const sc = computePendingScore();
        if (sc !== null) badge = `<span class="score-badge">${sc}</span>`;
      }
      const annot = renderAnnotations(r, c);
      html += `<td class="${cls.join(" ")}" data-r="${r}" data-c="${c}">${tileHtmlStr}${badge}${annot}</td>`;
    }
    if (showCoords) html += `<td class="coord">${ROW_LETTERS[r]}</td>`;
    html += "</tr>";
  }
  if (showCoords) {
    html += `<tr><td class="coord corner"></td>`;
    for (let c = 0; c < BOARD_SIZE; c++) html += `<td class="coord">${c + 1}</td>`;
    html += `<td class="coord corner"></td></tr>`;
  }
  html += "</table>";
  div.innerHTML = html;
  div.querySelectorAll("td[data-r]").forEach(td => {
    const r = +td.dataset.r, c = +td.dataset.c;
    td.onclick = () => handleBoardClick(r, c);
    td.addEventListener("contextmenu", (e) => { e.preventDefault(); handleBoardRightClick(r, c); });
    td.addEventListener("dragover", onCellDragOver);
    td.addEventListener("dragleave", onCellDragLeave);
    td.addEventListener("drop", onCellDrop);
    td.addEventListener("mousedown", (e) => onCellMouseDown(e, r, c));
    td.addEventListener("mouseup",   (e) => onCellMouseUp(e, r, c));
  });
  // Tuiles "pending" sur le plateau : draggables pour déplacement
  div.querySelectorAll(".tile[data-pending-r]").forEach(el => {
    el.addEventListener("dragstart", onPendingTileDragStart);
    el.addEventListener("dragend", onDragEnd);
  });
}

// Renvoie la tuile à afficher en (r,c) : prioritaire pending, sinon plateau
function cellTile(r, c) {
  const pending = state.pending.find(p => p.row === r && p.col === c);
  if (pending) {
    return { letter: pending.letter, isBlank: pending.isBlank, pending: true };
  }
  return state.board[r][c];
}

function renderRack() {
  const div = $("#rack");
  if (state.rack.length === 0 && !state.started) {
    const size = currentMode().rackSize;
    div.innerHTML = Array.from({ length: size }, () => `<div class="tile empty"></div>`).join("");
    return;
  }
  let tiles = [...state.rack];
  // _tempUnsorted : override transitoire (F1 / drag-reorder) qui ignore le tri pour ce render
  if (state.settings.sortRack && !state._tempUnsorted) {
    tiles.sort((a, b) => {
      if (a.letter === "?" && b.letter !== "?") return 1;
      if (b.letter === "?" && a.letter !== "?") return -1;
      return a.letter.localeCompare(b.letter);
    });
  }
  // Génère les tuiles draggables
  div.innerHTML = tiles.map(t => {
    const blank = t.letter === "?";
    const val = blank ? "" : LETTER_VALUE[t.letter];
    const cls = ["tile"];
    if (t.used) cls.push("used");
    if (blank) cls.push("blank");
    const draggable = t.used ? "" : `draggable="true" data-rack-id="${t.id}"`;
    return `<div class="${cls.join(" ")}" ${draggable}>${t.letter || ""}<span class="val">${val ?? ""}</span></div>`;
  }).join("");
  // Bind handlers DnD
  div.querySelectorAll(".tile[data-rack-id]").forEach(el => {
    el.addEventListener("dragstart", onRackTileDragStart);
    el.addEventListener("dragend", onDragEnd);
    el.addEventListener("dragover", onRackTileDragOver);
    el.addEventListener("drop", onRackTileDrop);
  });
}

// ===== Drag & Drop : chevalet + tuiles posées =====
let _dragRackId = null;
let _dragPendingFrom = null;     // { row, col } pour déplacement d'une tuile pending

function onRackTileDragStart(e) {
  _dragRackId = +e.currentTarget.dataset.rackId;
  _dragPendingFrom = null;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(_dragRackId));
  e.currentTarget.classList.add("dragging");
}
function onPendingTileDragStart(e) {
  const r = +e.currentTarget.dataset.pendingR;
  const c = +e.currentTarget.dataset.pendingC;
  _dragPendingFrom = { row: r, col: c };
  _dragRackId = null;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", `pending:${r},${c}`);
  e.currentTarget.classList.add("dragging");
}
function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  _dragRackId = null;
  _dragPendingFrom = null;
  $$(".board td.drop-target").forEach(td => td.classList.remove("drop-target"));
}
function onRackTileDragOver(e) {
  if (_dragRackId == null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
function onRackTileDrop(e) {
  if (_dragRackId == null) return;
  e.preventDefault();
  const targetId = +e.currentTarget.dataset.rackId;
  if (targetId === _dragRackId) return;
  // Réordonner state.rack : déplacer la tuile draguée avant la tuile cible
  const srcIdx = state.rack.findIndex(t => t.id === _dragRackId);
  const dstIdx = state.rack.findIndex(t => t.id === targetId);
  if (srcIdx < 0 || dstIdx < 0) return;
  const [moved] = state.rack.splice(srcIdx, 1);
  const adjustedDst = dstIdx > srcIdx ? dstIdx : dstIdx;   // après suppression, dstIdx peut avoir bougé
  // Insérer avant la cible (ou après si on dragge vers la droite)
  const newIdx = state.rack.indexOf(state.rack.find(t => t.id === targetId));
  state.rack.splice(newIdx, 0, moved);
  state._tempUnsorted = true;
  renderRack();
}

// Drop sur une case de la grille = pose la lettre tirée du chevalet
function onCellDragOver(e) {
  if (_dragRackId == null && !_dragPendingFrom) return;
  const td = e.currentTarget;
  const r = +td.dataset.r, c = +td.dataset.c;
  // Cible doit être vide (ni committed, ni pending — sauf si on déplace une tuile sur sa propre case)
  if (state.board[r][c]) return;
  const occupiedByOtherPending = state.pending.some(p =>
    p.row === r && p.col === c &&
    !(_dragPendingFrom && p.row === _dragPendingFrom.row && p.col === _dragPendingFrom.col)
  );
  if (occupiedByOtherPending) return;
  e.preventDefault();
  td.classList.add("drop-target");
}
function onCellDragLeave(e) {
  e.currentTarget.classList.remove("drop-target");
}
function onCellDrop(e) {
  if (_dragRackId == null && !_dragPendingFrom) return;
  e.preventDefault();
  const td = e.currentTarget;
  td.classList.remove("drop-target");
  const r = +td.dataset.r, c = +td.dataset.c;
  // ===== Déplacement d'une tuile pending =====
  if (_dragPendingFrom) {
    const src = _dragPendingFrom;
    if (state.board[r][c]) return;
    if (src.row === r && src.col === c) return;
    const occupiedByOther = state.pending.some(p => p.row === r && p.col === c);
    if (occupiedByOther) return;
    const tile = state.pending.find(p => p.row === src.row && p.col === src.col);
    if (!tile) return;
    tile.row = r;
    tile.col = c;
    updateCursorAfterDrop(r, c);
    renderBoard();
    return;
  }
  // ===== Pose depuis le chevalet =====
  if (state.board[r][c] || state.pending.some(p => p.row === r && p.col === c)) return;
  const tile = state.rack.find(t => t.id === _dragRackId);
  if (!tile || tile.used) return;
  let letter = tile.letter, isBlank = false;
  if (tile.letter === "?") {
    const L = (prompt("Lettre à associer au joker (A-Z) :", "") || "").trim().toUpperCase();
    if (!/^[A-Z]$/.test(L)) return;
    letter = L; isBlank = true;
  }
  tile.used = true;
  state.pending.push({ row: r, col: c, letter, rackId: tile.id, isBlank });
  updateCursorAfterDrop(r, c);
  renderBoard();
  renderRack();
}

// Repositionne le curseur en déduisant le sens H/V d'après les tuiles posées.
// Saute par-dessus les lettres committées et pending sur le chemin.
function updateCursorAfterDrop(r, c) {
  const pending = state.pending;
  if (pending.length === 0) return;
  let row, col, dir;
  if (pending.length === 1) {
    row = r; col = c + 1; dir = "H";
  } else {
    const sameRow = pending.every(p => p.row === pending[0].row);
    const sameCol = pending.every(p => p.col === pending[0].col);
    if (sameRow) {
      row = pending[0].row;
      col = Math.max(...pending.map(p => p.col)) + 1;
      dir = "H";
    } else if (sameCol) {
      col = pending[0].col;
      row = Math.max(...pending.map(p => p.row)) + 1;
      dir = "V";
    } else {
      return; // non aligné, on laisse
    }
  }
  // Sauter les cases occupées (committées ou pending) dans la direction du jeu
  const dr = dir === "V" ? 1 : 0;
  const dc = dir === "H" ? 1 : 0;
  while (row < BOARD_SIZE && col < BOARD_SIZE && (state.board[row]?.[col] || state.pending.some(p => p.row === row && p.col === col))) {
    row += dr; col += dc;
  }
  if (row < BOARD_SIZE && col < BOARD_SIZE) state.cursor = { row, col, dir };
}

function shuffleRack() {
  const idxs = state.rack.map((t, i) => t.used ? -1 : i).filter(i => i >= 0);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.rack[idxs[i]], state.rack[idxs[j]]] = [state.rack[idxs[j]], state.rack[idxs[i]]];
  }
  state._tempUnsorted = true;   // override le tri alpha pour montrer le mélange
  renderRack();
}
function restoreRackSort() {
  // Tri alpha forcé (indépendant du réglage sortRack) : F2 doit toujours ranger.
  const free = state.rack.map((t, i) => ({ t, i })).filter(x => !x.t.used);
  free.sort((a, b) => (a.t.letter === "?" ? "ZZ" : a.t.letter).localeCompare(
                       b.t.letter === "?" ? "ZZ" : b.t.letter));
  let k = 0;
  for (let i = 0; i < state.rack.length; i++) {
    if (!state.rack[i].used) { state.rack[i] = free[k++].t; }
  }
  state._tempUnsorted = false;
  renderRack();
}

function renderInfo() {
  const moveNoEl = document.getElementById("moveNo");
  if (moveNoEl) moveNoEl.textContent = state.moveNo;
  $("#totalScore").textContent = state.totalScore;
  $("#sumNeg").textContent = state.sumNeg;
  // Section "coup précédent"
  const last = state.history?.[state.history.length - 1];
  const prevNoEl = document.getElementById("prevMoveNo");
  const prevNegEl = document.getElementById("prevNeg");
  const prevTimeEl = document.getElementById("prevTime");
  if (prevNoEl)   prevNoEl.textContent   = last ? last.moveNo : "—";
  if (prevNegEl)  prevNegEl.textContent  = last ? last.neg : "—";
  if (prevTimeEl) prevTimeEl.textContent = last ? fmtChrono(Math.round((last.timeMs || 0) / 1000)) : "—";
  renderChrono();
  renderMoveTimer();
  renderBag();
}

const VOYELLES_SET = ["A","E","I","O","U","Y"];
function renderBag() {
  const el = $("#bagDisplay");
  if (!el) return;
  if (!state.started || review.active) { el.hidden = true; return; }
  el.hidden = false;
  const counts = { ...state.bag };
  if (state.settings.withJoker && state.spareJokers > 0) {
    counts["?"] = (counts["?"] || 0) + state.spareJokers;
  }
  const allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const consonnes = allLetters.filter(l => !VOYELLES_SET.includes(l));
  const ordered = [...VOYELLES_SET, ...consonnes, "?"];
  const total = Object.values(counts).reduce((a, n) => a + (n > 0 ? n : 0), 0);
  $("#bagCount").textContent = total;
  $("#bagTiles").innerHTML = ordered.map(l => {
    const n = counts[l] || 0;
    if (n === 0) return "";
    const cls = ["bag-chip"];
    if (l === "?") cls.push("joker");
    return `<span class="${cls.join(" ")}">${l}<span class="ct">${n}</span></span>`;
  }).join("");
}

// Case où placer le badge de score (rightmost en H, bottommost en V, sinon dernière posée).
// On essaie d'éviter une case déjà occupée par un jeton (mieux lisible) : on avance
// d'une case dans la direction du mot vers une case libre ; à défaut on prend la case
// avant le mot ; si rien de libre n'est trouvé, on retombe sur la dernière case pending.
function badgeCell() {
  if (!state.pending.length) return null;
  const sameRow = state.pending.every(p => p.row === state.pending[0].row);
  const sameCol = state.pending.every(p => p.col === state.pending[0].col);
  let endCell, dr, dc;
  if (sameRow) {
    endCell = state.pending.reduce((a, b) => a.col > b.col ? a : b);
    dr = 0; dc = 1;
  } else if (sameCol) {
    endCell = state.pending.reduce((a, b) => a.row > b.row ? a : b);
    dr = 1; dc = 0;
  } else {
    return state.pending[state.pending.length - 1];
  }
  // Cherche la 1re case libre après la fin du mot
  for (let i = 1; i < BOARD_SIZE; i++) {
    const r = endCell.row + i * dr, c = endCell.col + i * dc;
    if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) break;
    if (!state.board[r][c] && !state.pending.some(p => p.row === r && p.col === c)) {
      return { row: r, col: c };
    }
  }
  // Sinon : cherche avant le début du mot
  const startCell = sameRow
    ? state.pending.reduce((a, b) => a.col < b.col ? a : b)
    : state.pending.reduce((a, b) => a.row < b.row ? a : b);
  for (let i = 1; i < BOARD_SIZE; i++) {
    const r = startCell.row - i * dr, c = startCell.col - i * dc;
    if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) break;
    if (!state.board[r][c] && !state.pending.some(p => p.row === r && p.col === c)) {
      return { row: r, col: c };
    }
  }
  // Aucun emplacement libre adjacent : fallback sur la fin du mot
  return endCell;
}

function computePendingScore() {
  if (state.pending.length === 0) return null;
  const m = buildMoveFromPending();
  if (!m) return null;
  const r = scoreMove(state.board, m, null);
  if (r.errors.length) return null;
  return r.score;
}

function renderMoveTimer() {
  const chip = $("#moveTimerChip");
  const el = $("#moveTimer");
  const label = $("#moveTimerLabel");
  if (!el || !chip) return;
  if (label) label.textContent = `Coup ${state.moveNo}`;
  if (state.settings.timePerMove > 0 && state.started && !state.chronoFinal) {
    el.textContent = `${state.moveTimeLeft}s`;
    chip.classList.toggle("danger", state.moveTimeLeft <= 10);
    chip.style.display = "";
  } else {
    chip.style.display = "none";
  }
}

function elapsedSeconds() {
  if (state.chronoFinal !== null) return state.chronoFinal;
  if (!state.started || !state.chronoStart) return 0;
  return Math.floor((Date.now() - state.chronoStart) / 1000) + state.chronoPenalty;
}

function fmtChrono(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function renderChrono() {
  $("#chrono").textContent = fmtChrono(elapsedSeconds());
}

let chronoTimer = null;
function startChrono() {
  state.chronoStart = Date.now();
  if (chronoTimer) clearInterval(chronoTimer);
  chronoTimer = setInterval(renderChrono, 1000);
}
function stopChrono() {
  state.chronoFinal = elapsedSeconds();
  clearInterval(chronoTimer);
  chronoTimer = null;
}

// ===== Minuteur par coup =====
let moveTimer = null;
function startMoveTimer() {
  state.moveStart = performance.now();
  if (moveTimer) clearInterval(moveTimer);
  if (state.settings.timePerMove > 0) {
    state.moveTimeLeft = state.settings.timePerMove;
    renderMoveTimer();
    moveTimer = setInterval(() => {
      state.moveTimeLeft--;
      renderMoveTimer();
      if (state.moveTimeLeft <= 0) {
        clearInterval(moveTimer);
        timeoutAdvance();
      }
    }, 1000);
  }
}
function stopMoveTimer() {
  if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
  return state.moveStart ? performance.now() - state.moveStart : 0;
}

// Coup non trouvé dans le temps : on révèle le top sans pénalité supplémentaire
function timeoutAdvance() {
  if (!state.started || !state.topMove) return;
  let playerScore = 0, playedWord = null;
  if (state.pending.length) {
    const m = buildMoveFromPending();
    if (m) {
      const r = scoreMove(state.board, m, state.dict);
      if (!r.errors.length) { playerScore = r.score; playedWord = m.word; }
    }
  }
  if (state.bestAttempt && state.bestAttempt.score > playerScore) {
    playerScore = state.bestAttempt.score;
    playedWord = state.bestAttempt.word;
  }
  const tm = state.topMove;
  recordMove({ status: "timeout", playerScore, playedWord });
  placeTopAndAdvance(playerScore);
  showFeedback("miss", `⏱ Temps écoulé — top : ${tm.move.word} (${tm.score} pts)`,
    `Tu marques ${playerScore} pts.`);
  setTimeout(nextMove, 1000);
}

function showFeedback(kind, title, detail = "", topReveal = "") {
  const div = $("#feedback");
  if (!title && !detail && !topReveal) { div.hidden = true; return; }
  div.hidden = false;
  div.className = "feedback " + (kind || "");
  div.innerHTML = `
    <div class="title">${title}</div>
    ${detail ? `<div class="detail">${detail}</div>` : ""}
    ${topReveal ? `<div class="top-reveal">${topReveal}</div>` : ""}
  `;
}
function hideFeedback() { $("#feedback").hidden = true; }

function applyRackPos() {
  const wrap = $("#gameWrap");
  wrap.classList.toggle("rack-top", state.settings.rackPos === "top");
  wrap.classList.toggle("rack-bottom", state.settings.rackPos !== "top");
}
function applyColorTheme() {
  document.body.classList.toggle("theme-duplijeu", state.settings.colorTheme === "duplijeu");
}

function renderGameTitle() {
  const el = $("#gameTitle");
  if (!el) return;
  const modeLabel = modeDisplayName(state.settings.gameMode, state.settings.withJoker);
  const timeLabel = state.settings.timePerMove > 0 ? ` · ${state.settings.timePerMove}s/coup` : "";
  if (review.active && review.game) {
    el.innerHTML = `<span class="badge review">REVOIR</span> « ${escapeHtmlS(review.game.name)} » · ${modeLabel}${timeLabel}`;
  } else if (state.prepared) {
    el.innerHTML = `<span class="badge">PARTIE</span> « ${escapeHtmlS(state.prepared.name)} » · ${modeLabel}${timeLabel}`;
  } else {
    el.innerHTML = `<span class="badge">ENTRAÎNEMENT</span> ${modeLabel}${timeLabel}`;
  }
}

function escapeHtmlS(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ============================================================
//  Curseur & frappe
// ============================================================
function handleBoardClick(r, c) {
  if (review.active) return;
  if (state.annotTool) { annotateCell(r, c); return; }
  if (state.board[r][c]) return;
  // Si on a des tuiles en cours de pose et qu'on clique en dehors, on les renvoie
  // sur le chevalet (annule la saisie) puis on repositionne le curseur.
  const clickedOnPending = state.pending.some(p => p.row === r && p.col === c);
  if (state.pending.length > 0 && !clickedOnPending) {
    clearPending();
    state.cursor = { row: r, col: c, dir: "H" };
    renderRack();
    renderBoard();
    return;
  }
  if (state.cursor && state.cursor.row === r && state.cursor.col === c) {
    state.cursor.dir = state.cursor.dir === "H" ? "V" : "H";
  } else {
    // Nouvelle case : on repart toujours en horizontal (2e clic = bascule en V).
    state.cursor = { row: r, col: c, dir: "H" };
  }
  renderBoard();
}

// Clic droit : place le curseur en vertical directement (sans nécessiter
// un 2ème clic). N'agit que sur les cases libres, hors mode annotation/review.
function handleBoardRightClick(r, c) {
  if (review.active) return;
  if (state.annotTool) return;
  if (state.board[r][c]) return;
  if (state.pending.length > 0) {
    const clickedOnPending = state.pending.some(p => p.row === r && p.col === c);
    if (!clickedOnPending) {
      clearPending();
      renderRack();
    }
  }
  state.cursor = { row: r, col: c, dir: "V" };
  renderBoard();
}

function clearPending() {
  for (const t of state.rack) t.used = false;
  state.pending = [];
  state.jokerPending = false;
}

function moveCursorKey(key) {
  let { row, col } = state.cursor;
  if (key === "ArrowLeft")  col--;
  if (key === "ArrowRight") col++;
  if (key === "ArrowUp")    row--;
  if (key === "ArrowDown")  row++;
  if (row < 0 || col < 0 || row >= BOARD_SIZE || col >= BOARD_SIZE) return;
  state.cursor.row = row;
  state.cursor.col = col;
  // En sens horizontal : flèches G/D ; en vertical : flèches H/B (sinon on garde le sens actuel)
  if (key === "ArrowLeft" || key === "ArrowRight") state.cursor.dir = "H";
  else state.cursor.dir = "V";
  renderBoard();
}

// ===== Annotations sur la grille =====

function setAnnotTool(t) {
  state.annotTool = t || "";
  $$(".annot-btn").forEach(b => b.classList.toggle("active", (b.dataset.tool ?? "") === state.annotTool));
  $("#board").classList.toggle("annot-mode", !!state.annotTool);
}

function annotateCell(r, c) {
  const key = `${r},${c}`;
  const t = state.annotTool;
  if (!t) return false;
  if (t === "erase") {
    delete state.annotations[key];
    // Effacer aussi les flèches qui passent par cette case
    state.arrowAnnotations = (state.arrowAnnotations || []).filter(a => !arrowPassesThrough(a, r, c));
  } else if (t === "arrow") {
    return false;   // la flèche se trace au mousedown/up, pas au click
  } else if (t.startsWith("dot-")) {
    const color = t.split("-")[1];
    const cur = state.annotations[key] || {};
    cur.dot = (cur.dot === color) ? null : color;   // re-clic même couleur = retire
    if (!cur.dot) delete cur.dot;
    state.annotations[key] = cur;
    if (Object.keys(cur).length === 0) delete state.annotations[key];
  } else {
    // texte dans un coin / centre
    const text = (prompt(`Texte (1-3 caractères max) :`, (state.annotations[key]?.[t]) || "") || "").trim().slice(0, 3);
    const cur = state.annotations[key] || {};
    if (text) cur[t] = text; else delete cur[t];
    if (Object.keys(cur).length === 0) delete state.annotations[key];
    else state.annotations[key] = cur;
  }
  renderBoard();
  return true;
}

window.clearAllAnnotations = function () {
  const hasAny = Object.keys(state.annotations).length || (state.arrowAnnotations || []).length;
  if (!hasAny) return;
  if (confirm("Effacer toutes les annotations ?")) {
    state.annotations = {};
    state.arrowAnnotations = [];
    renderBoard();
  }
};

// ===== Dessin de flèches par cliquer-glisser =====
let _arrowStart = null;
function onCellMouseDown(e, r, c) {
  if (state.annotTool !== "arrow") return;
  _arrowStart = { r, c };
  e.preventDefault();
}
function onCellMouseUp(e, r, c) {
  if (state.annotTool !== "arrow" || !_arrowStart) return;
  const start = _arrowStart;
  _arrowStart = null;
  if (start.r === r && start.c === c) return; // pas de flèche sur un seul clic
  // Aligner le point d'arrivée sur l'axe dominant (purement H ou V)
  const dr = Math.abs(r - start.r), dc = Math.abs(c - start.c);
  let endR = r, endC = c;
  if (dr > dc) endC = start.c; else endR = start.r;
  state.arrowAnnotations = state.arrowAnnotations || [];
  state.arrowAnnotations.push({ fromR: start.r, fromC: start.c, toR: endR, toC: endC });
  renderBoard();
}

function renderAnnotations(r, c) {
  if (!state.annotations) return "";
  let html = "";
  // Segments de flèches dans la case
  for (const a of (state.arrowAnnotations || [])) {
    const seg = arrowSegmentAt(a, r, c);
    if (!seg) continue;
    html += `<span class="arrow-line ${seg.cls}"></span>`;
    if (seg.head) html += `<span class="arrow-head ${seg.head}"></span>`;
  }
  const a = state.annotations[`${r},${c}`];
  if (a) {
    if (a.dot) html += `<span class="dot-mark ${a.dot}"></span>`;
    if (a.center) html += `<span class="annot center">${escapeHtmlS(a.center)}</span>`;
  }
  return html;
}

// Segment d'une flèche dans une case donnée (null si la case n'est pas sur le chemin)
function arrowSegmentAt(a, r, c) {
  if (a.fromR === a.toR && a.fromC === a.toC) return null;
  if (a.fromR === a.toR) {
    if (r !== a.fromR) return null;
    const minC = Math.min(a.fromC, a.toC), maxC = Math.max(a.fromC, a.toC);
    if (c < minC || c > maxC) return null;
    const right = a.toC > a.fromC;
    if (c === a.fromC) return { cls: right ? "h-half-right" : "h-half-left" };
    if (c === a.toC)   return { cls: right ? "h-half-left"  : "h-half-right", head: right ? "right" : "left" };
    return { cls: "h-full" };
  }
  if (a.fromC === a.toC) {
    if (c !== a.fromC) return null;
    const minR = Math.min(a.fromR, a.toR), maxR = Math.max(a.fromR, a.toR);
    if (r < minR || r > maxR) return null;
    const down = a.toR > a.fromR;
    if (r === a.fromR) return { cls: down ? "v-half-down" : "v-half-up" };
    if (r === a.toR)   return { cls: down ? "v-half-up"   : "v-half-down", head: down ? "down" : "up" };
    return { cls: "v-full" };
  }
  return null;
}

function arrowPassesThrough(a, r, c) {
  return !!arrowSegmentAt(a, r, c);
}

function isOccupied(r, c) {
  return !!state.board[r][c] || state.pending.some(p => p.row === r && p.col === c);
}

// Avance le curseur à la prochaine case libre dans la direction
function advanceCursor() {
  if (!state.cursor) return;
  const dr = state.cursor.dir === "V" ? 1 : 0;
  const dc = state.cursor.dir === "H" ? 1 : 0;
  let r = state.cursor.row + dr;
  let c = state.cursor.col + dc;
  while (r < BOARD_SIZE && c < BOARD_SIZE && isOccupied(r, c)) {
    r += dr; c += dc;
  }
  if (r >= BOARD_SIZE || c >= BOARD_SIZE) return; // bout du plateau
  state.cursor.row = r;
  state.cursor.col = c;
}

function handleKey(e) {
  // Laisser passer tous les raccourcis avec modificateur (Cmd+Opt+I, Cmd+R, etc.)
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // ignore si on est dans un input du modal
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  // En mode review, seules les flèches gauche/droite passent (déjà gérées ailleurs)
  if (review.active) return;

  // Démarrage : 1re Entrée lance la partie (lance chrono + 1er tirage)
  if (!state.started) {
    if (e.key === "Enter") {
      e.preventDefault();
      startGame();
    }
    return;
  }

  if (e.key === "Enter") { e.preventDefault(); validate(); return; }
  if (e.key === "Escape") {
    e.preventDefault();
    if (state.annotTool) { setAnnotTool(""); return; }   // Échap : sort du mode annotation
    cancelCurrent();
    return;
  }
  if (e.key === "Backspace") { e.preventDefault(); backspace(); return; }
  if (e.key === "F1") { e.preventDefault(); shuffleRack(); return; }
  if (e.key === "F2") { e.preventDefault(); restoreRackSort(); return; }
  // Touche "0" : raccourci Abandonner (mode entraînement uniquement)
  if ((e.key === "0" || e.code === "Digit0" || e.code === "Numpad0")
      && !state.prepared && state.started && state.chronoFinal == null) {
    e.preventDefault();
    if (confirm("Abandonner la partie ? Les coups restants seront révélés automatiquement.")) {
      abandonRest();
    }
    return;
  }
  // Touche "1" : raccourci Voir le top (−20 s)
  if ((e.key === "1" || e.code === "Digit1" || e.code === "Numpad1")
      && state.started && state.chronoFinal == null) {
    e.preventDefault();
    revealTop();
    return;
  }
  // Flèches : déplacer le curseur (seulement s'il n'y a pas de pending tile)
  if (state.cursor && state.pending.length === 0 &&
      ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
    e.preventDefault();
    moveCursorKey(e.key);
    return;
  }
  // Barre espace : toggle sens du curseur (H ↔ V)
  if (state.cursor && state.pending.length === 0 && e.key === " ") {
    e.preventDefault();
    state.cursor.dir = state.cursor.dir === "H" ? "V" : "H";
    renderBoard();
    return;
  }

  if (e.key === "?") {
    // Active le mode joker pour la prochaine lettre
    if (state.rack.find(t => t.letter === "?" && !t.used)) {
      state.jokerPending = true;
      flashFeedback("info", "Mode joker actif", "Tape la lettre à associer.");
    }
    return;
  }

  if (e.key.length === 1 && /[a-zA-ZàâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/.test(e.key)) {
    e.preventDefault();
    const L = e.key.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    placeLetter(L);
  }
}

function placeLetter(L) {
  if (!state.cursor) {
    flashFeedback("error", "Pas de curseur", "Clique d'abord sur une case du plateau.");
    return;
  }
  // Si la case courante est occupée, tenter d'avancer
  let { row, col } = state.cursor;
  if (isOccupied(row, col)) {
    const before = { row, col };
    advanceCursor();
    if (state.cursor.row === before.row && state.cursor.col === before.col) {
      flashFeedback("error", "Plus de place", "Bout du plateau atteint.");
      return;
    }
    row = state.cursor.row; col = state.cursor.col;
  }

  // Trouver tuile à utiliser : préférer la lettre exacte, sinon joker
  let rackTile;
  let isBlank = false;
  if (state.jokerPending) {
    rackTile = state.rack.find(t => t.letter === "?" && !t.used);
    if (!rackTile) {
      flashFeedback("error", "Pas de joker disponible", "");
      state.jokerPending = false;
      return;
    }
    isBlank = true;
    state.jokerPending = false;
  } else {
    rackTile = state.rack.find(t => t.letter === L && !t.used);
    if (!rackTile) {
      rackTile = state.rack.find(t => t.letter === "?" && !t.used);
      if (rackTile) isBlank = true;
    }
  }
  if (!rackTile) {
    flashFeedback("error", `Pas de "${L}" dans le chevalet`, "Et plus de joker disponible non plus.");
    return;
  }
  rackTile.used = true;
  state.pending.push({ row, col, letter: L, rackId: rackTile.id, isBlank });
  advanceCursor();
  renderBoard();
  renderRack();
}

function backspace() {
  if (!state.pending.length) return;
  const last = state.pending.pop();
  const tile = state.rack.find(t => t.id === last.rackId);
  if (tile) tile.used = false;
  // remettre le curseur sur la case retirée
  state.cursor.row = last.row;
  state.cursor.col = last.col;
  renderBoard();
  renderRack();
}

function cancelCurrent() {
  clearPending();
  state.cursor = null;
  renderBoard();
  renderRack();
  // On rappelle le meilleur essai accumulé pour ce coup, s'il existe, pour que
  // le joueur ne perde pas de vue son score-plancher déjà acquis.
  const best = state.bestAttempt;
  if (best) {
    showFeedback("miss",
      `Saisie annulée — meilleur essai : <strong>${best.word}</strong> = <strong>${best.score}</strong> pts ✓`,
      `Clique sur une case pour repositionner le curseur.`);
  } else {
    showFeedback("", "Saisie annulée", "Clique sur une case pour repositionner le curseur.");
  }
}

let flashTimer = null;
function flashFeedback(kind, title, detail) {
  showFeedback(kind, title, detail);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (state.cursor) {
      showFeedback("", `Curseur en (${state.cursor.row+1},${state.cursor.col+1}) — ${state.cursor.dir === "H" ? "Horizontal" : "Vertical"}`,
        `Tape les lettres de ton mot. <kbd>Entrée</kbd> pour valider.`);
    }
  }, 1500);
}

// ============================================================
//  Validation
// ============================================================
function validate() {
  if (!state.pending.length) {
    showFeedback("error", "Rien à valider", "Place d'abord des lettres sur la grille.");
    return;
  }
  // Reconstituer le coup (mot principal dans la direction)
  const move = buildMoveFromPending();
  if (!move) {
    showFeedback("error", "Pose invalide", "Les lettres doivent être alignées et contiguës.");
    return;
  }
  const mode = currentMode();
  const topMv = state.topMove?.move;
  // Exception 1er coup : on accepte tout mot du top OU isotop (même score que le top),
  // peu importe la position de placement.
  if (state.moveNo === 1 && topMv && state.topMove) {
    const topScore = state.topMove.score;
    // Liste des mots isotopes pré-calculée par findTopRanked.
    // En mode pré-tiré (tournoi), la liste n'est pas stockée → on la calcule à la volée.
    let isotopWords = state.topMove.isotopWords;
    if (!isotopWords) {
      const rackLetters = state.rack.map(t => t.letter);
      const allMoves = findTop(state.board, rackLetters, state.dict, {
        all: true, maxTilesUsed: mode.maxPlayed, bonuses: mode.bonuses,
      }) || [];
      isotopWords = [...new Set(allMoves.filter(c => c.score === topScore).map(c => c.move.word))];
      state.topMove.isotopWords = isotopWords;
    }
    if (isotopWords.includes(move.word)) {
      recordMove({ status: "top", playerScore: topScore, playedWord: move.word });
      placeTopAndAdvance(topScore);
      nextMove();
      return;
    }
  }
  // Règle FFSC : si le joker a un homonyme (même lettre) dans le mot, on permute
  // automatiquement vers la combinaison la plus avantageuse en points.
  const result = bestJokerVariant(state.board, move, state.dict, { bonuses: mode.bonuses });
  // bestJokerVariant peut avoir modifié move.blanks ; on relit ici.
  if (result.errors.length) {
    showFeedback("error", "Coup invalide", result.errors.join("<br>"));
    return;
  }
  // Vérification mode 7sur8 / 7et8 / 789 : nb de tuiles posées
  if (result.placed.length > mode.maxPlayed) {
    showFeedback("error", `Trop de lettres posées (max ${mode.maxPlayed})`,
      `Le mode ${mode.label} limite à ${mode.maxPlayed} lettres jouées par coup.`);
    return;
  }
  // Comparer au top
  const topScore = state.topMove?.score || 0;
  const topWord = state.topMove?.move.word || "?";
  const diff = result.score - topScore;
  // Exception 1er coup : accepter le top même si la position n'est pas optimale
  const isFirstMoveTopWord = state.moveNo === 1 && move.word === topWord;
  // Exception joker : même mot + même position que le top mais joker à un autre
  // emplacement (lettre dupliquée) → on accepte comme top.
  const isSameAsTopButJokerElsewhere = topMv &&
    move.word === topMv.word &&
    move.row === topMv.row &&
    move.col === topMv.col &&
    move.dir === topMv.dir;
  if (result.score === topScore || isFirstMoveTopWord || isSameAsTopButJokerElsewhere) {
    // TOP trouvé
    recordMove({ status: "top", playerScore: topScore, playedWord: move.word });
    placeTopAndAdvance(topScore);
    nextMove();
  } else {
    // Miss : on garde la trace du meilleur essai
    if (!state.bestAttempt || result.score > state.bestAttempt.score) {
      state.bestAttempt = { word: move.word, score: result.score };
    }
    const startR = move.row, startC = move.col;
    clearPending();
    state.cursor = { row: startR, col: startC, dir: move.dir };
    // Avancer le curseur au-delà des cases occupées (committées)
    let guard = 0;
    while (isOccupied(state.cursor.row, state.cursor.col) && guard++ < BOARD_SIZE) {
      const before = { row: state.cursor.row, col: state.cursor.col };
      advanceCursor();
      if (state.cursor.row === before.row && state.cursor.col === before.col) {
        // bout du plateau atteint
        state.cursor = null;
        break;
      }
    }
    renderBoard();
    renderRack();
    const best = state.bestAttempt;
    const isNewBest = best.word === move.word && best.score === result.score;
    const currentLine = `${move.word} = <strong>${result.score}</strong> pts`;
    const bestLine = isNewBest
      ? `${currentLine} — meilleur essai ✓`
      : `${currentLine}<br>Meilleur essai : <strong>${best.word}</strong> = ${best.score} pts`;
    showFeedback("miss", bestLine, `Pas le top, cherche encore. <kbd>Voir le top</kbd> pour révéler.`);
  }
}

// Règle FFSC : pour chaque joker du coup, si la lettre qu'il représente apparaît
// aussi en tant que vraie tuile dans le mot (parmi les tuiles posées), on essaie
// les permutations joker ↔ vraie tuile et on retient le placement qui maximise
// le score. Mute move.blanks vers la meilleure variante.
function bestJokerVariant(board, move, dict, opts) {
  const blanks = move.blanks || [];
  let best = scoreMove(board, move, dict, opts);
  if (!blanks.length || best.errors.length) return best;
  const dr = move.dir === "V" ? 1 : 0;
  const dc = move.dir === "H" ? 1 : 0;
  // Positions des tuiles nouvellement posées (par index dans le mot)
  const placedIdx = [];
  for (let i = 0; i < move.word.length; i++) {
    const r = move.row + i * dr, c = move.col + i * dc;
    if (!board[r][c]) placedIdx.push(i);
  }
  let bestBlanks = blanks.slice();
  for (const b of blanks) {
    const letter = move.word[b];
    for (const i of placedIdx) {
      if (i === b) continue;
      if (move.word[i] !== letter) continue;
      if (bestBlanks.includes(i)) continue;
      const trial = bestBlanks.filter(x => x !== b).concat([i]).sort((a, b) => a - b);
      const trialMove = { ...move, blanks: trial };
      const r = scoreMove(board, trialMove, dict, opts);
      if (r.errors.length === 0 && r.score > best.score) {
        best = r;
        bestBlanks = trial;
      }
    }
  }
  move.blanks = bestBlanks;
  return best;
}

function buildMoveFromPending() {
  const ps = [...state.pending];
  // déterminer la direction d'après l'alignement
  const allSameRow = ps.every(p => p.row === ps[0].row);
  const allSameCol = ps.every(p => p.col === ps[0].col);
  if (!allSameRow && !allSameCol) return null;
  const dir = allSameRow ? "H" : "V";
  // tri par axe progressif
  ps.sort((a,b) => dir === "H" ? a.col - b.col : a.row - b.row);
  // étendre le mot en prenant les lettres committed avant le 1er pending et entre les pending
  const dr = dir === "V" ? 1 : 0;
  const dc = dir === "H" ? 1 : 0;
  let startR = ps[0].row, startC = ps[0].col;
  // remonter tant que case précédente est committed
  while (true) {
    const pr = startR - dr, pc = startC - dc;
    if (pr < 0 || pc < 0) break;
    if (!state.board[pr][pc]) break;
    startR = pr; startC = pc;
  }
  // construire le mot complet en avançant
  let r = startR, c = startC;
  let word = "";
  const blanks = [];
  const pendingMap = new Map(ps.map(p => [`${p.row},${p.col}`, p]));
  let idx = 0;
  while (r < BOARD_SIZE && c < BOARD_SIZE) {
    const committed = state.board[r][c];
    const pending = pendingMap.get(`${r},${c}`);
    if (committed) {
      word += committed.letter;
      if (committed.isBlank) blanks.push(idx);
    } else if (pending) {
      word += pending.letter;
      if (pending.isBlank) blanks.push(idx);
    } else {
      break; // trou → fin du mot principal
    }
    r += dr; c += dc;
    idx++;
  }
  // vérifier qu'il n'y a pas de trou : tous les pending sont dans le mot construit
  for (const p of ps) {
    if (!word.includes("")) { /* dummy */ }
  }
  // s'il y a un trou (pending qui n'est pas dans la chaîne), invalide
  const builtPositions = new Set();
  let rr = startR, cc = startC;
  for (let i = 0; i < word.length; i++) {
    builtPositions.add(`${rr},${cc}`);
    rr += dr; cc += dc;
  }
  for (const p of ps) {
    if (!builtPositions.has(`${p.row},${p.col}`)) return null;
  }
  return { word, row: startR, col: startC, dir, blanks };
}

// Place le TOP sur le plateau, retire ses lettres du chevalet,
// met à jour score/négatif selon le score du joueur (0 si rien tenté).
// Gère le mode joker (remplacement par la lettre du sac si possible).
function placeTopAndAdvance(playerScore) {
  const tm = state.topMove;
  if (!tm) return;
  const { word, row, col, dir, blanks } = tm.move;
  const dr = dir === "V" ? 1 : 0;
  const dc = dir === "H" ? 1 : 0;
  // Identifier les lettres NOUVELLEMENT posées par le top
  const newLetters = [];
  const lastPlaced = [];
  let jokerUsedAsLetter = null;
  let jokerCellIdx = -1;
  let jokerWordIdx = -1;
  for (let i = 0; i < word.length; i++) {
    const r = row + i * dr, c = col + i * dc;
    if (!state.board[r][c]) {
      const isBlank = blanks.includes(i);
      newLetters.push({ letter: word[i], isBlank });
      lastPlaced.push({ row: r, col: c });
      if (isBlank && jokerUsedAsLetter === null) {
        jokerUsedAsLetter = word[i];
        jokerCellIdx = lastPlaced.length - 1;
        jokerWordIdx = i;
      }
    }
  }
  state.lastPlaced = lastPlaced;

  // Appliquer le top au plateau
  state.board = applyMove(state.board, tm.move);

  // Mode joker : si le top utilise un joker, tenter le remplacement par la lettre du sac
  if (state.settings.withJoker && jokerUsedAsLetter !== null && state.spareJokers > 0) {
    if (state.bag[jokerUsedAsLetter] > 0) {
      state.bag[jokerUsedAsLetter]--;
      const cell = lastPlaced[jokerCellIdx];
      state.board[cell.row][cell.col] = { letter: jokerUsedAsLetter, isBlank: false };
      // Amender l'historique : retirer cet index de blanks pour que la review
      // affiche bien une lettre normale (et pas un joker rouge).
      const last = state.history[state.history.length - 1];
      if (last?.top?.blanks) {
        last.top.blanks = last.top.blanks.filter(b => b !== jokerWordIdx);
      }
    } else {
      state.spareJokers--;
    }
  }
  // Retirer ces lettres du chevalet (priorité à la lettre exacte, sinon joker)
  for (const nl of newLetters) {
    let idx = -1;
    if (nl.isBlank) {
      idx = state.rack.findIndex(t => t.letter === "?");
    } else {
      idx = state.rack.findIndex(t => t.letter === nl.letter);
      if (idx === -1) idx = state.rack.findIndex(t => t.letter === "?");
    }
    if (idx !== -1) state.rack.splice(idx, 1);
  }
  // Score
  state.totalScore += playerScore;
  state.sumNeg += (playerScore - tm.score);
  // Nettoyage. On NE supprime PAS le curseur : il reste visible pour permettre
  // une navigation 100% clavier sans avoir à recliquer après chaque validation.
  // S'il atterrit sur une case maintenant occupée, on l'avance après nextMove.
  state.pending = [];
  state.bestAttempt = null;
  state.moveNo++;
  if (state.prepared) state.preparedIdx++;
  renderInfo();
}

function revealTop() {
  if (!state.started || !state.topMove) return;
  state.chronoPenalty += 20;
  // Évaluer le pending courant
  let pendingScore = 0;
  let pendingWord = null;
  if (state.pending.length) {
    const move = buildMoveFromPending();
    if (move) {
      const r = scoreMove(state.board, move, state.dict);
      if (!r.errors.length) { pendingScore = r.score; pendingWord = move.word; }
    }
  }
  // On retient le meilleur entre le pending et le bestAttempt accumulé
  let playerScore = pendingScore;
  let playedWord = pendingWord;
  if (state.bestAttempt && state.bestAttempt.score > playerScore) {
    playerScore = state.bestAttempt.score;
    playedWord = state.bestAttempt.word;
  }
  const tm = state.topMove;
  recordMove({ status: "giveup", playerScore, playedWord });
  placeTopAndAdvance(playerScore);
  showFeedback("miss", `Top : ${tm.move.word} — ${tm.score} pts (toi : ${playerScore}, −20s)`,
    `Négatif : ${playerScore - tm.score}.`,
    `${tm.words.map(w => `${w.word}(${w.score})`).join(" + ")}`);
  setTimeout(nextMove, 1000);
}

// Enregistre un coup dans l'historique (pour la feuille de route)
function recordMove({ status, playerScore, playedWord = null }) {
  const tm = state.topMove;
  const timeMs = stopMoveTimer();
  state.history.push({
    moveNo: state.moveNo,
    rack: state.rack.map(t => t.letter).join(""),
    top: tm ? {
      word: tm.move.word,
      score: tm.score,
      pos: posLabel(tm.move),
      row: tm.move.row, col: tm.move.col, dir: tm.move.dir,
      blanks: tm.move.blanks || [],
      words: tm.words || [],
    } : null,
    played: playedWord,
    playerScore,
    neg: playerScore - (tm?.score || 0),
    status,        // "top" | "giveup" | "timeout"
    timeMs,
  });
}

function posLabel(move) {
  // Notation FFSC : horizontal = "H8" (lettre puis nombre), vertical = "8H"
  const letter = ROW_LETTERS[move.row];
  const num = move.col + 1;
  return move.dir === "H" ? `${letter}${num}` : `${num}${letter}`;
}

// ============================================================
//  Boucle de jeu : tirage + calcul top
// ============================================================
function nextMove() {
  // ===== Mode partie pré-tirée : on suit la séquence stockée =====
  if (state.prepared) {
    if (state.preparedIdx >= state.prepared.moves.length) {
      endGame();
      return;
    }
    const next = state.prepared.moves[state.preparedIdx];
    state.rack = next.rack.split("").map(L => ({ letter: L, used: false, id: nextTileId() }));
    renderRack();
    renderBoard();
    computeTop();
    startMoveTimer();
    hideFeedback();
    ensureCursorOnFreeCell();
    return;
  }

  // ===== Mode entraînement (aléatoire) =====
  if (bagTotalVowels(state.bag) === 0 || bagTotalConsonants(state.bag) === 0) {
    endGame();
    return;
  }

  // Compléter le chevalet selon le mode de partie
  const mode = currentMode();
  const targetSize = mode.rackSize;
  // Mode joker : si jokers actifs disponibles, on impose 1 joker dans le tirage
  const jokerInRack = state.rack.some(t => t.letter === "?");
  const forceJoker = state.settings.withJoker && state.spareJokers > 0 && !jokerInRack;
  const regularTarget = forceJoker ? targetSize - 1 : targetSize;
  const kept = state.rack.map(t => t.letter);
  const result = drawForDuplicate(state.bag, kept, state.moveNo, regularTarget);
  if (result.failed) {
    endGame();
    return;
  }
  state.bag = result.bag;
  for (const L of (result.drawn || [])) {
    state.rack.push({ letter: L, used: false, id: nextTileId() });
  }
  if (forceJoker) {
    state.rack.push({ letter: "?", used: false, id: nextTileId() });
  }
  for (const t of state.rack) t.used = false;
  // Log de la règle appliquée si elle a été relâchée
  if (result.minApplied !== undefined && result.minApplied < (state.moveNo >= 15 ? 1 : 2)) {
  }
  renderRack();
  renderBoard();
  computeTop();
  startMoveTimer();
  hideFeedback();
  ensureCursorOnFreeCell();
}

// Garde le curseur sur le plateau et sur une case libre après l'avancement
// d'un coup, pour permettre une navigation 100 % clavier.
function ensureCursorOnFreeCell() {
  if (!state.cursor) {
    state.cursor = { row: CENTER, col: CENTER, dir: "H" };
    renderBoard();
    return;
  }
  if (!isOccupied(state.cursor.row, state.cursor.col)) return;
  // Tenter d'avancer dans la direction du curseur
  let guard = 0;
  while (isOccupied(state.cursor.row, state.cursor.col) && guard++ < BOARD_SIZE * 2) {
    const before = { row: state.cursor.row, col: state.cursor.col };
    advanceCursor();
    if (state.cursor.row === before.row && state.cursor.col === before.col) {
      // bord atteint : on remet le curseur au centre par défaut
      state.cursor = { row: CENTER, col: CENTER, dir: state.cursor.dir };
      break;
    }
  }
  renderBoard();
}

let nextTileIdCounter = 1;
function nextTileId() { return nextTileIdCounter++; }

function computeTop() {
  if (!state.dict) return;
  // Mode pré-tiré : utiliser le top stocké, pas de calcul
  if (state.prepared) {
    const m = state.prepared.moves[state.preparedIdx];
    if (!m) { state.topMove = null; return; }
    state.topMove = {
      score: m.top.score,
      move: { word: m.top.word, row: m.top.row, col: m.top.col, dir: m.top.dir, blanks: m.top.blanks || [] },
      words: m.top.words || [],
    };
    return;
  }
  const mode = currentMode();
  const rackLetters = state.rack.map(t => t.letter);
  const t0 = performance.now();
  state.topMove = findTopRanked(state.board, rackLetters, state.dict, state.bag, {
    maxTilesUsed: mode.maxPlayed,
    bonuses: mode.bonuses,
    preserveJoker: state.settings.withJoker && state.spareJokers > 0,
  });
  const t1 = performance.now();
  // Pas de log du mot pour ne pas spoiler via la console
  void t1;
}

// ============================================================
//  Settings modal
// ============================================================
window.openSettings = () => {
  $("#optGameMode").value = state.settings.gameMode;
  $("#optWithJoker").checked = state.settings.withJoker;
  $("#optRackPos").value = state.settings.rackPos;
  $("#optSortRack").checked = state.settings.sortRack;
  $("#optShowCoords").checked = state.settings.showCoords;
  $("#optColorTheme").value = state.settings.colorTheme || "classic";
  $("#optTimePerMove").value = state.settings.timePerMove;
  $("#settings").hidden = false;
};
window.closeSettings = () => {
  const oldMode = state.settings.gameMode;
  const oldJoker = state.settings.withJoker;
  state.settings.gameMode = $("#optGameMode").value;
  state.settings.withJoker = $("#optWithJoker").checked;
  state.settings.rackPos = $("#optRackPos").value;
  state.settings.sortRack = $("#optSortRack").checked;
  state.settings.showCoords = $("#optShowCoords").checked;
  state.settings.colorTheme = $("#optColorTheme").value || "classic";
  state.settings.timePerMove = +$("#optTimePerMove").value || 0;
  saveSettings();
  saveSettingsToSupabase().catch(() => {});   // sync compte (silencieux si pas connecté ou pas de colonne)
  applyRackPos();
  applyColorTheme();
  renderRack();
  renderBoard();
  renderMoveTimer();
  renderGameTitle();
  $("#settings").hidden = true;
  // Si on a changé le mode ou le joker, proposer de relancer
  if (oldMode !== state.settings.gameMode || oldJoker !== state.settings.withJoker) {
    if (state.started && !state.chronoFinal) {
      if (confirm("Mode de partie changé. Relancer une nouvelle partie ?")) restartGame();
    } else if (!state.started) {
      restartGame();
    }
  }
};
window.restartGame = () => {
  closeSettings();
  initGame();
};

// ============================================================
//  Init / démarrage / fin de partie
// ============================================================
async function initGame() {
  state.bag = { ...LETTER_BAG };
  state.preparedIdx = 0;
  // Mode joker : extraire les 2 jokers du sac et les stocker à part
  if (state.settings.withJoker) {
    state.spareJokers = state.bag["?"] || 0;
    state.bag["?"] = 0;
  } else {
    state.spareJokers = 0;
  }
  state.board = emptyBoard();
  state.rack = [];
  state.pending = [];
  state.cursor = null;
  state.moveNo = 1;
  state.totalScore = 0;
  state.sumNeg = 0;
  state.topMove = null;
  state.started = false;
  state.chronoStart = null;
  state.chronoPenalty = 0;
  state.chronoFinal = null;
  state.lastPlaced = [];
  state.history = [];
  state.moveStart = null;
  state.moveTimeLeft = 0;
  if (chronoTimer) { clearInterval(chronoTimer); chronoTimer = null; }
  if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
  // Reset UI review s'il était activé
  review.active = false;
  review.game = null;
  review.result = null;
  review.historyByMove = {};
  $("#reviewPanel").hidden = true;
  // (rien à reset côté layout)
  document.querySelector(".info-bar")?.style.removeProperty("display");
  $("#endModal").hidden = true;
  $("#actionRowPreStart").hidden = false;
  $("#actionRowInGame").hidden = true;
  renderInfo();
  renderBoard();
  renderRack();
  applyRackPos();
  applyColorTheme();
  renderGameTitle();
  if (!state.dict) {
    showFeedback("", "Chargement du dictionnaire…", "");
    state.dict = await new Dictionary().load("ods9.txt");
  }
  // Charger les préférences perso depuis Supabase (asynchrone, silencieux)
  loadSettingsFromSupabase().catch(() => {});
  // Mode REVIEW d'une partie pré-tirée jouée
  if (REVIEW_ID) {
    try {
      await enterReviewMode(REVIEW_ID);
    } catch (e) {
      showFeedback("error", "Impossible d'afficher la partie", e.message);
    }
    return;
  }
  // Mode REVIEW d'un entraînement
  if (TRAINING_ID) {
    try {
      await enterTrainingReviewMode(TRAINING_ID);
    } catch (e) {
      showFeedback("error", "Impossible d'afficher l'entraînement", e.message);
    }
    return;
  }
  // Mode PUZZLE : tenter un seul coup d'une partie pré-tirée
  if (PUZZLE_GAME_ID) {
    try {
      await enterPuzzleMode(PUZZLE_GAME_ID, PUZZLE_MOVE_NO);
    } catch (e) {
      showFeedback("error", "Impossible de charger le puzzle", e.message);
    }
    return;
  }
  // Charger une partie pré-tirée si demandée via URL
  if (PREPARED_ID && !state.prepared) {
    showFeedback("", "Chargement de la partie…", "");
    try {
      await loadPreparedGame(PREPARED_ID);
    } catch (e) {
      showFeedback("error", "Impossible de charger la partie", e.message);
      return;
    }
  }
  // Si aucune URL spéciale, et qu'on a un entraînement en pause sauvegardé → restaurer
  if (!PREPARED_ID && !TRAINING_ID && !PUZZLE_GAME_ID && !REVIEW_ID) {
    if (restorePausedTraining()) return;
  }
  hideFeedback();
}

// Mode "puzzle" : on charge une partie pré-tirée et on plante le plateau au coup
// spécifié pour que le joueur essaie de retrouver le top. Pas de sauvegarde.
async function enterPuzzleMode(gameId, moveNo) {
  showFeedback("", "Chargement du puzzle…", "");
  if (!window._sb) await loadSupabaseClient();
  const { data: g, error } = await window._sb.from("prepared_games").select("*").eq("id", gameId).single();
  if (error) throw new Error(error.message);
  const idx = moveNo - 1;
  if (!g.moves[idx]) throw new Error("Coup introuvable dans cette partie.");
  // Appliquer les coups 0..idx-1 au plateau
  let board = emptyBoard();
  for (let i = 0; i < idx; i++) board = applyMove(board, g.moves[i].top);
  state.board = board;
  // Préparer un faux "prepared" mono-coup pour réutiliser tout le moteur
  state.prepared = {
    id: g.id,
    name: `${g.name} — coup ${moveNo}`,
    mode: g.mode,
    withJoker: g.with_joker,
    timePerMove: g.time_per_move,
    moves: [g.moves[idx]],   // une seule "partie"
  };
  state.preparedIdx = 0;
  state.settings.gameMode = g.mode;
  state.settings.withJoker = g.with_joker;
  state.settings.timePerMove = g.time_per_move;
  // Marquer ce mode comme "puzzle" pour ne pas sauvegarder à la fin
  state.isPuzzle = true;
  renderGameTitle();
  renderBoard();
  hideFeedback();
  showFeedback("", `🧩 Puzzle — ${g.name} · coup ${moveNo}`,
    `Appuie sur <kbd>Entrée</kbd> pour démarrer. Trouve le top !`);
}

async function enterTrainingReviewMode(id) {
  showFeedback("", "Chargement de l'entraînement…", "");
  if (!window._sb) await loadSupabaseClient();
  const { data: t, error } = await window._sb.from("training_games").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  // Reconstituer un objet "game" + result équivalent pour reuser le moteur de review
  const fakeGame = {
    id: t.id,
    name: `Entraînement du ${(t.created_at || "").slice(0,10)}`,
    mode: t.mode,
    with_joker: t.with_joker,
    time_per_move: t.time_per_move,
    moves: (t.history || []).filter(h => h.top).map(h => ({
      moveNo: h.moveNo,
      rack: h.rack,
      top: {
        word: h.top.word, row: h.top.row, col: h.top.col, dir: h.top.dir,
        blanks: h.top.blanks || [], score: h.top.score, words: h.top.words || [],
      },
    })),
  };
  const fakeResult = {
    total_score: t.total_score, sum_neg: t.sum_neg,
    total_time_seconds: t.total_time_seconds, details: t.history,
  };
  review.active = true;
  review.game = fakeGame;
  review.result = fakeResult;
  review.historyByMove = {};
  for (const h of (t.history || [])) review.historyByMove[h.moveNo] = h;
  state.history = t.history || [];
  review.step = 1;
  state.started = false;
  state.settings.gameMode = t.mode;
  state.settings.withJoker = t.with_joker;
  state.settings.timePerMove = t.time_per_move;
  renderGameTitle();
  document.querySelector(".info-bar")?.style.setProperty("display", "none");
  $("#reviewPanel").hidden = false;
  showFeedback("success", `📺 ${fakeGame.name}`,
    `Score : <strong>${t.total_score}</strong> · Négatif : <strong>${t.sum_neg}</strong> · Temps : <strong>${fmtChrono(t.total_time_seconds || 0)}</strong>
     · <a href="#" onclick="event.preventDefault();openSheet()" style="color:var(--petrol);text-decoration:underline">feuille de route</a>`);
  renderReviewStep();
}

async function enterReviewMode(id) {
  showFeedback("", "Chargement de la partie…", "");
  if (!window._sb) await loadSupabaseClient();
  const { data: game, error: e1 } = await window._sb.from("prepared_games").select("*").eq("id", id).single();
  if (e1) throw new Error(e1.message);
  const pid = +(localStorage.getItem("currentPlayerId") || 0);
  let result = null;
  if (pid) {
    const { data: r } = await window._sb.from("prepared_game_results")
      .select("*").eq("prepared_game_id", id).eq("player_id", pid).maybeSingle();
    result = r;
  }
  // Init du mode review
  review.active = true;
  review.game = game;
  review.result = result;
  review.historyByMove = {};
  // Adopter les paramètres de la partie pour le titre
  state.settings.gameMode = game.mode;
  state.settings.withJoker = game.with_joker;
  state.settings.timePerMove = game.time_per_move;
  renderGameTitle();
  // Masquer la barre d'info (non pertinente en review)
  document.querySelector(".info-bar")?.style.setProperty("display", "none");
  if (result?.details) {
    for (const h of result.details) review.historyByMove[h.moveNo] = h;
    state.history = result.details; // pour la feuille de route accessible
  }
  review.step = 1;
  state.started = false;
  // Afficher le panel review
  $("#reviewPanel").hidden = false;
  // (layout déjà en 2 colonnes — rien à faire)
  // Header de feedback (résumé général)
  const summary = result
    ? `Ton score : <strong>${result.total_score}</strong> · Négatif : <strong>${result.sum_neg}</strong> · Temps : <strong>${fmtChrono(result.total_time_seconds || 0)}</strong>`
    : `<em>Tu n'as pas encore joué cette partie.</em>`;
  showFeedback("success", `📺 Parcours de « ${game.name} »`,
    `${summary}
     ${result ? ` · <a href="#" onclick="event.preventDefault();openSheet()" style="color:var(--petrol);text-decoration:underline">feuille de route</a>` : ""}
`);
  renderReviewStep();
}

function renderReviewStep() {
  const moves = review.game.moves;
  const total = moves.length;
  if (review.step < 1) review.step = 1;
  if (review.step > total) review.step = total;
  const idx = review.step - 1;
  const m = moves[idx];

  // Plateau = état APRÈS application des coups 1..step (incluant le coup courant)
  let board = emptyBoard();
  for (let i = 0; i < review.step; i++) board = applyMove(board, moves[i].top);
  state.board = board;
  // Mettre en surbrillance le coup courant (lastPlaced)
  state.lastPlaced = computeLastPlacedCells(moves.slice(0, idx).reduce((b, mv) => applyMove(b, mv.top), emptyBoard()), m.top);
  // Chevalet du coup courant
  state.rack = m.rack.split("").map((L, i) => ({ letter: L, used: false, id: i + 1 }));
  state.cursor = null;
  state.pending = [];
  renderBoard();
  renderRack();

  // Nav
  $("#rvStep").textContent = `Coup ${review.step} / ${total}`;
  $("#rvPrev").disabled = review.step <= 1;
  $("#rvFirst").disabled = review.step <= 1;
  $("#rvNext").disabled = review.step >= total;
  $("#rvLast").disabled = review.step >= total;

  // Top joué
  $("#rvTop").textContent = `${m.top.word} — ${m.top.score} pts en ${posLabelMove(m.top)}`;

  // Mot du joueur
  const ph = review.historyByMove[m.moveNo];
  if (ph) {
    if (ph.played) {
      $("#rvPlayed").textContent = `${ph.played} — ${ph.playerScore} pts ${ph.status === "top" ? "🏆" : ph.status === "timeout" ? "⏱" : "🏳️"}`;
    } else {
      $("#rvPlayed").textContent = `— (rien joué, ${ph.status})`;
    }
    $("#rvNeg").textContent = ph.neg;
  } else {
    $("#rvPlayed").textContent = "—";
    $("#rvNeg").textContent = "—";
  }

  // Autres solutions valides (calcul à la volée)
  renderReviewSolutions(idx);
}

function posLabelMove(mv) {
  const letter = "ABCDEFGHIJKLMNO"[mv.row];
  const num = mv.col + 1;
  return mv.dir === "H" ? `${letter}${num}` : `${num}${letter}`;
}

function computeLastPlacedCells(boardBefore, mv) {
  const dr = mv.dir === "V" ? 1 : 0;
  const dc = mv.dir === "H" ? 1 : 0;
  const cells = [];
  for (let i = 0; i < mv.word.length; i++) {
    const r = mv.row + i * dr, c = mv.col + i * dc;
    if (!boardBefore[r][c]) cells.push({ row: r, col: c });
  }
  return cells;
}

function renderReviewSolutions(idx) {
  const div = $("#rvSolutions");
  const moves = review.game.moves;
  let boardBefore = emptyBoard();
  for (let i = 0; i < idx; i++) boardBefore = applyMove(boardBefore, moves[i].top);
  const rackLetters = moves[idx].rack.split("");
  const topMv = moves[idx].top;
  const playedMv = review.historyByMove[moves[idx].moveNo]?.played;
  review._boardBefore = boardBefore;

  div.innerHTML = `<div style="padding:20px;text-align:center;color:#888">⏳ Calcul des solutions…</div>`;
  setTimeout(() => {
    let all = findTop(boardBefore, rackLetters, state.dict, {
      all: true,
      bonuses: GAME_MODES[review.game.mode]?.bonuses || { 7: 50 },
      maxTilesUsed: GAME_MODES[review.game.mode]?.maxPlayed || 7,
    }) || [];
    // Au 1er coup, on ne joue jamais verticalement en duplicate
    if (idx === 0) all = all.filter(s => s.move.dir === "H");
    review._solutions = all.slice(0, 200);
    const rows = review._solutions.map((s, i) => {
      const isTop = s.move.word === topMv.word && s.move.row === topMv.row && s.move.col === topMv.col && s.move.dir === topMv.dir;
      const isPlayed = playedMv && s.move.word === playedMv;
      const cls = isTop ? "is-top" : (isPlayed ? "is-played" : "");
      return `<tr class="${cls}" data-i="${i}"><td>${s.move.word}</td><td>${posLabelMove(s.move)}</td><td>${s.score}</td></tr>`;
    }).join("");
    div.innerHTML = `<table>
      <thead><tr><th>Mot</th><th>Place</th><th>Score</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    div.querySelectorAll("tr[data-i]").forEach(tr => {
      tr.onclick = () => previewSolution(+tr.dataset.i);
    });
  }, 30);
}

// Affiche la solution cliquée sur la grille (à la place du top initial)
function previewSolution(i) {
  const sol = review._solutions?.[i];
  if (!sol) return;
  // Replacer le plateau dans l'état AVANT le coup courant, puis appliquer la solution choisie
  const board = applyMove(review._boardBefore.map(r => r.slice()), sol.move);
  state.board = board;
  state.lastPlaced = computeLastPlacedCells(review._boardBefore, sol.move);
  renderBoard();
  // Marquer visuellement la ligne sélectionnée
  $$("#rvSolutions tr").forEach(tr => tr.classList.remove("selected"));
  $$(`#rvSolutions tr[data-i="${i}"]`).forEach(tr => tr.classList.add("selected"));
}

$("#rvFirst").onclick = () => { review.step = 1; renderReviewStep(); };
$("#rvPrev").onclick  = () => { review.step--;     renderReviewStep(); };
$("#rvNext").onclick  = () => { review.step++;     renderReviewStep(); };
$("#rvLast").onclick  = () => { review.step = review.game?.moves.length || 1; renderReviewStep(); };
document.addEventListener("keydown", (e) => {
  if (!review.active) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.key === "ArrowRight") { e.preventDefault(); $("#rvNext").click(); }
  if (e.key === "ArrowLeft")  { e.preventDefault(); $("#rvPrev").click(); }
});

async function loadPreparedGame(id) {
  // Charger Supabase si nécessaire
  if (!window.supabase || !window.SUPABASE_URL) {
    await loadSupabaseClient();
  }
  const { data, error } = await window._sb.from("prepared_games").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  state.prepared = {
    id: data.id,
    name: data.name,
    mode: data.mode,
    withJoker: data.with_joker,
    timePerMove: data.time_per_move,
    moves: data.moves,
  };
  // Appliquer le mode/paramètres de la partie pré-tirée (override des settings)
  state.settings.gameMode = data.mode;
  state.settings.withJoker = data.with_joker;
  state.settings.timePerMove = data.time_per_move;
  // Re-init du sac/jokers (initGame n'avait pas encore connaissance du mode pré-tiré)
  state.bag = { ...LETTER_BAG };
  if (state.settings.withJoker) {
    state.spareJokers = state.bag["?"] || 0;
    state.bag["?"] = 0;
  } else {
    state.spareJokers = 0;
  }
  renderGameTitle();
}

async function loadSupabaseClient() {
  // Charger la config (deux dossiers plus haut)
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "../config.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("config.js introuvable"));
    document.head.appendChild(s);
  });
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Impossible de charger Supabase JS"));
    document.head.appendChild(s);
  });
  window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

function startGame() {
  state.started = true;
  $("#actionRowPreStart").hidden = true;
  $("#actionRowInGame").hidden = false;
  const isTraining = !state.prepared && !state.isPuzzle;
  $("#btnPause").hidden = !isTraining;
  $("#annotToolbar").hidden = false;     // outils d'annotation disponibles dès le démarrage
  if (isTraining) clearSavedTraining();
  startChrono();
  nextMove();
}

// ===== Pause + persistance (uniquement entraînement) =====
const TRAINING_STORAGE_KEY = "trainingPaused";
state.paused = false;
state._pauseInfo = null;

function saveTrainingState() {
  if (state.prepared || state.isPuzzle) return;
  try {
    const snapshot = {
      bag: state.bag,
      board: state.board,
      rack: state.rack.map(t => ({ letter: t.letter })),
      moveNo: state.moveNo,
      totalScore: state.totalScore,
      sumNeg: state.sumNeg,
      spareJokers: state.spareJokers,
      history: state.history,
      lastPlaced: state.lastPlaced || [],
      bestAttempt: state.bestAttempt,
      settings: state.settings,
      chronoElapsed: state._pauseInfo?.elapsed ?? elapsedSeconds(),
      chronoPenalty: state.chronoPenalty,
      moveTimeLeft: state._pauseInfo?.moveTimeLeft ?? state.moveTimeLeft,
      savedAt: Date.now(),
    };
    localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) { console.error("Save training state failed:", e); }
}

function clearSavedTraining() {
  localStorage.removeItem(TRAINING_STORAGE_KEY);
}

function restorePausedTraining() {
  const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    state.bag = s.bag;
    state.board = s.board;
    state.rack = (s.rack || []).map(t => ({ letter: t.letter, used: false, id: nextTileId() }));
    state.moveNo = s.moveNo;
    state.totalScore = s.totalScore;
    state.sumNeg = s.sumNeg;
    state.spareJokers = s.spareJokers || 0;
    state.history = s.history || [];
    state.lastPlaced = s.lastPlaced || [];
    state.bestAttempt = s.bestAttempt || null;
    Object.assign(state.settings, s.settings || {});
    state.chronoPenalty = s.chronoPenalty || 0;
    state.started = true;
    state.paused = true;
    state._pauseInfo = { elapsed: s.chronoElapsed || 0, moveTimeLeft: s.moveTimeLeft || 0 };
    state.chronoFinal = null;
    // UI
    $("#actionRowPreStart").hidden = true;
    $("#actionRowInGame").hidden = false;
    $("#btnPause").hidden = false;
    renderInfo();
    renderRack();
    renderBoard();
    renderGameTitle();
    computeTop();
    // Modale de pause active dès l'arrivée
    $("#pauseModal").hidden = false;
    return true;
  } catch (e) {
    console.error("Restore failed:", e);
    clearSavedTraining();
    return false;
  }
}

function pauseGame({ showModal = true } = {}) {
  if (!state.started || state.chronoFinal != null || state.prepared || state.isPuzzle) return;
  if (state.paused) {
    if (showModal) $("#pauseModal").hidden = false;
    return;
  }
  state.paused = true;
  state._pauseInfo = {
    elapsed: elapsedSeconds(),
    moveTimeLeft: state.moveTimeLeft,
  };
  if (chronoTimer) { clearInterval(chronoTimer); chronoTimer = null; }
  if (moveTimer)   { clearInterval(moveTimer);   moveTimer = null; }
  saveTrainingState();
  if (showModal) $("#pauseModal").hidden = false;
}
function resumeGame() {
  if (!state.paused) { $("#pauseModal").hidden = true; return; }
  state.paused = false;
  // Repartir le chrono à partir de l'élapsed acquis
  state.chronoStart = Date.now() - (state._pauseInfo.elapsed - state.chronoPenalty) * 1000;
  if (chronoTimer) clearInterval(chronoTimer);
  chronoTimer = setInterval(renderChrono, 1000);
  // Reprendre le minuteur de coup si actif
  if (state.settings.timePerMove > 0 && state._pauseInfo.moveTimeLeft > 0) {
    state.moveTimeLeft = state._pauseInfo.moveTimeLeft;
    if (moveTimer) clearInterval(moveTimer);
    moveTimer = setInterval(() => {
      state.moveTimeLeft--;
      renderMoveTimer();
      if (state.moveTimeLeft <= 0) {
        clearInterval(moveTimer);
        timeoutAdvance();
      }
    }, 1000);
  }
  state._pauseInfo = null;
  $("#pauseModal").hidden = true;
  clearSavedTraining();
}

function endGame() {
  stopChrono();
  stopMoveTimer();
  clearSavedTraining();
  hideFeedback();
  const time = fmtChrono(state.chronoFinal);
  $("#endSummary").innerHTML = `
    <div>Score total : <strong>${state.totalScore}</strong> pts</div>
    <div>Négatif : <strong>${state.sumNeg}</strong></div>
    <div>Temps : <strong>${time}</strong>${state.chronoPenalty ? ` (dont ${state.chronoPenalty}s de pénalités)` : ""}</div>`;
  $("#endModal").hidden = false;
  // Pas de sauvegarde en mode puzzle (rejouer d'un solo)
  if (state.isPuzzle) return;
  // Si c'est une partie pré-tirée → sauvegarder le résultat
  if (state.prepared) saveResultIfPrepared().catch(e => console.error("Sauvegarde KO:", e));
  // Si c'est un entraînement → sauvegarder l'historique perso
  else saveTrainingGame().catch(e => console.error("Sauvegarde entraînement KO:", e));
}

async function saveTrainingGame() {
  const pid = +(localStorage.getItem("currentPlayerId") || 0);
  if (!pid) return;
  if (!window._sb) await loadSupabaseClient();
  const totalTime = state.chronoFinal != null ? state.chronoFinal : elapsedSeconds();
  const { error } = await window._sb.from("training_games").insert({
    player_id: pid,
    mode: state.settings.gameMode,
    with_joker: state.settings.withJoker,
    time_per_move: state.settings.timePerMove,
    total_score: state.totalScore,
    sum_neg: state.sumNeg,
    total_time_seconds: totalTime,
    history: state.history,
  });
  if (error) { console.error("Sauvegarde training_games:", error.message); return; }
  // Rétention 30 max par joueur
  const { data: ids } = await window._sb.from("training_games")
    .select("id").eq("player_id", pid)
    .order("created_at", { ascending: false }).range(30, 999);
  if (ids?.length) {
    await window._sb.from("training_games").delete().in("id", ids.map(x => x.id));
  }
}
window.closeEndModal = () => $("#endModal").hidden = true;

// Mode review à partir de l'historique en mémoire (fin de partie entraînement OU pré-tirée)
window.enterLocalReview = function() {
  if (!state.history.length) { alert("Pas d'historique."); return; }
  // Construire un objet "game" équivalent à ce que renvoie Supabase
  const fakeGame = {
    id: 0,
    name: state.prepared ? state.prepared.name : "Entraînement",
    mode: state.settings.gameMode,
    with_joker: state.settings.withJoker,
    time_per_move: state.settings.timePerMove,
    moves: state.history
      .filter(h => h.top)
      .map(h => ({
        moveNo: h.moveNo,
        rack: h.rack,
        top: {
          word: h.top.word,
          row: h.top.row, col: h.top.col, dir: h.top.dir,
          blanks: h.top.blanks || [],
          score: h.top.score,
          words: h.top.words || [],
        },
      })),
  };
  const fakeResult = {
    total_score: state.totalScore,
    sum_neg: state.sumNeg,
    total_time_seconds: state.chronoFinal || elapsedSeconds(),
    details: state.history,
  };
  review.active = true;
  review.game = fakeGame;
  review.result = fakeResult;
  review.historyByMove = {};
  for (const h of state.history) review.historyByMove[h.moveNo] = h;
  review.step = 1;
  state.started = false;
  document.querySelector(".info-bar")?.style.setProperty("display", "none");
  $("#reviewPanel").hidden = false;
  // (layout déjà en 2 colonnes — rien à faire)
  renderGameTitle();
  showFeedback("success", `📺 Parcours de « ${fakeGame.name} »`,
    `Ton score : <strong>${fakeResult.total_score}</strong> · Négatif : <strong>${fakeResult.sum_neg}</strong> · Temps : <strong>${fmtChrono(fakeResult.total_time_seconds)}</strong>
     · <a href="#" onclick="event.preventDefault();openSheet()" style="color:var(--petrol);text-decoration:underline">feuille de route</a>
`);
  renderReviewStep();
};

async function saveResultIfPrepared() {
  const pid = +(localStorage.getItem("currentPlayerId") || 0);
  if (!pid) { console.log("Pas de joueur sélectionné — résultat non sauvegardé"); return; }
  if (!window._sb) await loadSupabaseClient();
  const totalTime = state.chronoFinal != null ? state.chronoFinal : elapsedSeconds();

  // 1) Sauvegarder dans prepared_game_results (pour la fonction "Revoir")
  const { error: e1 } = await window._sb.from("prepared_game_results").upsert({
    prepared_game_id: state.prepared.id,
    player_id: pid,
    total_score: state.totalScore,
    sum_neg: state.sumNeg,
    total_time_seconds: totalTime,
    details: state.history,
  }, { onConflict: "prepared_game_id,player_id" });
  if (e1) { console.error("Erreur sauvegarde prepared_game_results:", e1.message); return; }

  // 2) Mirroir dans games + results pour que ça remonte dans le classement championnat
  await syncPreparedToChampionship(pid, totalTime);
}

// Crée (si besoin) un games row pour la partie pré-tirée + insère/upsert le résultat du joueur
async function syncPreparedToChampionship(pid, totalTime) {
  const preparedId = state.prepared.id;
  // session_no = 1000+id pour ne pas entrer en collision avec les saisies manuelles
  const sessionNo = 1000 + preparedId;

  // Récupérer ou créer le games row
  let gameId;
  const { data: existing } = await window._sb.from("games").select("id")
    .eq("session_no", sessionNo).eq("game_no", 1).maybeSingle();
  if (existing) {
    gameId = existing.id;
  } else {
    // Charger les métadonnées de la partie pré-tirée (top, date)
    const { data: prep, error: pe } = await window._sb.from("prepared_games")
      .select("total_top_score, name, created_at").eq("id", preparedId).single();
    if (pe) { console.error("Lecture prepared_games:", pe.message); return; }
    const playedOn = (prep.created_at || new Date().toISOString()).slice(0, 10);
    const { data: created, error: ge } = await window._sb.from("games").insert({
      played_on: playedOn,
      session_no: sessionNo,
      game_no: 1,
      top_score: prep.total_top_score,
      notes: `Partie pré-tirée: ${prep.name}`,
    }).select("id").single();
    if (ge) { console.error("Création games:", ge.message); return; }
    gameId = created.id;
  }

  // Coups "ratés" = coups où on a abandonné ou laissé filer le temps
  const missed = state.history.filter(h => h.status === "giveup" || h.status === "timeout").length;

  const { error: re } = await window._sb.from("results").upsert({
    game_id: gameId,
    player_id: pid,
    score: state.totalScore,
    time_seconds: totalTime,
    missed_moves: missed,
  }, { onConflict: "game_id,player_id" });
  if (re) console.error("Sauvegarde results:", re.message);
}

window.openSheet = () => {
  const clickable = review.active;   // permettre le saut à un coup en mode review
  const rows = state.history.map((h, i) => {
    const time = h.timeMs ? (h.timeMs / 1000).toFixed(2) + "s" : "—";
    const statusIcon = { top: "🏆", giveup: "🏳️", timeout: "⏱" }[h.status] || "";
    const played = h.played
      ? `${h.played} (${h.playerScore})`
      : `<em>—</em>`;
    const onclick = clickable ? `onclick="jumpToReviewMove(${h.moveNo})" style="cursor:pointer"` : "";
    return `<tr ${onclick}>
      <td>${h.moveNo}</td>
      <td><code>${h.rack}</code></td>
      <td>${h.top ? `${h.top.word} <span style="color:#888">${h.top.pos}</span>` : "—"}</td>
      <td style="text-align:right">${h.top?.score ?? "—"}</td>
      <td>${played}</td>
      <td style="text-align:right" class="${h.neg < 0 ? 'neg' : ''}">${h.neg < 0 ? h.neg : ''}</td>
      <td>${statusIcon} <span style="color:#888;font-size:.85em">${h.status}</span></td>
      <td style="text-align:right">${time}</td>
    </tr>`;
  }).join("");

  $("#sheetBody").innerHTML = `
    <div style="margin-bottom:10px;font-size:.9rem;color:#5a6a73">
      Score : <strong>${state.totalScore}</strong> · Négatif : <strong>${state.sumNeg}</strong>
      · Temps total : <strong>${fmtChrono(state.chronoFinal ?? elapsedSeconds())}</strong>
    </div>
    <div style="max-height:60vh;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
      <thead><tr style="background:var(--petrol);color:#fff;position:sticky;top:0">
        <th style="padding:6px 8px;text-align:left">#</th>
        <th style="padding:6px 8px;text-align:left">Tirage</th>
        <th style="padding:6px 8px;text-align:left">Top</th>
        <th style="padding:6px 8px;text-align:right">Pts</th>
        <th style="padding:6px 8px;text-align:left">Joué</th>
        <th style="padding:6px 8px;text-align:right">Négatif</th>
        <th style="padding:6px 8px;text-align:left">Statut</th>
        <th style="padding:6px 8px;text-align:right">Temps</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
  $("#sheet").hidden = false;
};
window.closeSheet = () => $("#sheet").hidden = true;

window.jumpToReviewMove = (moveNo) => {
  if (!review.active || !review.game) return;
  // Trouver l'index du coup dans review.game.moves (moveNo peut ne pas correspondre à idx+1
  // si certains coups manquent — sécurité par recherche)
  let idx = review.game.moves.findIndex(m => m.moveNo === moveNo);
  if (idx < 0) idx = moveNo - 1;
  review.step = Math.max(1, Math.min(review.game.moves.length, idx + 1));
  closeSheet();
  renderReviewStep();
};

document.addEventListener("keydown", handleKey);

// --- Raccourcis supplémentaires ---

// Touche Shift seule (tap) : Pause / Reprendre. Détecté via paire keydown/keyup
// SANS autre touche intermédiaire, pour ne pas se déclencher quand on tape une
// majuscule (Shift + lettre).
let shiftAloneFlag = false;
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "Shift") {
    if (!e.repeat) shiftAloneFlag = true;
  } else {
    shiftAloneFlag = false;   // une autre touche est tombée → Shift sert de modificateur
  }
});
document.addEventListener("keyup", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "Shift" && shiftAloneFlag) {
    shiftAloneFlag = false;
    // Seulement en entraînement actif, partie démarrée non terminée
    if (state.started && !state.prepared && state.chronoFinal == null) {
      if (state.paused) resumeGame(); else pauseGame();
    }
  }
});

// Ctrl+N (ou Cmd+N) : nouvelle partie (avec confirmation)
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "n" || e.key === "N")) {
    e.preventDefault();
    if (confirm("Démarrer une nouvelle partie ? La partie en cours sera perdue.")) {
      restartGame();
    }
  }
});
$$(".annot-btn[data-tool]").forEach(b => {
  b.onclick = () => setAnnotTool(b.dataset.tool || "");
});
$("#btnStart").onclick = startGame;
$("#btnGiveUp").onclick = revealTop;
$("#btnPause").onclick = pauseGame;
$("#btnResume").onclick = resumeGame;
// Intercepter le clic sur Accueil : en entraînement actif, on met en pause au lieu
// de quitter directement. Le joueur peut alors choisir Reprendre ou Quitter.
// Intercepte le lien Accueil du header : pause silencieuse + nav
const headerAccueilLink = document.querySelector('.title-row a[href="../index.html"], header a[href="../index.html"]');
if (headerAccueilLink) {
  headerAccueilLink.addEventListener("click", (e) => {
    const isTraining = state.started && state.chronoFinal == null && !state.prepared && !state.isPuzzle;
    if (isTraining && !state.paused) {
      e.preventDefault();
      pauseGame({ showModal: false });   // pause + sauvegarde, sans modale
      setTimeout(() => { window.location.href = headerAccueilLink.href; }, 50);
    }
  }, { capture: true });
}
$("#btnRestart").onclick = () => {
  if (confirm("Démarrer une nouvelle partie ? La partie en cours sera perdue.")) restartGame();
};
$("#btnAbandon").onclick = () => {
  if (!state.started || state.chronoFinal != null) return;
  if (!confirm("Abandonner la partie ? Les coups restants seront révélés automatiquement.")) return;
  abandonRest();
};

// Défile les coups restants en révélant le top à chaque fois (sans pénalité de temps)
function abandonRest() {
  if (state.chronoFinal != null) return;
  if (!state.topMove) return;
  let playerScore = 0, playedWord = null;
  if (state.pending.length) {
    const m = buildMoveFromPending();
    if (m) {
      const r = scoreMove(state.board, m, state.dict);
      if (!r.errors.length) { playerScore = r.score; playedWord = m.word; }
    }
  }
  if (state.bestAttempt && state.bestAttempt.score > playerScore) {
    playerScore = state.bestAttempt.score;
    playedWord = state.bestAttempt.word;
  }
  recordMove({ status: "giveup", playerScore, playedWord });
  placeTopAndAdvance(playerScore);
  nextMove();   // peut déclencher endGame()
  if (state.chronoFinal == null) setTimeout(abandonRest, 80);
}

initGame();

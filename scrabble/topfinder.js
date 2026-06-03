// ============================================================
//  Top finder
//  Trouve le coup au score maximal pour un tirage et un plateau
//  donnés. Algorithme à base d'ancres :
//
//   - Une "ancre" = case vide adjacente à une lettre existante
//     (ou la case centrale si le plateau est vide).
//   - Pour chaque ancre, chaque direction (H, V), chaque offset
//     (position de l'ancre dans le mot), on étend récursivement
//     en plaçant des lettres du chevalet, élagué par hasPrefix().
//   - Pour chaque mot complet, on appelle scoreMove() (qui valide
//     aussi les mots croisés) et on garde le maximum.
// ============================================================

import { BOARD_SIZE, CENTER, scoreMove, applyMove, LETTER_VALUE, VOWELS } from "./engine.js";

// ============================================================
//  Top finder avec départage des isotops (mêmes scores)
//
//  Ordre de priorité :
//   1. Rallongeabilité : préférer un mot dont la (ou les) extrémité
//      peut accueillir une lettre (case adjacente vide, pas en bord
//      ni bloquée). +2 si rallongeable des deux côtés, +1 si un seul.
//   2. Ouverture du plateau : nombre de nouveaux points d'ancrage
//      créés (cases vides adjacentes aux nouvelles lettres).
//   3. Qualité du reliquat : équilibre voyelles/consonnes, malus si
//      on garde un Q sans U disponible (rack ∪ sac), etc.
// ============================================================

export function findTopRanked(board, rack, dict, bag = null, opts = {}) {
  const all = findTop(board, rack, dict, { all: true, ...opts }) || [];
  if (!all.length) return null;
  const top = all[0].score;
  const tied = all.filter(c => c.score === top);
  if (tied.length === 1) return { ...tied[0], isotops: 1 };

  const preserveJoker = !!opts.preserveJoker;

  const scored = tied.map(c => ({
    ...c,
    _noJoker: (c.move.blanks?.length || 0) === 0 ? 1 : 0,
    _ext: scoreExtensibility(board, c.move),
    _open: scoreOpenness(board, c.move),
    _leave: scoreLeave(board, rack, c.move, bag),
  }));
  // Critères, dans l'ordre : (joker préservé si mode joker) → rallongeabilité → ouverture → reliquat
  scored.sort((a, b) =>
    (preserveJoker ? b._noJoker - a._noJoker : 0) ||
    b._ext - a._ext ||
    b._open - a._open ||
    b._leave - a._leave
  );
  return { ...scored[0], isotops: tied.length };
}

function scoreExtensibility(board, move) {
  const dr = move.dir === "V" ? 1 : 0;
  const dc = move.dir === "H" ? 1 : 0;
  const startR = move.row, startC = move.col;
  const endR = startR + (move.word.length - 1) * dr;
  const endC = startC + (move.word.length - 1) * dc;
  let s = 0;
  // côté arrière : case avant le début doit exister ET être vide
  const pr = startR - dr, pc = startC - dc;
  if (pr >= 0 && pc >= 0 && pr < BOARD_SIZE && pc < BOARD_SIZE && !board[pr][pc]) s++;
  // côté avant : case après la fin doit exister ET être vide
  const nr = endR + dr, nc = endC + dc;
  if (nr >= 0 && nc >= 0 && nr < BOARD_SIZE && nc < BOARD_SIZE && !board[nr][nc]) s++;
  return s;
}

function scoreOpenness(board, move) {
  // Nombre de cases vides adjacentes aux NOUVELLES lettres
  const newBoard = applyMove(board, move);
  const dr = move.dir === "V" ? 1 : 0;
  const dc = move.dir === "H" ? 1 : 0;
  let count = 0;
  const seen = new Set();
  for (let i = 0; i < move.word.length; i++) {
    const r = move.row + i * dr, c = move.col + i * dc;
    if (board[r][c]) continue; // pas nouvelle
    for (const [ddr, ddc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ar = r + ddr, ac = c + ddc;
      if (ar < 0 || ar >= BOARD_SIZE || ac < 0 || ac >= BOARD_SIZE) continue;
      const key = `${ar},${ac}`;
      if (seen.has(key)) continue;
      if (!newBoard[ar][ac]) { seen.add(key); count++; }
    }
  }
  return count;
}

function scoreLeave(board, rack, move, bag) {
  // Lettres effectivement retirées du chevalet
  const dr = move.dir === "V" ? 1 : 0;
  const dc = move.dir === "H" ? 1 : 0;
  const used = []; // {letter, isBlank}
  for (let i = 0; i < move.word.length; i++) {
    const r = move.row + i * dr, c = move.col + i * dc;
    if (!board[r][c]) used.push({ letter: move.word[i], isBlank: (move.blanks || []).includes(i) });
  }
  // Construire le reliquat (copie du chevalet, on retire used)
  const leave = rack.slice();
  for (const u of used) {
    let idx = -1;
    if (u.isBlank) idx = leave.indexOf("?");
    else {
      idx = leave.indexOf(u.letter);
      if (idx === -1) idx = leave.indexOf("?");
    }
    if (idx !== -1) leave.splice(idx, 1);
  }
  // Évaluation
  let s = 0;
  // Équilibre voyelles / consonnes (idéal : 2-4 voyelles sur ≤6 lettres restantes)
  if (leave.length > 0) {
    const vowels = leave.filter(l => VOWELS.has(l) || l === "?").length;
    const cons = leave.length - vowels;
    if (vowels === 0 || cons === 0) s -= 5;
    else if (vowels >= 1 && vowels <= 4) s += 1;
  }
  // Q sans U (dans le reliquat + sac)
  const hasQ = leave.includes("Q");
  if (hasQ) {
    const hasU = leave.includes("U") || leave.includes("?") || (bag && bag.U > 0);
    if (!hasU) s -= 8;
  }
  // Trop de doublons
  const counts = {};
  for (const l of leave) counts[l] = (counts[l] || 0) + 1;
  for (const c of Object.values(counts)) if (c >= 3) s -= 2;
  // Légère préférence pour garder un joker
  if (leave.includes("?")) s += 1;
  return s;
}

// ============================================================

export function findTop(board, rack, dict, opts = {}) {
  const maxTilesUsed = opts.maxTilesUsed ?? rack.length;
  const bonuses = opts.bonuses || { 7: 50 };
  const isEmpty = board.every(row => row.every(c => !c));
  const seenMoves = new Set();         // dédupliquer
  const candidates = [];

  const anchors = isEmpty
    ? [[CENTER, CENTER]]
    : findAnchors(board);

  for (const dir of ["H", "V"]) {
    // FFSC : au 1er coup (plateau vide), on ne joue qu'horizontalement
    if (isEmpty && dir === "V") continue;
    const dr = dir === "V" ? 1 : 0;
    const dc = dir === "H" ? 1 : 0;
    for (const [ar, ac] of anchors) {
      // offsets de l'ancre dans le mot : 0..min(rack.length, distance_avant_ancre)
      // L'ancre est en position `offset` du mot. Le mot commence en
      //   (ar - offset*dr, ac - offset*dc)
      // On limite par la place dispo et par le rack.
      const maxOffset = Math.min(rack.length, dir === "H" ? ac : ar);
      for (let offset = 0; offset <= maxOffset; offset++) {
        const startR = ar - offset * dr;
        const startC = ac - offset * dc;
        if (startR < 0 || startC < 0) break;
        // pour éviter doublons : la case juste avant le start doit être
        // hors plateau ou vide (sinon le mot ferait partie d'un mot plus long
        // qu'on trouvera depuis une autre ancre)
        const pr = startR - dr, pc = startC - dc;
        if (pr >= 0 && pc >= 0 && pr < BOARD_SIZE && pc < BOARD_SIZE && board[pr][pc]) {
          continue;
        }
        extend({
          board, dict, rack, dir, dr, dc,
          ar, ac, startR, startC,
          r: startR, c: startC,
          currentWord: "",
          blanksAt: [],
          tilesUsed: 0,
          maxTilesUsed,
          bonuses,
          anchorCovered: false,
          candidates, seenMoves,
        });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return opts.all ? candidates : candidates[0];
}

function findAnchors(board) {
  const out = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]) continue;
      const touches = [[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc]) => {
        const nr = r+dr, nc = c+dc;
        return nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE && board[nr][nc];
      });
      if (touches) out.push([r, c]);
    }
  }
  return out;
}

function extend(ctx) {
  const { board, dict, rack, dir, dr, dc, ar, ac, startR, startC,
          r, c, currentWord, blanksAt, tilesUsed, maxTilesUsed, bonuses,
          anchorCovered, candidates, seenMoves } = ctx;

  // 1) Si on a un mot valide qui couvre l'ancre, et que la prochaine case
  //    est vide / hors plateau → c'est un candidat.
  const offBoard = r >= BOARD_SIZE || c >= BOARD_SIZE;
  const nextEmpty = offBoard || !board[r][c];
  if (anchorCovered && currentWord.length >= 2 && nextEmpty && dict.has(currentWord)) {
    const key = `${dir}|${startR},${startC}|${currentWord}|${blanksAt.join(",")}`;
    if (!seenMoves.has(key)) {
      seenMoves.add(key);
      const move = { word: currentWord, row: startR, col: startC, dir, blanks: [...blanksAt] };
      const result = scoreMove(board, move, dict, { bonuses });
      if (result.errors.length === 0) {
        candidates.push({ score: result.score, move, words: result.words });
      }
    }
  }

  if (offBoard) return;

  // 2) Élagage par préfixe
  if (currentWord && !dict.hasPrefix(currentWord)) return;

  // 3) Si la case est occupée : on doit utiliser la lettre existante (sans consommer du rack)
  const existing = board[r][c];
  if (existing) {
    extend({
      ...ctx,
      r: r + dr, c: c + dc,
      currentWord: currentWord + existing.letter,
      anchorCovered: anchorCovered || (r === ar && c === ac),
    });
    return;
  }

  // 3.5) Contrainte de tuiles maximum (formules 7sur8, 7et8, 789)
  if (tilesUsed >= maxTilesUsed) return;

  // 4) Case vide : essayer chaque lettre du chevalet (sans répéter)
  const tried = new Set();
  for (let i = 0; i < rack.length; i++) {
    const tile = rack[i];
    if (tile === "?") {
      for (let code = 65; code <= 90; code++) {
        const L = String.fromCharCode(code);
        if (tried.has("?" + L)) continue;
        tried.add("?" + L);
        const newRack = rack.slice(); newRack.splice(i, 1);
        extend({
          ...ctx,
          rack: newRack,
          r: r + dr, c: c + dc,
          currentWord: currentWord + L,
          blanksAt: [...blanksAt, currentWord.length],
          tilesUsed: tilesUsed + 1,
          anchorCovered: anchorCovered || (r === ar && c === ac),
        });
      }
    } else {
      if (tried.has(tile)) continue;
      tried.add(tile);
      const newRack = rack.slice(); newRack.splice(i, 1);
      extend({
        ...ctx,
        rack: newRack,
        r: r + dr, c: c + dc,
        currentWord: currentWord + tile,
        tilesUsed: tilesUsed + 1,
        anchorCovered: anchorCovered || (r === ar && c === ac),
      });
    }
  }
}

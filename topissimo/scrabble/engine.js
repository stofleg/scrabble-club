// ============================================================
//  Scrabble — moteur de base (lettres, plateau, score)
//  Convention : lettres en majuscules, sans accents.
//  Le joker est représenté par "?".
// ============================================================

// Valeurs des lettres (Scrabble francophone)
export const LETTER_VALUE = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 10, L: 1, M: 2, N: 1, O: 1, P: 3, Q: 8, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 10, X: 10, Y: 10, Z: 10, "?": 0,
};

// Distribution officielle (102 tuiles)
export const LETTER_BAG = {
  A: 9, B: 2, C: 2, D: 3, E: 15, F: 2, G: 2, H: 2, I: 8, J: 1,
  K: 1, L: 5, M: 3, N: 6, O: 6, P: 2, Q: 1, R: 6, S: 6, T: 6,
  U: 6, V: 2, W: 1, X: 1, Y: 1, Z: 1, "?": 2,
};

export const VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);

// ============================================================
//  Modes de jeu (formules originales FFSC)
// ============================================================
export const GAME_MODES = {
  duplicate: { label: "Normal",    rackSize: 7, maxPlayed: 7, bonuses: { 7: 50 }, defaultTime: 120 },
  blitz:     { label: "Blitz",     rackSize: 7, maxPlayed: 7, bonuses: { 7: 50 }, defaultTime: 60 },
  "7sur8":   { label: "7 sur 8",   rackSize: 8, maxPlayed: 7, bonuses: { 7: 50 },              defaultTime: 120 },
  "7et8":    { label: "7 et 8",    rackSize: 8, maxPlayed: 8, bonuses: { 7: 50, 8: 75 },       defaultTime: 120 },
  "789":     { label: "7, 8 et 9", rackSize: 9, maxPlayed: 9, bonuses: { 7: 50, 8: 75, 9: 100 }, defaultTime: 120 },
};
// Nom affiché en combinant mode + joker
export function modeDisplayName(modeKey, withJoker) {
  const m = GAME_MODES[modeKey] || GAME_MODES.duplicate;
  if (!withJoker) return m.label;
  if (modeKey === "duplicate") return "Joker";
  return `${m.label} joker`;
}
// L'option "joker" est un flag séparé (combinable avec les modes ci-dessus)


// Plateau 15×15 avec bonus.
//  '.' = case normale
//  'd' = lettre doublée (DL)
//  't' = lettre triplée (TL)
//  'D' = mot doublé (DW)
//  'T' = mot triplé (TW)
//  '*' = étoile centrale (= DW)
export const BOARD_BONUSES = [
  "T..d...T...d..T",
  ".D...t...t...D.",
  "..D...d.d...D..",
  "d..D...d...D..d",
  "....D.....D....",
  ".t...t...t...t.",
  "..d...d.d...d..",
  "T..d...*...d..T",
  "..d...d.d...d..",
  ".t...t...t...t.",
  "....D.....D....",
  "d..D...d...D..d",
  "..D...d.d...D..",
  ".D...t...t...D.",
  "T..d...T...d..T",
];
export const BOARD_SIZE = 15;
export const CENTER = 7;

export function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
}

// Type d'une case (compte tenu des tuiles déjà posées : si une case a déjà une
// lettre, son bonus n'agit plus). On garde aussi un masque "lockedBonus" mais
// pour simplifier on regarde juste si board[r][c] est null.
export function cellBonus(r, c) {
  return BOARD_BONUSES[r][c];
}

// ============================================================
//  Score d'un coup
//  move = {
//    word: "BONJOUR",
//    row, col,            // coordonnées de départ
//    dir: "H" | "V",      // horizontal ou vertical
//    blanks: [index, ...] // positions (dans word) où la lettre est un joker
//  }
//  Retourne un objet { score, words: [{word, score}], errors: [...] }
//  Si errors non vide, le coup est illégal.
// ============================================================

export function scoreMove(board, move, dict, opts = {}) {
  const bonuses = opts.bonuses || { 7: 50 };
  const { word, row, col, dir, blanks = [] } = move;
  const errors = [];
  const dr = dir === "V" ? 1 : 0;
  const dc = dir === "H" ? 1 : 0;
  const len = word.length;

  // 1) Vérifier que les lettres tiennent sur le plateau et matchent les lettres existantes
  const placed = []; // tuiles nouvellement posées
  for (let i = 0; i < len; i++) {
    const r = row + i * dr;
    const c = col + i * dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
      errors.push("Mot hors plateau");
      return { score: 0, words: [], errors };
    }
    const existing = board[r][c];
    if (existing) {
      if (existing.letter !== word[i]) {
        errors.push(`Conflit en (${r},${c}) : "${existing.letter}" ≠ "${word[i]}"`);
        return { score: 0, words: [], errors };
      }
    } else {
      placed.push({ r, c, letter: word[i], isBlank: blanks.includes(i) });
    }
  }

  if (placed.length === 0) {
    errors.push("Aucune lettre nouvelle posée");
    return { score: 0, words: [], errors };
  }

  // 2) Vérifier la contiguïté : 1er coup doit passer par le centre,
  //    sinon le mot doit toucher au moins une lettre déjà posée.
  const isFirstMove = board.every(row => row.every(c => !c));
  if (isFirstMove) {
    let passesCenter = false;
    for (let i = 0; i < len; i++) {
      if (row + i * dr === CENTER && col + i * dc === CENTER) passesCenter = true;
    }
    if (!passesCenter) errors.push("Le premier coup doit passer par l'étoile centrale");
  } else {
    // doit toucher une lettre existante (soit le mot principal a une lettre existante,
    // soit l'un des nouveaux placements a un voisin existant)
    const hasExistingInWord = (() => {
      for (let i = 0; i < len; i++) {
        const r = row + i * dr, c = col + i * dc;
        if (board[r][c]) return true;
      }
      return false;
    })();
    const hasAdjacent = placed.some(({ r, c }) =>
      [[1,0],[-1,0],[0,1],[0,-1]].some(([dr2,dc2]) => {
        const nr = r + dr2, nc = c + dc2;
        return nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE && board[nr][nc];
      })
    );
    if (!hasExistingInWord && !hasAdjacent) {
      errors.push("Le mot doit toucher une lettre déjà posée");
    }
  }

  // 3) Construire un plateau "virtuel" qui inclut les tuiles posées,
  //    pour étendre les mots aux deux extrémités et calculer les mots croisés.
  const b = board.map(r => r.slice());
  for (const p of placed) {
    b[p.r][p.c] = { letter: p.letter, isBlank: p.isBlank };
  }

  // 4) Étendre le mot principal aux deux extrémités
  let mainStartR = row, mainStartC = col;
  while (true) {
    const pr = mainStartR - dr, pc = mainStartC - dc;
    if (pr < 0 || pc < 0 || !b[pr][pc]) break;
    mainStartR = pr; mainStartC = pc;
  }
  let mainEndR = row + (len-1)*dr, mainEndC = col + (len-1)*dc;
  while (true) {
    const nr = mainEndR + dr, nc = mainEndC + dc;
    if (nr >= BOARD_SIZE || nc >= BOARD_SIZE || !b[nr][nc]) break;
    mainEndR = nr; mainEndC = nc;
  }

  const collectWord = (sr, sc, ddr, ddc) => {
    const cells = [];
    let r = sr, c = sc;
    while (r>=0 && r<BOARD_SIZE && c>=0 && c<BOARD_SIZE && b[r][c]) {
      cells.push({ r, c, ...b[r][c] });
      r += ddr; c += ddc;
    }
    return cells;
  };

  const wordsFormed = [];
  const mainCells = collectWord(mainStartR, mainStartC, dr, dc);
  wordsFormed.push({ cells: mainCells, isMain: true });

  // Mots croisés : pour chaque nouvelle lettre, regarder la perpendiculaire
  const pdr = dc, pdc = dr; // perpendiculaire
  for (const p of placed) {
    // trouver début perp
    let sr = p.r, sc = p.c;
    while (true) {
      const pr = sr - pdr, pc = sc - pdc;
      if (pr<0 || pc<0 || pr>=BOARD_SIZE || pc>=BOARD_SIZE || !b[pr][pc]) break;
      sr = pr; sc = pc;
    }
    const cells = collectWord(sr, sc, pdr, pdc);
    if (cells.length > 1) wordsFormed.push({ cells, isMain: false });
  }

  // 5) Validation des mots dans le dictionnaire
  const wordStrings = wordsFormed.map(w => w.cells.map(c => c.letter).join(""));
  if (dict) {
    for (const w of wordStrings) {
      if (!dict.has(w)) errors.push(`"${w}" n'est pas dans le dictionnaire`);
    }
  }

  if (errors.length) return { score: 0, words: wordStrings, errors };

  // 6) Calcul du score
  const placedSet = new Set(placed.map(p => `${p.r},${p.c}`));
  let totalScore = 0;
  const wordDetails = [];

  for (const { cells } of wordsFormed) {
    let wordScore = 0;
    let wordMult = 1;
    for (const cell of cells) {
      const key = `${cell.r},${cell.c}`;
      const isNew = placedSet.has(key);
      let letterScore = cell.isBlank ? 0 : LETTER_VALUE[cell.letter];
      if (isNew) {
        const b = BOARD_BONUSES[cell.r][cell.c];
        if (b === "d") letterScore *= 2;
        else if (b === "t") letterScore *= 3;
        else if (b === "D" || b === "*") wordMult *= 2;
        else if (b === "T") wordMult *= 3;
      }
      wordScore += letterScore;
    }
    wordScore *= wordMult;
    totalScore += wordScore;
    wordDetails.push({ word: cells.map(c => c.letter).join(""), score: wordScore });
  }

  // Bonus scrabble (variable selon mode : 7→50, 8→75, 9→100, etc.)
  if (bonuses[placed.length]) totalScore += bonuses[placed.length];

  return { score: totalScore, words: wordDetails, errors: [], placed };
}

// Applique un coup au plateau (renvoie un nouveau plateau)
export function applyMove(board, move) {
  const { word, row, col, dir, blanks = [] } = move;
  const dr = dir === "V" ? 1 : 0;
  const dc = dir === "H" ? 1 : 0;
  const b = board.map(r => r.slice());
  for (let i = 0; i < word.length; i++) {
    const r = row + i * dr, c = col + i * dc;
    if (!b[r][c]) b[r][c] = { letter: word[i], isBlank: blanks.includes(i) };
  }
  return b;
}

// ============================================================
//  Tirage en duplicate (règle officielle FFSC)
//   - Coups 1 à 14 : au moins 2 voyelles ET 2 consonnes
//   - Coup 15 et + : au moins 1 voyelle ET 1 consonne
//   - Si conditions impossibles à satisfaire (sac vidé d'un type),
//     on relâche progressivement.
//   Retourne { drawn: [], bag: nouveauSac } ou { drawn: null, failed: true }
//   si même en relâchant on ne peut plus rien tirer.
// ============================================================
export function drawForDuplicate(bag, kept, moveNo, target = 7) {
  const need = target - kept.length;
  if (need <= 0) return { drawn: [], bag: { ...bag } };

  const baseMin = moveNo >= 15 ? 1 : 2;
  const countTypes = (rack) => {
    const v = rack.filter(l => VOWELS.has(l) || l === "?").length;
    return { vowels: v, consonants: rack.length - v };
  };

  // Si le sac est vide : on retourne le chevalet tel quel SI il a au moins
  // 1 voyelle + 1 consonne (= jouable). Sinon échec (fin de partie).
  const bagEmpty = Object.values(bag).every(c => !c);
  if (bagEmpty) {
    const { vowels, consonants } = countTypes(kept);
    if (vowels >= 1 && consonants >= 1) {
      return { drawn: [], bag: { ...bag }, minApplied: 0 };
    }
    return { drawn: null, bag: { ...bag }, failed: true };
  }

  // On essaie d'abord avec la règle stricte, puis si impossible on relâche
  for (const minVC of [baseMin, 1, 0]) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const trial = { ...bag };
      const drawn = [];
      let ok = true;
      for (let i = 0; i < need; i++) {
        const pool = [];
        for (const [l, c] of Object.entries(trial)) for (let j = 0; j < c; j++) pool.push(l);
        if (!pool.length) { ok = false; break; }
        const idx = Math.floor(Math.random() * pool.length);
        const letter = pool[idx];
        drawn.push(letter);
        trial[letter]--;
      }
      const final = [...kept, ...drawn];
      const { vowels, consonants } = countTypes(final);
      if (vowels >= minVC && consonants >= minVC) {
        return { drawn, bag: trial, minApplied: minVC };
      }
    }
  }
  // Vraiment impossible : tirer sans contrainte ; ne PAS échouer si le
  // résultat final reste jouable (≥1 voyelle + ≥1 consonne).
  const trial = { ...bag };
  const drawn = [];
  for (let i = 0; i < need; i++) {
    const pool = [];
    for (const [l, c] of Object.entries(trial)) for (let j = 0; j < c; j++) pool.push(l);
    if (!pool.length) break;
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool[idx]);
    trial[drawn[drawn.length-1]]--;
  }
  const finalRack = [...kept, ...drawn];
  const { vowels, consonants } = countTypes(finalRack);
  if (vowels === 0 || consonants === 0) {
    return { drawn: null, bag: { ...bag }, failed: true };
  }
  return { drawn, bag: trial, minApplied: 0 };
}

// Tirage générique (utilisé pour tests/contextes hors duplicate)
export function drawRack(bag, n = 7, rule = { minVowels: 0, minConsonants: 0 }) {
  // bag est un objet {LETTRE: nombre restant}. On modifie une copie.
  const b = { ...bag };
  const draw = () => {
    const pool = [];
    for (const [l, count] of Object.entries(b)) {
      for (let i = 0; i < count; i++) pool.push(l);
    }
    if (pool.length === 0) return null;
    const idx = Math.floor(Math.random() * pool.length);
    const letter = pool[idx];
    b[letter]--;
    return letter;
  };

  // Plusieurs essais pour respecter la règle voyelles/consonnes
  for (let attempt = 0; attempt < 20; attempt++) {
    const trial = { ...b };
    const rack = [];
    for (let i = 0; i < n; i++) {
      const all = [];
      for (const [l, c] of Object.entries(trial)) for (let j = 0; j < c; j++) all.push(l);
      if (!all.length) break;
      const idx = Math.floor(Math.random() * all.length);
      rack.push(all[idx]);
      trial[all[idx]]--;
    }
    const v = rack.filter(l => VOWELS.has(l) || l === "?").length;
    const c = rack.length - v;
    if (v >= rule.minVowels && c >= rule.minConsonants) {
      // commit
      for (const l of rack) b[l]--;
      return { rack, bag: b };
    }
  }
  // fallback : tirage simple
  const rack = [];
  for (let i = 0; i < n; i++) { const l = draw(); if (l) rack.push(l); }
  return { rack, bag: b };
}

export function bagTotalVowels(bag) {
  let v = 0; for (const l of Object.keys(bag)) if (VOWELS.has(l)) v += bag[l]; return v;
}
export function bagTotalConsonants(bag) {
  let c = 0; for (const l of Object.keys(bag)) if (!VOWELS.has(l) && l !== "?") c += bag[l]; return c;
}

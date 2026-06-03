// ============================================================
//  Dictionnaire ODS9
//  Charge le fichier ods9.txt (un mot par ligne) et expose :
//    - has(word) : test d'appartenance O(log n)
//    - hasPrefix(prefix) : existe-t-il un mot commençant par ce préfixe
//    - byAnagram(sortedLetters) : retourne les mots formables exactement
//        avec ces lettres (clé = lettres triées)
//
//  Implémentation : tableau trié + binary search. Pour byAnagram, on
//  construit une Map (clé = lettres triées) → tableau de mots, lazily
//  par tranche de longueur pour limiter la mémoire.
// ============================================================

export class Dictionary {
  constructor() {
    this.words = [];           // tableau trié
    this.byLen = new Map();    // length → array of words
    this.anagramByLen = new Map(); // length → Map(sortedLetters → [words])
    this.loaded = false;
  }

  async load(url = "ods9.txt") {
    const t0 = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error("Impossible de charger " + url);
    const text = await res.text();
    this.words = text.split("\n").filter(Boolean);
    // déjà trié à la génération, mais on s'assure :
    // this.words.sort();
    for (const w of this.words) {
      if (!this.byLen.has(w.length)) this.byLen.set(w.length, []);
      this.byLen.get(w.length).push(w);
    }
    this.loaded = true;
    const t1 = performance.now();
    console.log(`Dictionnaire chargé : ${this.words.length} mots en ${(t1-t0).toFixed(0)} ms`);
    return this;
  }

  // O(log n) — recherche binaire
  has(word) {
    if (!word) return false;
    const W = this.words;
    let lo = 0, hi = W.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cmp = W[mid] < word ? -1 : W[mid] > word ? 1 : 0;
      if (cmp === 0) return true;
      if (cmp < 0) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }

  // O(log n) — vérifie qu'il existe au moins un mot commençant par ce préfixe
  hasPrefix(prefix) {
    if (!prefix) return true;
    const W = this.words;
    let lo = 0, hi = W.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (W[mid] < prefix) lo = mid + 1; else hi = mid;
    }
    return lo < W.length && W[lo].startsWith(prefix);
  }

  // Index "anagrammes" pour une longueur donnée (lazily built)
  _ensureAnagram(len) {
    if (this.anagramByLen.has(len)) return this.anagramByLen.get(len);
    const map = new Map();
    const arr = this.byLen.get(len) || [];
    for (const w of arr) {
      const key = [...w].sort().join("");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(w);
    }
    this.anagramByLen.set(len, map);
    return map;
  }

  // Retourne tous les mots formables avec exactement ces lettres
  // (lettres = string, jokers acceptés ? remplacés par chaque lettre)
  byAnagram(letters) {
    const map = this._ensureAnagram(letters.length);
    const blanks = (letters.match(/\?/g) || []).length;
    const fixed = letters.replace(/\?/g, "").split("").sort().join("");
    if (blanks === 0) {
      return map.get(fixed) || [];
    }
    // Avec jokers : énumérer toutes les complétions possibles
    const out = new Set();
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const tryRec = (depth, current) => {
      if (depth === blanks) {
        const key = (current + fixed).split("").sort().join("");
        const ws = map.get(key);
        if (ws) for (const w of ws) out.add(w);
        return;
      }
      for (const a of alpha) tryRec(depth + 1, current + a);
    };
    tryRec(0, "");
    return [...out];
  }

  // Mots formables avec UN SOUS-ENSEMBLE des lettres (≤ len lettres)
  // (utile pour énumérer les coups quand on n'utilise pas tout le chevalet)
  bySubsetAnagram(letters, minLen = 2) {
    const blanks = (letters.match(/\?/g) || []).length;
    const fixed = letters.replace(/\?/g, "");
    const result = new Set();
    // pour chaque longueur de mot ≥ minLen et ≤ letters.length
    for (let L = minLen; L <= letters.length; L++) {
      const map = this._ensureAnagram(L);
      // énumérer les sous-ensembles de `fixed` de taille (L - kBlanks),
      // pour kBlanks ∈ [0, min(blanks, L)]
      for (let k = 0; k <= Math.min(blanks, L); k++) {
        const subLen = L - k;
        if (subLen > fixed.length) continue;
        // subsets de taille subLen
        const seen = new Set();
        const rec = (start, picked) => {
          if (picked.length === subLen) {
            const sorted = picked.slice().sort().join("");
            if (seen.has(sorted)) return;
            seen.add(sorted);
            if (k === 0) {
              const ws = map.get(sorted);
              if (ws) for (const w of ws) result.add(w);
            } else {
              const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
              const rec2 = (depth, current) => {
                if (depth === k) {
                  const key = (current + sorted).split("").sort().join("");
                  const ws = map.get(key);
                  if (ws) for (const w of ws) result.add(w);
                  return;
                }
                for (const a of alpha) rec2(depth + 1, current + a);
              };
              rec2(0, "");
            }
            return;
          }
          for (let i = start; i < fixed.length; i++) {
            picked.push(fixed[i]);
            rec(i + 1, picked);
            picked.pop();
          }
        };
        rec(0, []);
      }
    }
    return [...result];
  }
}

#!/usr/bin/env python3
"""
Audit des thèmes finales dans themods_data.js.

Deux modes :
  python3 audit_finales.py          — vérifie les violations de la règle préfixe ≥ 2 lettres
  python3 audit_finales.py --add    — affiche aussi les mots ODS manquants (non encore dans le thème)

Règle : un mot W dans le thème de finale S est valide si len(W) - len(S) >= 2,
        c'est-à-dire que le préfixe avant la finale fait au moins 2 lettres.
        Exemple : JABLE (J + ABLE) → préfixe = 1 → INVALIDE
                  JETABLE (JET + ABLE) → préfixe = 3 → valide
"""

import json, re, sys, unicodedata

ADD_MODE = "--add" in sys.argv

FINALE_SUFFIXES = {
    "able": "ABLE", "age":  "AGE",  "ail":  "AIL",  "ais":  "AIS",
    "al":   "AL",   "ant":  "ANT",  "ard":  "ARD",  "ase":  "ASE",
    "eau":  "EAU",  "erie": "ERIE", "et":   "ET",   "ette": "ETTE",
    "eur":  "EUR",  "eux":  "EUX",  "ide":  "IDE",  "ien":  "IEN",
    "ier":  "IER",  "if":   "IF",   "in":   "IN",   "ique": "IQUE",
    "isme": "ISME", "iste": "ISTE", "ite":  "ITE",  "oir":  "OIR",
    "ois":  "OIS",  "ose":  "OSE",  "ot":   "OT",   "um":   "UM",
    "ure":  "URE",
}

def norm(w):
    return unicodedata.normalize("NFD", w.upper()).encode("ascii", "ignore").decode()

# ── Chargement data.js ────────────────────────────────────────────────────────
print("Chargement data.js…", flush=True)
with open("data.js", "r", encoding="utf-8") as f:
    raw = f.read()
m = re.match(r"window\.SEQODS_DATA\s*=\s*(\{.*\})\s*;?\s*$", raw, re.DOTALL)
data = json.loads(m.group(1))
canon_list = data["c"]
canon_set = set(canon_list)

# ── Chargement themods_data.js ────────────────────────────────────────────────
print("Chargement themods_data.js…", flush=True)
with open("themods_data.js", "r", encoding="utf-8") as f:
    src = f.read()

# Extraction de chaque thème via eval partiel (on isole le tableau JS)
def extract_theme(src, theme_key):
    pattern = rf"window\.THEMODS_DATA\.{re.escape(theme_key)}\s*=\s*(\[.*?\]);"
    m = re.search(pattern, src, re.DOTALL)
    if not m:
        return []
    arr_str = m.group(1)
    # Convertit le JS en JSON : retire les clés non-quotées
    arr_str = re.sub(r'(\w+):', r'"\1":', arr_str)
    arr_str = re.sub(r',\s*([\]}])', r'\1', arr_str)  # trailing commas
    try:
        return json.loads(arr_str)
    except Exception as e:
        print(f"  [WARN] Parse error for {theme_key}: {e}")
        return []

# ── Vérification ─────────────────────────────────────────────────────────────
total_violations = 0
total_missing = 0

for theme, suffix in sorted(FINALE_SUFFIXES.items()):
    entries = extract_theme(src, theme)
    if not entries:
        print(f"[{theme}] — thème absent ou non parsé")
        continue

    # Mots actuellement dans le thème (normalisés)
    current_words = set()
    violations = []
    for sess in entries:
        for w in sess.get("words", []):
            wn = norm(w)
            current_words.add(wn)
            if not wn.endswith(suffix):
                continue
            prefix = wn[: len(wn) - len(suffix)]
            if len(prefix) < 2:
                violations.append(w)

    total_violations += len(violations)
    if violations:
        print(f"[{theme}] VIOLATIONS préfixe < 2 lettres : {violations}")

    if ADD_MODE:
        # Mots ODS candidats : finissent par le suffixe, préfixe >= 2, pas déjà présents
        missing = []
        for w in canon_list:
            wn = norm(w)
            if not wn.endswith(suffix):
                continue
            prefix = wn[: len(wn) - len(suffix)]
            if len(prefix) < 2:
                continue  # règle préfixe ≥ 2
            if wn not in current_words:
                missing.append(w)
        total_missing += len(missing)
        if missing:
            print(f"[{theme}] MANQUANTS ({len(missing)}) : {missing[:10]}{'…' if len(missing)>10 else ''}")

print()
print(f"Violations : {total_violations}")
if ADD_MODE:
    print(f"Manquants  : {total_missing}")

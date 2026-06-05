#!/usr/bin/env python3
"""
wikt_fetch.py — Batch Wiktionnaire pour remplir les définitions vides de data.js

USAGE :
    python3 wikt_fetch.py analyze              # Stats + génère wikt_todo.json
    python3 wikt_fetch.py fetch [--limit N]    # Fetch depuis fr.wiktionary.org
    python3 wikt_fetch.py apply [--dry-run]    # Injecte dans data.js

FICHIERS :
    wikt_todo.json   — liste des entrées à remplir (généré par analyze)
    wikt_cache.json  — résultats fetchés (accumulé entre runs de fetch)
    data.js          — modifié par apply

NOTES :
    - Le fetch est repris depuis le dernier checkpoint (skip les mots déjà dans le cache)
    - Rate limit : ~5 req/s par défaut, 50 mots par requête API (MediaWiki batch)
    - Les mots sans résultat Wiktionnaire sont marqués null dans le cache
"""

import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests

BASE_DIR   = Path(__file__).parent
DATA_JS    = BASE_DIR / "data.js"
TODO_FILE  = BASE_DIR / "wikt_todo.json"
CACHE_FILE = BASE_DIR / "wikt_cache.json"

WIKT_API   = "https://fr.wiktionary.org/w/api.php"
BATCH_SIZE = 50    # titres par requête API
RATE_LIMIT = 0.2   # secondes entre requêtes (=5 req/s)
UA         = "METHODS-dict-bot/1.0 (https://github.com/stofleg/methods; christophe@antartik.fr)"

# ─── Helpers ────────────────────────────────────────────────────────────────

def load_data():
    src = DATA_JS.read_text(encoding="utf-8")
    json_start = src.index("{")
    data = json.loads(src[json_start:].rstrip().rstrip(";"))
    return data, src[:json_start]

def norm(w):
    if not w:
        return ""
    w = w.upper().replace("Œ", "OE").replace("Æ", "AE")
    w = unicodedata.normalize("NFD", w)
    w = "".join(c for c in w if not unicodedata.combining(c))
    return re.sub(r"[^A-Z]", "", w)

_TYPE_ONLY_PAT = re.compile(
    r"^(?:\s*(?:\[[^\]]*\]\s*)?(?:\([^)]+\)\s*)?"
    r"(?:(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part"
    r"|préf|suff|aff|sym|m|f|pl)\."
    r"(?:\s+et\s+(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part"
    r"|préf|suff|aff|sym|m|f|pl)\.)*\s*)+"
    r"(?:Vx\.\s*|Fam\.\s*|Arg\.\s*|Litt\.\s*|Poét\.\s*)?"
    r"(?:\([^)]+\)\s*)?)*$",
    re.IGNORECASE,
)

def is_empty(fv):
    """True si la définition n'a pas de contenu réel (juste marqueurs grammaticaux)."""
    if not fv:
        return True
    if "(= " in fv or "-->" in fv:
        return False
    # Retire marqueurs structurels et voit s'il reste du texte
    s = re.sub(r"\[[^\]]*\]", "", fv)
    s = re.sub(r"\([^)]+\)", "", s)
    s = re.sub(
        r"\b(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part"
        r"|préf|suff|aff|sym|m|f|pl)\b\.?",
        "",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(r"\b(?:Vx|Fam|Arg|Litt|Poét)\b\.?", "", s, flags=re.IGNORECASE)
    s = re.sub(r"[0-9.,:;!?\-/\s]", "", s)
    return len(s) < 3

def word_for_lookup(e_val):
    """Déduit le mot de recherche Wiktionnaire depuis la valeur e[]."""
    # Prend le premier mot avant virgule/slash
    w = e_val.split(",")[0].split("/")[0].strip()
    # Enlève les parenthèses comme (SE)
    w = re.sub(r"^\(SE\)\s*", "", w, flags=re.IGNORECASE).strip()
    return w.lower()

def extract_type(fv):
    """Extrait le marqueur de type principal (n.m., adj., v., etc.)."""
    m = re.match(r"^(?:\[[^\]]*\]\s*)?(\S+)", fv)
    return m.group(1).rstrip(".") if m else ""

# ─── Wikitext parser ────────────────────────────────────────────────────────

def strip_wiki_markup(text):
    """Nettoie le markup wikicode d'une ligne de définition."""
    # [[lien|texte]] → texte
    text = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", text)
    # {{lien|mot|fr}} → mot (premier arg non-langue)
    def repl_tmpl(m):
        inner = m.group(1)
        parts = inner.split("|")
        # Templates connus à garder partiellement
        if parts[0].lower() in ("lien", "l", "lien2", "lien web"):
            return parts[1] if len(parts) > 1 else ""
        if parts[0].lower() in ("figuré", "fig", "péj", "littéraire", "familier",
                                 "argot", "vulgaire", "populaire", "vieilli",
                                 "archaïque", "didactique", "technique", "médecine"):
            return f"({parts[0].capitalize()})"
        # Templates à supprimer (métadonnées)
        return ""
    text = re.sub(r"\{\{([^}]+)\}\}", repl_tmpl, text)
    # Nettoie doubles espaces, trim
    text = re.sub(r"\s{2,}", " ", text).strip()
    # Retire les parenthèses vides
    text = re.sub(r"\(\s*\)", "", text).strip()
    return text

def parse_fr_definitions(wikitext):
    """
    Extrait les définitions françaises depuis le wikitext fr.wiktionnaire.
    Retourne une liste de chaînes (définitions propres).
    """
    defs = []
    in_french = False
    # Cherche la section langue=fr
    for line in wikitext.split("\n"):
        line_s = line.strip()

        # Détection section langue
        if re.match(r"==\s*\{\{langue\|fr\}\}\s*==", line_s):
            in_french = True
            continue
        # Nouvelle section langue (sortie de fr)
        if re.match(r"==\s*\{\{langue\|(?!fr\}\})", line_s):
            in_french = False
            continue

        if not in_french:
            continue

        # Lignes de définition (# mais pas #:, ##, #*)
        if re.match(r"^#[^:#*]", line):
            defn = line[1:].strip()
            defn = strip_wiki_markup(defn)
            if defn and len(defn) > 4:
                defs.append(defn)

    return defs

def fetch_batch(words):
    """
    Requête MediaWiki pour une liste de mots (max 50).
    Retourne dict {word: [defs]} ou {word: None} si absent.
    """
    titles = "|".join(words)
    params = {
        "action": "query",
        "titles": titles,
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
        "formatversion": "2",
    }
    headers = {"User-Agent": UA}
    try:
        r = requests.get(WIKT_API, params=params, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        print(f"  [ERREUR réseau] {exc}", file=sys.stderr)
        return {w: None for w in words}

    results = {}
    pages = data.get("query", {}).get("pages", [])
    for page in pages:
        title = page.get("title", "").lower()
        if page.get("missing"):
            results[title] = None
            continue
        wikitext = (
            page.get("revisions", [{}])[0]
            .get("slots", {})
            .get("main", {})
            .get("content", "")
        )
        defs = parse_fr_definitions(wikitext)
        results[title] = defs if defs else None

    # Mots dont le title ne matchait pas exactement
    for w in words:
        if w not in results:
            results[w] = None

    return results

# ─── Commandes ───────────────────────────────────────────────────────────────

def cmd_analyze():
    """Génère wikt_todo.json avec les entrées vides à remplir."""
    print("Chargement data.js…")
    data, _ = load_data()
    e_arr, f_arr = data["e"], data["f"]

    todo = []
    stats = {}
    for i, (ev, fv) in enumerate(zip(e_arr, f_arr)):
        if not is_empty(fv):
            continue
        typ = extract_type(fv)
        stats[typ] = stats.get(typ, 0) + 1
        lookup = word_for_lookup(ev)
        todo.append({"idx": i, "entry": ev, "def": fv, "lookup": lookup, "type": typ})

    TODO_FILE.write_text(json.dumps(todo, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nEntrées vides : {len(todo)}")
    print(f"Fichier généré : {TODO_FILE}")
    print(f"\nDistribution par type (top 15) :")
    for k, v in sorted(stats.items(), key=lambda x: -x[1])[:15]:
        print(f"  {v:5d}  {k or '(vide)'}")

    # Aperçu 10 premiers
    print(f"\nAperçu (10 premiers) :")
    for item in todo[:10]:
        print(f"  [{item['idx']}] {item['entry']} → lookup='{item['lookup']}' ({item['type']})")


def cmd_fetch(limit=None, filter_types=None):
    """
    Fetch les définitions depuis fr.wiktionnaire.org.
    Reprend depuis le cache existant.
    """
    if not TODO_FILE.exists():
        print("Erreur : wikt_todo.json absent. Lance d'abord : python3 wikt_fetch.py analyze")
        sys.exit(1)

    todo = json.loads(TODO_FILE.read_text(encoding="utf-8"))

    # Charger cache existant
    cache = {}
    if CACHE_FILE.exists():
        cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    print(f"Cache existant : {len(cache)} mots")

    # Filtrer ce qui reste à fetcher
    to_fetch = []
    for item in todo:
        lookup = item["lookup"]
        if lookup in cache:
            continue
        if filter_types and item.get("type", "") not in filter_types:
            continue
        to_fetch.append(lookup)

    # Dédupliquer (plusieurs entrées peuvent pointer le même mot)
    to_fetch = list(dict.fromkeys(to_fetch))

    if limit:
        to_fetch = to_fetch[:limit]

    total = len(to_fetch)
    print(f"Mots à fetcher : {total}")

    if total == 0:
        print("Rien à fetcher.")
        return

    fetched = 0
    errors  = 0
    found   = 0

    for i in range(0, total, BATCH_SIZE):
        batch = to_fetch[i : i + BATCH_SIZE]
        results = fetch_batch(batch)

        for word, defs in results.items():
            cache[word] = defs[0] if defs else None
            if defs:
                found += 1

        fetched += len(batch)
        errors  += sum(1 for w in batch if cache.get(w) is None)

        # Sauvegarde checkpoint
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

        pct = 100 * fetched / total
        print(
            f"  [{fetched}/{total} {pct:.0f}%] trouvés={found} absents={errors}",
            end="\r",
        )
        time.sleep(RATE_LIMIT)

    print(f"\nTerminé. Trouvés={found}/{total}. Cache → {CACHE_FILE}")


def cmd_apply(dry_run=False):
    """Injecte les définitions fetchées dans data.js."""
    if not TODO_FILE.exists() or not CACHE_FILE.exists():
        print("Erreur : wikt_todo.json ou wikt_cache.json absent.")
        sys.exit(1)

    todo  = json.loads(TODO_FILE.read_text(encoding="utf-8"))
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))

    print("Chargement data.js…")
    data, prefix = load_data()
    e_arr = data["e"]
    f_arr = data["f"]
    g_arr = data["g"]

    # Construire index idx → todo item
    idx_map = {item["idx"]: item for item in todo}

    applied = 0
    skipped = 0

    for item in todo:
        idx    = item["idx"]
        lookup = item["lookup"]
        old_f  = item["def"]

        defn = cache.get(lookup)
        if not defn:
            skipped += 1
            continue

        # Nettoyer : s'assurer qu'il commence par majuscule et finit par point
        defn = defn.strip()
        if defn and defn[0].islower():
            defn = defn[0].upper() + defn[1:]
        if defn and not defn.endswith("."):
            defn += "."

        # Construire la nouvelle définition en préservant les marqueurs existants
        # (ex: "n.m." + " " + "Bâtiment construit pour être habité.")
        new_f = old_f.rstrip() + " " + defn if old_f.strip() else defn
        new_g = e_arr[idx] + " " + new_f

        if dry_run:
            print(f"  [{idx}] {e_arr[idx]}")
            print(f"    OLD: {repr(old_f)}")
            print(f"    NEW: {repr(new_f)}")
            if applied >= 20:
                print("  … (dry-run limité à 20 exemples)")
                break
        else:
            f_arr[idx] = new_f
            g_arr[idx] = new_g

        applied += 1

    if dry_run:
        print(f"\nDry-run : {applied} modifiables, {skipped} sans définition Wiktionnaire")
        return

    data["f"] = f_arr
    data["g"] = g_arr
    out = prefix + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"
    DATA_JS.write_text(out, encoding="utf-8")

    print(f"Applied : {applied} définitions injectées dans data.js")
    print(f"Skipped : {skipped} entrées sans résultat Wiktionnaire")

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)

    cmd = args[0]

    if cmd == "analyze":
        cmd_analyze()

    elif cmd == "fetch":
        limit = None
        filter_types = None
        i = 1
        while i < len(args):
            if args[i] == "--limit" and i + 1 < len(args):
                limit = int(args[i + 1])
                i += 2
            elif args[i] == "--types" and i + 1 < len(args):
                filter_types = set(args[i + 1].split(","))
                i += 2
            else:
                i += 1
        cmd_fetch(limit=limit, filter_types=filter_types)

    elif cmd == "apply":
        dry_run = "--dry-run" in args
        cmd_apply(dry_run=dry_run)

    else:
        print(f"Commande inconnue : {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()

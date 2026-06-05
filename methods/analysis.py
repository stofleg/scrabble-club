import json, re, unicodedata

# Charger data.js
with open('data.js') as f:
    content = f.read()
m = re.match(r'window\.SEQODS_DATA=({.*})', content, re.DOTALL)
data = json.loads(m.group(1))
C, F = data['c'], data['f']

def norm(w):
    w = w.upper().replace('Œ','OE').replace('Æ','AE')
    w = unicodedata.normalize('NFD', w)
    w = ''.join(ch for ch in w if unicodedata.category(ch) != 'Mn')
    return ''.join(ch for ch in w if ch.isalpha())

# Index des mots valides
word_set = set(C)

# Charger vt actuel depuis themods_data.js
with open('themods_data.js') as f:
    content2 = f.read()
m2 = re.search(r'window\.THEMODS_DATA\.vt\s*=\s*(\[.*?\]);', content2, re.DOTALL)
import ast
vt_json = m2.group(1)
# Supprimer les trailing commas avant } ou ]
vt_json_clean = re.sub(r',\s*([\]}])', r'\1', vt_json)
vt_data = json.loads(vt_json_clean)
vt_words = set()
for sess in vt_data:
    for w in sess.get('words', []):
        vt_words.add(norm(w))

print(f"Mots dans vt : {len(vt_words)}")

# Trouver tous les verbes de 9+ lettres avec pp <= 8 lettres
# Stratégie :
# 1. Verbes en -ER de 9 lettres exactement -> pp = verb[:-2]+"E" = 8 lettres
# 2. Verbes en -IR de 9 lettres -> pp = verb[:-1] = 8 lettres (si -IR régulier)
# 3. Verbes irréguliers: chercher dans conjugations

candidates = []
for i, word in enumerate(C):
    defn = F[i] if i < len(F) else ''
    if not defn:
        continue
    # Doit être un verbe (contient "v." ou "v .")
    if not re.search(r'\bv\.', defn):
        continue
    # Exclure intransitifs marqués explicitement
    if re.search(r'\bv\.\s*intr\b|\bv\.\s*i\b', defn, re.I):
        continue
    # Longueur >= 9
    if len(word) < 9:
        continue

    # Calculer pp probable
    pp = None
    pp_len = None
    if word.endswith('ER'):
        pp = word[:-2] + 'E'  # pp normalisé (accent supprimé)
        pp_len = len(pp)  # = len(word) - 1
    elif word.endswith('IR'):
        pp = word[:-1]  # ex: ACCOMPLIR -> ACCOMPLI
        pp_len = len(pp)
    elif word.endswith('RE'):
        # Verbes en -RE: pp variable, skip pour l'instant
        continue
    elif word.endswith('OIR'):
        continue

    if pp_len is None or pp_len > 8:
        continue

    # Vérifier que le pp est un mot valide dans ODS
    if pp not in word_set:
        continue

    candidates.append((word, pp, pp_len, word in vt_words))

# Séparer présents et manquants
present = [(w, pp, ppl) for w, pp, ppl, inVt in candidates if inVt]
missing = [(w, pp, ppl) for w, pp, ppl, inVt in candidates if not inVt]

print(f"\nVerbes 9+ lettres, pp<=8, dans vt déjà : {len(present)}")
print(f"Verbes 9+ lettres, pp<=8, MANQUANTS dans vt : {len(missing)}")

# Afficher tous les manquants groupés par longueur
missing.sort(key=lambda x: (x[2], x[0]))
print("\n--- MANQUANTS (verb, pp, pp_len) ---")
for w, pp, ppl in missing:
    print(f"  {w} -> {pp} ({ppl}L)")

# Stats des présents aussi
print(f"\n--- PRÉSENTS (sample 20) ---")
for w, pp, ppl in sorted(present)[:20]:
    print(f"  {w} -> {pp}")

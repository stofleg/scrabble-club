# Setup — Scrabble Club Championnat

L'app est 100% statique (HTML/JS), hébergeable sur **GitHub Pages**.
Les données sont stockées dans une base **Supabase** gratuite et partagée entre tous les joueurs.

---

## 1. Créer le projet Supabase

1. Va sur https://supabase.com et crée un compte (gratuit, pas de CB demandée).
2. Clique **New project**.
   - Name : `scrabble-club` (libre)
   - Database password : choisis-en un et garde-le quelque part
   - Region : `West EU (Paris)` ou `Frankfurt`
3. Attends ~1 min que le projet soit prêt.

## 2. Créer les tables

1. Dans le menu de gauche : **SQL Editor** → **New query**.
2. Ouvre le fichier [`schema.sql`](schema.sql), copie tout son contenu, colle-le dans l'éditeur.
3. Clique **Run** (en bas à droite). Tu dois voir "Success".

## 3. Récupérer les clés

1. Menu de gauche : ⚙️ **Project Settings** → **API**.
2. Copie :
   - **Project URL** (ex: `https://abcdxyz.supabase.co`)
   - **anon public** key (longue chaîne `eyJ...`)

## 4. Configurer l'app

1. Copie `config.example.js` → `config.js` (à côté de `index.html`).
2. Remplace les valeurs par celles copiées à l'étape 3 :
   ```js
   window.SUPABASE_URL = "https://abcdxyz.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJhbGciOi....";
   ```
3. **Ne pas** commit `config.js` sur un repo public si tu veux limiter l'accès — la clé anon est publique de toute façon, mais autant éviter de la diffuser inutilement. (Ce projet ajoute déjà `config.js` au `.gitignore`.)

> ⚠️ La clé anon est faite pour être exposée côté navigateur. La sécurité repose sur les **Row Level Security policies** définies dans `schema.sql` (ici : lecture + écriture publiques, adapté à un petit club). Si tu veux durcir, on pourra ajouter une auth plus tard.

## 5. Tester en local

Ouvre simplement `index.html` dans ton navigateur. (Sous certains navigateurs, il faut un petit serveur — au pire : `python3 -m http.server` dans le dossier `web/`, puis http://localhost:8000.)

## 6. Déployer sur GitHub Pages

Deux options :

### Option A — Nouveau repo dédié
1. Crée un repo `scrabble-club` sur GitHub.
2. Pousse le contenu du dossier `web/` à la racine du repo (mais **pas** `config.js` si tu veux le garder privé — voir étape 7).
3. Repo → **Settings** → **Pages** → Source = `main` / root → Save.
4. URL : `https://<ton-user>.github.io/scrabble-club/`

### Option B — Dans le repo METHODS
1. Crée un sous-dossier `scrabble/` dans le repo METHODS.
2. Copie-y le contenu de `web/`.
3. URL : `https://<ton-user>.github.io/METHODS/scrabble/`

## 7. À propos de `config.js` sur GitHub

Si tu publies sur un repo **public**, la clé anon Supabase sera visible. Ce n'est pas catastrophique (elle est faite pour ça), mais :

- **Option simple** : commit `config.js` quand même. La sécurité repose sur les RLS policies + le fait que personne ne connaît ton URL.
- **Plus propre** : ne commit pas `config.js`. Chaque utilisateur du club doit alors le créer une fois sur son appareil — pas pratique.
- **Meilleur compromis** : commit `config.js` (le club est petit, l'URL n'est pas indexée), et si abus → on ajoute une auth.

Je recommande l'option simple pour démarrer.

## 8. Utilisation

- Onglet **Joueurs** : ajouter les membres du club.
- En haut à droite : chaque utilisateur choisit son pseudo (mémorisé sur son appareil).
- Onglet **Saisir résultat** : créer une partie (date / soirée / n° / top) puis entrer son score.
- Onglet **Classement** : voir le classement semaine / mois / année avec 3 modes au choix.

Bon scrabble !

# METHODS — Contexte projet

## Déploiement
- **Web app PWA installée sur écran d'accueil iPhone** (pas un site web normal)
- Safari iOS traite les PWA home-screen comme une app native avec cache isolé
- Pour forcer la mise à jour : il faut impérativement bumper `CACHE_NAME` dans `sw.js` ET `CURRENT_CACHE` dans le bloc `<script>` en bas de `index.html` — les deux ensemble, même valeur
- Le service worker supprime tous les caches `methods-*` sauf le courant, puis force un reload via `controllerchange`
- **GitHub Pages sert depuis la branche `main`** — toujours merger sur `main` pour déployer

## Architecture
- SPA pure : une seule page `index.html`, pas de serveur backend
- Vues système : `div.view` avec `position:fixed;inset:0` — une seule `.active` à la fois, gérée par `showView(id)` dans `common.js`
- Modules : **ENTREMODS** (`v-entremods`), **THEMODS** (`v-themods`), **RECHERCHE** (`v-recherche`)
- Fichiers JS : `common.js` (partagé), `entremods.js`, `themods.js`, `app.js`
- Données ODS9 : `data.js`, `themods_data.js`, `ods_data.js` (lourds, ne pas modifier)
- Auth : Firestore REST API (pas de SDK Firebase)

## Versionnage
- Version courante : **v4.27**
- Badge version : `#version-badge` dans index.html
- CACHE_NAME suit le schéma `methods-v{majeur*100+mineur}` (ex. v4.0 → methods-v400)
- À chaque release : bumper `CACHE_NAME` dans `sw.js` + `CURRENT_CACHE` + `#version-badge` dans `index.html`

## BlackScrab (sous-app)
- PWA dans `blackscrab/` avec son propre `sw.js` et `manifest.json`
- Dépendances partagées depuis le parent : `../data.js` (SEQODS_DATA pour les définitions), `../ods_data.js`
- Icônes propres : `blackscrab/icon-192.png`, `blackscrab/icon-512.png` (générées depuis `icon.svg`)
- Version courante : **v1.40**
- Badge version : `#version-badge` dans `blackscrab/index.html`
- CACHE_NAME suit le schéma `blackscrab-v{majeur*100+mineur}` (ex. v1.16 → blackscrab-v116)
- À chaque release : bumper `CACHE_NAME` dans `blackscrab/sw.js` + `CURRENT_CACHE` + `#version-badge` dans `blackscrab/index.html`
- **GitHub Pages sert depuis `main`** — merger sur `main` via PR GitHub pour déployer

## Points clés
- `openDef()` dans `common.js` = lookup dictionnaire depuis les jeux (ouvre `#def-modal`)
- `openDictModal()` dans `common.js` = ouvre la vue `#v-recherche` standalone
- `setDictBtnVisible(bool)` contrôle le bouton flottant desktop `#btn-dict` et les boutons `.btn-dict-kb` du clavier mobile
- `.emv.active { overflow:hidden }` — ne jamais ajouter de boutons flex sans `flex-shrink:0` dans les headers ENTREMODS
- Clavier mobile (`em-kb`, `tm-kb`) : visible seulement sur mobile (`max-width:640px`), géré par `wireKeyboard()` dans `common.js`

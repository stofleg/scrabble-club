# La Garenna Scrabble

App web pour le club de Scrabble La Garenna : gestion de tournois en duplicate, parties pré-tirées partagées, mode entraînement, statistiques par joueur/tournoi/club, mode review coup par coup.

## Stack

- HTML/CSS/JS pur (aucune dépendance build)
- [Supabase](https://supabase.com) pour l'authentification et la base de données
- Dictionnaire ODS9 (407 k mots) chargé côté client
- Moteur Scrabble maison (top finder par ancres + élagage préfixe)

## Démarrage local

```bash
cd web
python3 -m http.server 8000
```
Puis http://localhost:8000

## Configuration

Copie `config.example.js` en `config.js` et renseigne tes clés Supabase.

Voir [`SETUP.md`](SETUP.md) et [`AUTH-SETUP.md`](AUTH-SETUP.md) pour la procédure complète.

## Schémas SQL

À exécuter dans l'ordre dans Supabase SQL Editor :
1. `schema.sql` — tables de base (players, games, results)
2. `scrabble/schema-prepared.sql` — parties pré-tirées
3. `schema-auth.sql` — extension auth.users + training_games
4. `schema-tournaments.sql` — tournois
5. `schema-tournaments-archive.sql` — archivage des tournois

## Déploiement

GitHub Pages → Settings → Pages → Source `main` / root.
URL : `https://<user>.github.io/scrabble-club/`

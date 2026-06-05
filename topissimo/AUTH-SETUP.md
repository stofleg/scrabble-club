# Configuration Supabase Auth

## 1. Activer l'authentification email/password

1. Dans le dashboard Supabase → **Authentication** → **Providers**
2. Active **Email** (déjà activé par défaut)
3. Dans **Configuration** :
   - **Confirm email** : `OFF` (inscription directe, pas de mail de vérification)
   - **Enable sign ups** : `ON`
   - **Allow new users to sign up** : `ON`
   - **Password requirements** : laisser par défaut (min 6 caractères)

## 2. Configurer l'email de récupération de mot de passe

1. **Authentication** → **Email Templates** → **Reset Password**
2. Personnalise le sujet et le contenu (optionnel)
3. **Authentication** → **URL Configuration** :
   - **Site URL** : l'URL de ton site (ex: `https://ton-user.github.io/METHODS/scrabble-club/`)
   - **Redirect URLs** : ajouter l'URL de la page de reset (par défaut on utilise la home)

## 3. Exécuter la migration SQL

Dans **SQL Editor** → **New query**, copie le contenu de [`schema-auth.sql`](schema-auth.sql) → **Run**.

## 4. Test rapide

Ouvre l'app, tu devrais voir un écran de login. Crée un compte, vérifie qu'il fonctionne, déconnecte-toi, reconnecte-toi.

## Notes techniques

- Le pseudo est libre et modifiable
- L'email sert d'identifiant de connexion (unique)
- La table `players` est étendue : chaque joueur peut être lié à un `auth.users.id`
- Les anciens joueurs (créés avant cette migration) ne sont pas perdus mais ne peuvent pas se connecter tant qu'on ne les « réclame » pas

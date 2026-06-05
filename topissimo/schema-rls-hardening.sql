-- ============================================================
--  RLS Hardening — sécurisation des accès Supabase
--  Verrouille les RLS qui étaient toutes en "anon = full access".
--
--  Règles :
--   - Aucun accès anonyme : le visiteur doit être connecté
--   - Lecture des données de jeu : tous les membres authentifiés
--   - Écriture : par défaut sur sa propre ligne (ownership) ou admin
--   - Actions admin (tournois, parties pré-tirées) : email = admin@garenna.fr
--
--  À exécuter dans Supabase > SQL Editor > New query.
--  Idempotent : peut être relancé sans casse.
-- ============================================================

-- ------------------------------------------------------------
--  1) Helpers
-- ------------------------------------------------------------

-- Retourne le player.id correspondant à l'auth.uid() courant
create or replace function public.current_player_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from players where auth_user_id = auth.uid() limit 1;
$$;

-- Renvoie true si l'utilisateur connecté est l'admin du club
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from players
    where auth_user_id = auth.uid()
      and lower(email) = 'admin@garenna.fr'
  );
$$;

-- ------------------------------------------------------------
--  2) PLAYERS
-- ------------------------------------------------------------
drop policy if exists "anon read"   on players;
drop policy if exists "anon write"  on players;
drop policy if exists "auth read"        on players;
drop policy if exists "self insert"      on players;
drop policy if exists "self/admin update" on players;
drop policy if exists "admin delete"     on players;

create policy "auth read" on players
  for select using (auth.role() = 'authenticated');

create policy "self insert" on players
  for insert with check (
    auth.uid() is not null
    and (auth_user_id = auth.uid() or auth_user_id is null)
  );

create policy "self/admin update" on players
  for update using (auth_user_id = auth.uid() or is_admin());

create policy "admin delete" on players
  for delete using (is_admin());

-- ------------------------------------------------------------
--  3) GAMES (sessions club historiques)
-- ------------------------------------------------------------
drop policy if exists "anon read"   on games;
drop policy if exists "anon write"  on games;
drop policy if exists "auth read"   on games;
drop policy if exists "admin write" on games;

create policy "auth read"   on games
  for select using (auth.role() = 'authenticated');

create policy "admin write" on games
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
--  4) RESULTS
-- ------------------------------------------------------------
drop policy if exists "anon read"   on results;
drop policy if exists "anon write"  on results;
drop policy if exists "auth read"   on results;
drop policy if exists "admin write" on results;

create policy "auth read"   on results
  for select using (auth.role() = 'authenticated');

create policy "admin write" on results
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
--  5) TRAINING_GAMES (entraînement personnel)
-- ------------------------------------------------------------
drop policy if exists "anon read"      on training_games;
drop policy if exists "anon write"     on training_games;
drop policy if exists "auth read"      on training_games;
drop policy if exists "self insert"    on training_games;
drop policy if exists "owner update"   on training_games;
drop policy if exists "owner delete"   on training_games;

create policy "auth read" on training_games
  for select using (auth.role() = 'authenticated');

create policy "self insert" on training_games
  for insert with check (player_id = current_player_id());

create policy "owner update" on training_games
  for update using (player_id = current_player_id() or is_admin());

create policy "owner delete" on training_games
  for delete using (player_id = current_player_id() or is_admin());

-- ------------------------------------------------------------
--  6) TOURNAMENTS (admin only pour écriture)
-- ------------------------------------------------------------
drop policy if exists "anon read"   on tournaments;
drop policy if exists "anon write"  on tournaments;
drop policy if exists "auth read"   on tournaments;
drop policy if exists "admin write" on tournaments;

create policy "auth read"   on tournaments
  for select using (auth.role() = 'authenticated');

create policy "admin write" on tournaments
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
--  7) PREPARED_GAMES (parties pré-tirées)
-- ------------------------------------------------------------
drop policy if exists "anon read"   on prepared_games;
drop policy if exists "anon write"  on prepared_games;
drop policy if exists "auth read"   on prepared_games;
drop policy if exists "admin write" on prepared_games;

create policy "auth read"   on prepared_games
  for select using (auth.role() = 'authenticated');

create policy "admin write" on prepared_games
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
--  8) PREPARED_GAME_RESULTS
-- ------------------------------------------------------------
drop policy if exists "anon read"    on prepared_game_results;
drop policy if exists "anon write"   on prepared_game_results;
drop policy if exists "auth read"    on prepared_game_results;
drop policy if exists "self insert"  on prepared_game_results;
drop policy if exists "owner update" on prepared_game_results;
drop policy if exists "owner delete" on prepared_game_results;

create policy "auth read" on prepared_game_results
  for select using (auth.role() = 'authenticated');

create policy "self insert" on prepared_game_results
  for insert with check (player_id = current_player_id());

create policy "owner update" on prepared_game_results
  for update using (player_id = current_player_id() or is_admin());

create policy "owner delete" on prepared_game_results
  for delete using (player_id = current_player_id() or is_admin());

-- ============================================================
--  RAPPELS post-migration
-- ============================================================
-- 1) Désactiver le signup ouvert si tu veux restreindre les inscriptions
--    Supabase Dashboard → Authentication → Providers → Email
--      → décocher "Enable Email Signups" (les nouveaux comptes devront être
--      créés par admin via "Invite user")
--
-- 2) Vérifier que le compte admin@garenna.fr est bien lié dans la table
--    players (auth_user_id non null, email = 'admin@garenna.fr').
--    Sinon : se connecter une fois à l'app avec cet email pour créer le lien.
--
-- 3) Tester : se déconnecter, ouvrir la console du navigateur → toute requête
--    Supabase doit retourner "permission denied" (401) sans token.

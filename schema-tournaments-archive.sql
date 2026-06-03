-- ============================================================
--  Archive des tournois (au lieu de suppression)
-- ============================================================

-- 1) Champ archived_at (null = actif)
alter table tournaments add column if not exists archived_at timestamptz;

-- 2) Changer le comportement de cascade : si jamais un tournoi est physiquement
--    supprimé (via SQL), les parties survivent (tournament_id passe à NULL)
alter table prepared_games drop constraint if exists prepared_games_tournament_id_fkey;
alter table prepared_games
  add constraint prepared_games_tournament_id_fkey
  foreign key (tournament_id) references tournaments(id) on delete set null;

create index if not exists idx_tournaments_archived on tournaments(archived_at);

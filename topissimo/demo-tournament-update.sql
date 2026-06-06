-- ============================================================
--  Mise à jour des résultats du « 🏟 Tournoi démo — Juin 2026 sem 23 »
--  11 joueurs × 10 parties = 110 lignes
--
--  Hypothèses :
--   - Le tournoi existe déjà sous ce nom exact
--   - 10 prepared_games rattachés, ordonnés par id ascending = Partie 1..10
--   - Les 11 pseudos existent dans la table players (orthographe exacte)
--
--  Comportement : UPSERT — remplace les résultats existants (par couple
--  prepared_game_id × player_id), insère si absent.
-- ============================================================

with t as (
  select id from tournaments
  where name = '🏟 Tournoi démo — Juin 2026 sem 23'
  limit 1
),
ordered_games as (
  select id, total_top_score,
         row_number() over (order by id) as partie_no
  from prepared_games
  where tournament_id = (select id from t)
),
data(player_name, partie_no, neg, time_s) as (values
  -- Kanard
  ('Kanard',  1,  10, 774), ('Kanard',  2,   0, 590), ('Kanard',  3,   2, 509),
  ('Kanard',  4,   7, 556), ('Kanard',  5,   6, 368), ('Kanard',  6,   0, 216),
  ('Kanard',  7,   9, 374), ('Kanard',  8,  18, 843), ('Kanard',  9,  28, 713),
  ('Kanard', 10,  51, 913),
  -- Cédric
  ('Cédric',  1,   1, 537), ('Cédric',  2,   2, 712), ('Cédric',  3,   6, 539),
  ('Cédric',  4,  20, 739), ('Cédric',  5,  17, 604), ('Cédric',  6,   7, 375),
  ('Cédric',  7,  27, 347), ('Cédric',  8,  15, 700), ('Cédric',  9,   3, 488),
  ('Cédric', 10,  39, 839),
  -- Tiphaine
  ('Tiphaine',  1,   6, 926), ('Tiphaine',  2,  13, 665), ('Tiphaine',  3,  11, 548),
  ('Tiphaine',  4,  36, 986), ('Tiphaine',  5,  26, 624), ('Tiphaine',  6, 104, 447),
  ('Tiphaine',  7,  32, 445), ('Tiphaine',  8,  18, 784), ('Tiphaine',  9,  15, 665),
  ('Tiphaine', 10,  83,1118),
  -- Sylvain
  ('Sylvain',  1,   9, 738), ('Sylvain',  2,   0, 411), ('Sylvain',  3,   8, 699),
  ('Sylvain',  4,   4, 575), ('Sylvain',  5,  49, 662), ('Sylvain',  6,  62, 486),
  ('Sylvain',  7,   7, 420), ('Sylvain',  8,  10, 728), ('Sylvain',  9,   6, 498),
  ('Sylvain', 10,  38, 743),
  -- stof
  ('stof',  1,   0, 432), ('stof',  2,   3, 597), ('stof',  3,   0, 435),
  ('stof',  4,   5, 616), ('stof',  5,   4, 427), ('stof',  6,  52, 268),
  ('stof',  7,  41, 394), ('stof',  8,  22, 728), ('stof',  9,   3, 663),
  ('stof', 10,   0, 638),
  -- Fab
  ('Fab',  1,  13, 656), ('Fab',  2,   4, 653), ('Fab',  3,   0, 505),
  ('Fab',  4,  26, 884), ('Fab',  5,   7, 674), ('Fab',  6,   0, 345),
  ('Fab',  7,   9, 518), ('Fab',  8,   8, 894), ('Fab',  9,  18, 664),
  ('Fab', 10,  40, 962),
  -- Anaël
  ('Anaël',  1,  15, 769), ('Anaël',  2,  60,1065), ('Anaël',  3,   1, 520),
  ('Anaël',  4,  29,1208), ('Anaël',  5,  36, 563), ('Anaël',  6,  54, 422),
  ('Anaël',  7,  79, 656), ('Anaël',  8,  72,1111), ('Anaël',  9,  64, 978),
  ('Anaël', 10,  99,1131),
  -- oliv
  ('oliv',  1,   5, 492), ('oliv',  2,  12, 894), ('oliv',  3,   0, 379),
  ('oliv',  4,   1, 627), ('oliv',  5,  23, 560), ('oliv',  6,  91, 344),
  ('oliv',  7,   4, 346), ('oliv',  8,   9, 716), ('oliv',  9,  29, 585),
  ('oliv', 10,  24, 708),
  -- Nikos
  ('Nikos',  1,   2, 636), ('Nikos',  2,  13, 690), ('Nikos',  3,  11, 581),
  ('Nikos',  4,  28,1236), ('Nikos',  5,  36, 576), ('Nikos',  6, 112, 542),
  ('Nikos',  7,  46, 469), ('Nikos',  8,  17, 995), ('Nikos',  9,  15, 577),
  ('Nikos', 10,  65, 963),
  -- Luc
  ('Luc',  1,   2, 626), ('Luc',  2,  38, 655), ('Luc',  3,   0, 364),
  ('Luc',  4,   7, 756), ('Luc',  5,   1, 530), ('Luc',  6,  10, 341),
  ('Luc',  7,   6, 493), ('Luc',  8,   0, 435), ('Luc',  9,   3, 544),
  ('Luc', 10,   3, 688),
  -- Micka
  ('Micka',  1,   6, 698), ('Micka',  2,   1, 583), ('Micka',  3,   0, 337),
  ('Micka',  4,   0, 692), ('Micka',  5,   3, 302), ('Micka',  6,   4, 334),
  ('Micka',  7,  46, 408), ('Micka',  8,  15, 718), ('Micka',  9,   3, 411),
  ('Micka', 10,   4, 693)
)
insert into prepared_game_results
  (prepared_game_id, player_id, total_score, sum_neg, total_time_seconds, details, finished_at)
select og.id,
       p.id,
       coalesce(og.total_top_score, 0) - d.neg,
       d.neg,
       d.time_s,
       '[]'::jsonb,
       now()
from data d
join ordered_games og on og.partie_no = d.partie_no
join players p on p.name = d.player_name
on conflict (prepared_game_id, player_id) do update
  set total_score        = excluded.total_score,
      sum_neg            = excluded.sum_neg,
      total_time_seconds = excluded.total_time_seconds,
      finished_at        = excluded.finished_at;

-- Vérification rapide : 110 lignes attendues pour ce tournoi
select count(*) as rows_inserted
from prepared_game_results
where prepared_game_id in (
  select id from prepared_games
  where tournament_id = (select id from tournaments where name = '🏟 Tournoi démo — Juin 2026 sem 23')
);

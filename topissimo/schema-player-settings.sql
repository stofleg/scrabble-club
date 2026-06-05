-- Préférences perso liées au compte du joueur
alter table players add column if not exists settings jsonb default '{}';

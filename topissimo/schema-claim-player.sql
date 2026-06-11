-- ============================================================
--  Rattachement automatique d'un joueur pré-créé (placeholder)
--  à un compte auth, pour éviter les doublons.
--
--  Contexte : l'admin peut créer un joueur par pseudo seul (sans
--  email ni compte). Quand cette personne s'inscrit ensuite, la RLS
--  l'empêche de "réclamer" cette ligne (auth_user_id != auth.uid()),
--  d'où la création d'un doublon. Ces fonctions SECURITY DEFINER
--  permettent un rattachement contrôlé :
--    - claim_player(pseudo)     : lie un joueur NON RATTACHÉ portant
--                                 ce pseudo au compte connecté.
--    - claim_player_by_email()  : idem en se basant sur l'email du
--                                 compte connecté.
--  Dans les deux cas, on ne touche QUE des lignes dont auth_user_id
--  est NULL (placeholders), jamais un joueur déjà rattaché.
-- ============================================================

create or replace function public.claim_player(p_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint;
  v_email text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select email into v_email from auth.users where id = auth.uid();
  select id into v_id
    from players
   where lower(name) = lower(p_name)
     and auth_user_id is null
   limit 1;
  if v_id is null then
    return null;
  end if;
  update players
     set auth_user_id = auth.uid(),
         email        = coalesce(email, v_email)
   where id = v_id;
  return v_id;
end;
$$;

create or replace function public.claim_player_by_email()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint;
  v_email text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return null;
  end if;
  select id into v_id
    from players
   where lower(email) = lower(v_email)
     and auth_user_id is null
   limit 1;
  if v_id is null then
    return null;
  end if;
  update players
     set auth_user_id = auth.uid()
   where id = v_id;
  return v_id;
end;
$$;

grant execute on function public.claim_player(text)    to authenticated;
grant execute on function public.claim_player_by_email() to authenticated;

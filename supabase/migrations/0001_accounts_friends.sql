-- =============================================================================
-- 0001 - Accounts + friends (Phase 1)
--
-- HOW TO RUN (once, on your project):
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run
--
-- The project has "Automatically expose new tables" OFF, so every table and
-- function below is granted to the app explicitly. Everything the app may not
-- do directly (creating friendships, changing usernames) goes through the
-- functions at the bottom, which check the rules on the server.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Profiles: one per account, created automatically on sign-up
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url   text,
  timezone     text,  -- null = use the computer's time zone
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Sign-up passes username + display_name as user metadata. If the username is
-- missing, invalid or taken, this insert fails and so does the sign-up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(btrim(new.raw_user_meta_data ->> 'username')),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      lower(btrim(new.raw_user_meta_data ->> 'username'))
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- Friendships: one row per pair of people
-- -----------------------------------------------------------------------------
create table public.friendships (
  user_low     uuid not null references public.profiles (id) on delete cascade,
  user_high    uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_low, user_high),
  -- Storing the smaller id first means a pair can only exist once.
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);

alter table public.friendships enable row level security;


-- -----------------------------------------------------------------------------
-- Who can see what
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- Profiles: yourself, plus anyone you have a friendship row with (friends and
-- pending requests either way). Phase 2 widens this to people in your polls.
grant select on public.profiles to authenticated;
create policy "profiles: see yourself and your friendships"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where (f.user_low = profiles.id and f.user_high = (select auth.uid()))
         or (f.user_high = profiles.id and f.user_low = (select auth.uid()))
    )
  );

-- Only these columns can be edited, and only on your own row. Usernames can't
-- be changed directly.
grant update (display_name, avatar_url, timezone) on public.profiles to authenticated;
create policy "profiles: edit your own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Friendships: read your own rows. No direct insert/update/delete - use the
-- functions below.
grant select on public.friendships to authenticated;
create policy "friendships: see your own"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));


-- -----------------------------------------------------------------------------
-- Functions the app calls
-- -----------------------------------------------------------------------------

-- Used on the sign-up screen before an account exists.
create function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(btrim(name)));
$$;

-- Returns 'sent', 'accepted' (they had already asked you), 'already_friends'
-- or 'already_requested'.
create function public.send_friend_request(target_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       uuid := auth.uid();
  them     uuid;
  existing public.friendships;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select id into them from public.profiles where username = lower(btrim(target_username));
  if them is null then
    raise exception 'No one has the username %', lower(btrim(target_username));
  end if;
  if them = me then
    raise exception 'You can''t add yourself';
  end if;

  select * into existing
  from public.friendships
  where user_low = least(me, them) and user_high = greatest(me, them)
  for update;

  if found then
    if existing.status = 'accepted' then
      return 'already_friends';
    elsif existing.requested_by = me then
      return 'already_requested';
    end if;
    -- They already asked you, so asking back means yes.
    update public.friendships
    set status = 'accepted', accepted_at = now()
    where user_low = least(me, them) and user_high = greatest(me, them);
    return 'accepted';
  end if;

  insert into public.friendships (user_low, user_high, requested_by)
  values (least(me, them), greatest(me, them), me);
  return 'sent';
end;
$$;

-- Accept or decline a request someone else sent you.
create function public.respond_friend_request(other_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  if accept then
    update public.friendships
    set status = 'accepted', accepted_at = now()
    where user_low = least(me, other_id) and user_high = greatest(me, other_id)
      and status = 'pending' and requested_by = other_id;
  else
    delete from public.friendships
    where user_low = least(me, other_id) and user_high = greatest(me, other_id)
      and status = 'pending' and requested_by = other_id;
  end if;

  if not found then
    raise exception 'That friend request no longer exists';
  end if;
end;
$$;

-- Unfriend, or cancel a request you sent.
create function public.remove_friend(other_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from public.friendships
  where user_low = least(me, other_id) and user_high = greatest(me, other_id);
end;
$$;

-- Your friends and requests, with their profiles. Runs with the caller's own
-- permissions, so it can only return what the policies above allow.
create function public.list_friends()
returns table (
  user_id         uuid,
  username        text,
  display_name    text,
  avatar_url      text,
  status          text,
  requested_by_me boolean,
  since           timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    f.status,
    f.requested_by = (select auth.uid()),
    coalesce(f.accepted_at, f.created_at)
  from public.friendships f
  join public.profiles p
    on p.id = case when f.user_low = (select auth.uid()) then f.user_high else f.user_low end
  where (select auth.uid()) in (f.user_low, f.user_high)
  order by p.display_name;
$$;


-- -----------------------------------------------------------------------------
-- Function permissions. Postgres lets everyone run new functions by default,
-- so take that away first, then allow exactly what the app needs.
-- -----------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.username_available(text) from public;
grant  execute on function public.username_available(text) to anon, authenticated;

revoke execute on function public.send_friend_request(text) from public, anon;
grant  execute on function public.send_friend_request(text) to authenticated;

revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
grant  execute on function public.respond_friend_request(uuid, boolean) to authenticated;

revoke execute on function public.remove_friend(uuid) from public, anon;
grant  execute on function public.remove_friend(uuid) to authenticated;

revoke execute on function public.list_friends() from public, anon;
grant  execute on function public.list_friends() to authenticated;

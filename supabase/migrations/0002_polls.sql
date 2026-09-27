-- =============================================================================
-- 0002 - Polls, join requests, notifications (Phase 2)
--
-- HOW TO RUN (once, after 0001):
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run
--
-- Same approach as 0001: people only see polls they're in, every change goes
-- through a function that checks the rules on the server, and notifications
-- are written only by the triggers in this file.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.polls (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid not null references public.profiles (id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 80),
  -- People needed for a time to happen, counting the creator.
  min_people          int not null default 2 check (min_people between 2 and 20),
  -- End of the last time. Answers and requests lock after this.
  closes_at           timestamptz not null,
  ai_catch_up_enabled boolean not null default false,
  created_at          timestamptz not null default now()
);

create table public.poll_times (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  check (ends_at > starts_at),
  unique (poll_id, starts_at)
);

create table public.poll_invitees (
  poll_id      uuid not null references public.polls (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- Set when they joined through someone's suggestion.
  suggested_by uuid references public.profiles (id) on delete set null,
  invited_at   timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table public.poll_responses (
  time_id      uuid not null references public.poll_times (id) on delete cascade,
  poll_id      uuid not null references public.polls (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- null = cleared. Cleared answers are kept as null instead of deleted,
  -- because live updates for deletes skip the privacy rules.
  answer       text check (answer in ('yes', 'maybe')),
  responded_at timestamptz not null default now(),
  primary key (time_id, user_id)
);

create table public.join_requests (
  id           uuid primary key default gen_random_uuid(),
  poll_id      uuid not null references public.polls (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,  -- the friend to add
  status       text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create unique index join_requests_one_pending on public.join_requests (poll_id, user_id) where status = 'pending';

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,  -- who receives it
  kind            text not null check (kind in ('invited', 'join_request', 'join_approved', 'join_denied', 'answered', 'session_on')),
  poll_id         uuid not null references public.polls (id) on delete cascade,
  actor_id        uuid not null references public.profiles (id) on delete cascade,  -- who caused it
  subject_id      uuid references public.profiles (id) on delete cascade,           -- friend to add / who suggested you
  time_id         uuid references public.poll_times (id) on delete cascade,
  answer          text,
  join_request_id uuid references public.join_requests (id) on delete cascade,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index polls_creator on public.polls (creator_id);
create index poll_times_poll on public.poll_times (poll_id);
create index poll_invitees_user on public.poll_invitees (user_id);
create index poll_responses_poll on public.poll_responses (poll_id);
create index join_requests_poll on public.join_requests (poll_id);
create index notifications_user_created on public.notifications (user_id, created_at desc);


-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Is the signed-in person the creator or an invitee? Used by the rules below.
create function public.is_in_poll(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.polls where id = p_poll_id and creator_id = (select auth.uid()))
      or exists (select 1 from public.poll_invitees where poll_id = p_poll_id and user_id = (select auth.uid()));
$$;

-- Is the signed-in person in any poll together with this person?
create function public.shares_a_poll_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select id as poll_id from public.polls where creator_id = (select auth.uid())
    union
    select poll_id from public.poll_invitees where user_id = (select auth.uid())
  )
  select exists (select 1 from mine join public.polls p on p.id = mine.poll_id where p.creator_id = p_user_id)
      or exists (select 1 from mine join public.poll_invitees i on i.poll_id = mine.poll_id where i.user_id = p_user_id);
$$;

-- Only used inside the functions below (not callable by the app).
create function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where user_low = least(p_a, p_b) and user_high = greatest(p_a, p_b) and status = 'accepted'
  );
$$;

-- Creator + invitees. Only used inside the functions below.
create function public.poll_people_count(p_poll_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select 1 + count(*)::int from public.poll_invitees where poll_id = p_poll_id;
$$;


-- -----------------------------------------------------------------------------
-- Who can see what
-- -----------------------------------------------------------------------------
alter table public.polls enable row level security;
alter table public.poll_times enable row level security;
alter table public.poll_invitees enable row level security;
alter table public.poll_responses enable row level security;
alter table public.join_requests enable row level security;
alter table public.notifications enable row level security;

-- Read-only for the app. All changes go through the functions further down.
grant select on public.polls, public.poll_times, public.poll_invitees, public.poll_responses,
                public.join_requests, public.notifications to authenticated;

create policy "polls: people in the poll"
  on public.polls for select to authenticated using (public.is_in_poll(id));
create policy "poll_times: people in the poll"
  on public.poll_times for select to authenticated using (public.is_in_poll(poll_id));
create policy "poll_invitees: people in the poll"
  on public.poll_invitees for select to authenticated using (public.is_in_poll(poll_id));
create policy "poll_responses: people in the poll"
  on public.poll_responses for select to authenticated using (public.is_in_poll(poll_id));

create policy "join_requests: the creator and whoever asked"
  on public.join_requests for select to authenticated
  using (
    requested_by = (select auth.uid())
    or exists (select 1 from public.polls p where p.id = join_requests.poll_id and p.creator_id = (select auth.uid()))
  );

create policy "notifications: your own"
  on public.notifications for select to authenticated using (user_id = (select auth.uid()));

-- The only change anyone can make directly: marking their own as read.
grant update (read_at) on public.notifications to authenticated;
create policy "notifications: mark your own as read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Profiles: also people in your polls, and people suggested for your polls.
drop policy "profiles: see yourself and your friendships" on public.profiles;
create policy "profiles: see yourself, your friendships and people in your polls"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where (f.user_low = profiles.id and f.user_high = (select auth.uid()))
         or (f.user_high = profiles.id and f.user_low = (select auth.uid()))
    )
    or public.shares_a_poll_with(id)
    -- join_requests' own rule limits this to the creator and whoever asked.
    or exists (select 1 from public.join_requests jr where jr.user_id = profiles.id and jr.status = 'pending')
  );


-- -----------------------------------------------------------------------------
-- Functions the app calls
-- -----------------------------------------------------------------------------

-- Creates a poll with its times and invitees in one step. Returns the poll id.
create function public.create_poll(
  p_title          text,
  p_starts         timestamptz[],
  p_length_minutes int,
  p_invitee_ids    uuid[],
  p_min_people     int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me         uuid := auth.uid();
  v_title    text := btrim(coalesce(p_title, ''));
  v_starts   timestamptz[];
  v_invitees uuid[];
  v_people   int;
  v_poll_id  uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if char_length(v_title) not between 1 and 80 then
    raise exception 'Title must be 1-80 characters';
  end if;
  if p_length_minutes is null or p_length_minutes not between 15 and 720 then
    raise exception 'Length must be between 15 minutes and 12 hours';
  end if;

  select array_agg(distinct s order by s) into v_starts
  from unnest(p_starts) as s
  where s is not null;
  if v_starts is null then
    raise exception 'Add at least one time';
  end if;
  if cardinality(v_starts) > 20 then
    raise exception 'A poll can have at most 20 times';
  end if;
  if v_starts[1] <= now() then
    raise exception 'All times must be in the future';
  end if;

  select array_agg(distinct i) into v_invitees
  from unnest(p_invitee_ids) as i
  where i is not null and i <> me;
  if v_invitees is null then
    raise exception 'Invite at least one friend';
  end if;
  v_people := cardinality(v_invitees) + 1;
  if v_people > 20 then
    raise exception 'A poll can have at most 20 people, including you';
  end if;
  if exists (select 1 from unnest(v_invitees) as i where not public.are_friends(me, i)) then
    raise exception 'You can only invite friends';
  end if;
  if p_min_people is null or p_min_people not between 2 and v_people then
    raise exception 'People needed must be between 2 and % (everyone in the poll)', v_people;
  end if;

  insert into public.polls (creator_id, title, min_people, closes_at)
  values (me, v_title, p_min_people, v_starts[cardinality(v_starts)] + make_interval(mins => p_length_minutes))
  returning id into v_poll_id;

  insert into public.poll_times (poll_id, starts_at, ends_at)
  select v_poll_id, s, s + make_interval(mins => p_length_minutes)
  from unnest(v_starts) as s;

  insert into public.poll_invitees (poll_id, user_id)
  select v_poll_id, i from unnest(v_invitees) as i;

  return v_poll_id;
end;
$$;

-- Yes / Maybe on one time, or null to clear. Invitees only, while open.
create function public.set_answer(p_time_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  v_poll public.polls;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_answer is not null and p_answer not in ('yes', 'maybe') then
    raise exception 'Answer must be yes or maybe (or nothing)';
  end if;

  select p.* into v_poll
  from public.poll_times t
  join public.polls p on p.id = t.poll_id
  where t.id = p_time_id;
  if not found then
    raise exception 'That time no longer exists';
  end if;
  if v_poll.creator_id = me then
    raise exception 'You created this poll, so you are already in for every time';
  end if;
  if not exists (select 1 from public.poll_invitees where poll_id = v_poll.id and user_id = me) then
    raise exception 'You are not invited to this poll';
  end if;
  if now() > v_poll.closes_at then
    raise exception 'This poll is closed';
  end if;

  insert into public.poll_responses (time_id, poll_id, user_id, answer)
  values (p_time_id, v_poll.id, me, p_answer)
  on conflict (time_id, user_id) do update
    set answer = excluded.answer, responded_at = now()
    where public.poll_responses.answer is distinct from excluded.answer;
end;
$$;

-- The creator adds a friend after sending.
create function public.invite_more(p_poll_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  v_poll public.polls;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select * into v_poll from public.polls where id = p_poll_id for update;
  if not found or v_poll.creator_id <> me then
    raise exception 'Only the person who created this poll can invite directly';
  end if;
  if now() > v_poll.closes_at then
    raise exception 'This poll is closed';
  end if;
  if p_user_id = me or exists (select 1 from public.poll_invitees where poll_id = p_poll_id and user_id = p_user_id) then
    raise exception 'They are already in this poll';
  end if;
  if not public.are_friends(me, p_user_id) then
    raise exception 'You can only invite friends';
  end if;
  if public.poll_people_count(p_poll_id) >= 20 then
    raise exception 'This poll is full (20 people)';
  end if;

  insert into public.poll_invitees (poll_id, user_id) values (p_poll_id, p_user_id);

  -- Anyone who had suggested them is covered now.
  update public.join_requests
  set status = 'approved', decided_at = now()
  where poll_id = p_poll_id and user_id = p_user_id and status = 'pending';
end;
$$;

-- An invitee asks the creator to let one of their friends join.
create function public.request_join(p_poll_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  v_poll public.polls;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select * into v_poll from public.polls where id = p_poll_id;
  if not found then
    raise exception 'That poll no longer exists';
  end if;
  if v_poll.creator_id = me then
    raise exception 'You created this poll - invite them directly instead';
  end if;
  if not exists (select 1 from public.poll_invitees where poll_id = p_poll_id and user_id = me) then
    raise exception 'You are not in this poll';
  end if;
  if now() > v_poll.closes_at then
    raise exception 'This poll is closed';
  end if;
  if p_user_id = v_poll.creator_id
     or exists (select 1 from public.poll_invitees where poll_id = p_poll_id and user_id = p_user_id) then
    raise exception 'They are already in this poll';
  end if;
  if not public.are_friends(me, p_user_id) then
    raise exception 'You can only suggest your own friends';
  end if;
  if public.poll_people_count(p_poll_id) >= 20 then
    raise exception 'This poll is full (20 people)';
  end if;
  if exists (select 1 from public.join_requests where poll_id = p_poll_id and user_id = p_user_id and status = 'pending') then
    raise exception 'Someone already asked to add them';
  end if;

  insert into public.join_requests (poll_id, requested_by, user_id) values (p_poll_id, me, p_user_id);
end;
$$;

-- The creator allows or denies a suggestion.
create function public.decide_join_request(p_request_id uuid, p_allow boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me        uuid := auth.uid();
  v_request public.join_requests;
  v_poll    public.polls;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select * into v_request from public.join_requests where id = p_request_id for update;
  if not found then
    raise exception 'That request no longer exists';
  end if;
  select * into v_poll from public.polls where id = v_request.poll_id for update;
  if v_poll.creator_id <> me then
    raise exception 'Only the person who created this poll can decide';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'That request has already been decided';
  end if;
  if now() > v_poll.closes_at then
    raise exception 'This poll is closed';
  end if;

  if p_allow and not exists (select 1 from public.poll_invitees where poll_id = v_poll.id and user_id = v_request.user_id) then
    if public.poll_people_count(v_poll.id) >= 20 then
      raise exception 'This poll is full (20 people)';
    end if;
    insert into public.poll_invitees (poll_id, user_id, suggested_by)
    values (v_poll.id, v_request.user_id, v_request.requested_by);
  end if;

  update public.join_requests
  set status = case when p_allow then 'approved' else 'denied' end, decided_at = now()
  where id = p_request_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- Notifications (written only by these triggers)
-- -----------------------------------------------------------------------------

-- Someone was added to a poll -> tell them.
create function public.notify_on_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, poll_id, actor_id, subject_id)
  select new.user_id, 'invited', new.poll_id, p.creator_id, new.suggested_by
  from public.polls p
  where p.id = new.poll_id;
  return new;
end;
$$;

create trigger poll_invitees_notify
  after insert on public.poll_invitees
  for each row execute function public.notify_on_invite();

-- A suggestion was made -> tell the creator. It was decided -> tell whoever asked.
create function public.notify_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
begin
  select creator_id into v_creator from public.polls where id = new.poll_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, poll_id, actor_id, subject_id, join_request_id)
    values (v_creator, 'join_request', new.poll_id, new.requested_by, new.user_id, new.id);
  elsif new.status is distinct from old.status and new.status in ('approved', 'denied') then
    insert into public.notifications (user_id, kind, poll_id, actor_id, subject_id)
    values (
      new.requested_by,
      case new.status when 'approved' then 'join_approved' else 'join_denied' end,
      new.poll_id, v_creator, new.user_id
    );
    update public.notifications
    set read_at = now()
    where join_request_id = new.id and kind = 'join_request' and read_at is null;
  end if;
  return new;
end;
$$;

create trigger join_requests_notify
  after insert or update on public.join_requests
  for each row execute function public.notify_on_join_request();

-- Someone answered -> tell the creator. A time just got enough people -> tell
-- everyone going to it.
create function public.notify_on_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll    public.polls;
  v_was_yes boolean := false;
  v_going   int;
begin
  if tg_op = 'UPDATE' then
    v_was_yes := old.answer is not distinct from 'yes';
  end if;
  select * into v_poll from public.polls where id = new.poll_id;

  -- One "answered" per person per time: a changed or cleared answer replaces
  -- the creator's unread one instead of piling up.
  delete from public.notifications
  where kind = 'answered' and read_at is null
    and user_id = v_poll.creator_id and actor_id = new.user_id and time_id = new.time_id;
  if new.answer is not null then
    insert into public.notifications (user_id, kind, poll_id, actor_id, time_id, answer)
    values (v_poll.creator_id, 'answered', new.poll_id, new.user_id, new.time_id, new.answer);
  end if;

  -- A new Yes that brings the time to exactly enough people turns it on.
  -- Each person hears about a given time turning on only once.
  if new.answer = 'yes' and not v_was_yes then
    select 1 + count(*) into v_going
    from public.poll_responses
    where time_id = new.time_id and answer = 'yes';

    if v_going = v_poll.min_people then
      insert into public.notifications (user_id, kind, poll_id, actor_id, time_id)
      select g.user_id, 'session_on', new.poll_id, new.user_id, new.time_id
      from (
        select v_poll.creator_id as user_id
        union
        select r.user_id from public.poll_responses r where r.time_id = new.time_id and r.answer = 'yes'
      ) as g
      where g.user_id <> new.user_id
        and not exists (
          select 1 from public.notifications n
          where n.kind = 'session_on' and n.time_id = new.time_id and n.user_id = g.user_id
        );
    end if;
  end if;
  return new;
end;
$$;

create trigger poll_responses_notify
  after insert or update on public.poll_responses
  for each row execute function public.notify_on_answer();


-- -----------------------------------------------------------------------------
-- Live updates (Supabase Realtime). Each person only receives rows the rules
-- above let them see.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.notifications, public.poll_responses, public.poll_invitees;


-- -----------------------------------------------------------------------------
-- Function permissions: take away the Postgres default, then allow exactly
-- what the app needs.
-- -----------------------------------------------------------------------------
revoke execute on function public.notify_on_invite() from public, anon, authenticated;
revoke execute on function public.notify_on_join_request() from public, anon, authenticated;
revoke execute on function public.notify_on_answer() from public, anon, authenticated;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.poll_people_count(uuid) from public, anon, authenticated;

-- Used by the rules, which run as the signed-in person.
revoke execute on function public.is_in_poll(uuid) from public, anon;
grant  execute on function public.is_in_poll(uuid) to authenticated;
revoke execute on function public.shares_a_poll_with(uuid) from public, anon;
grant  execute on function public.shares_a_poll_with(uuid) to authenticated;

revoke execute on function public.create_poll(text, timestamptz[], int, uuid[], int) from public, anon;
grant  execute on function public.create_poll(text, timestamptz[], int, uuid[], int) to authenticated;
revoke execute on function public.set_answer(uuid, text) from public, anon;
grant  execute on function public.set_answer(uuid, text) to authenticated;
revoke execute on function public.invite_more(uuid, uuid) from public, anon;
grant  execute on function public.invite_more(uuid, uuid) to authenticated;
revoke execute on function public.request_join(uuid, uuid) from public, anon;
grant  execute on function public.request_join(uuid, uuid) to authenticated;
revoke execute on function public.decide_join_request(uuid, boolean) from public, anon;
grant  execute on function public.decide_join_request(uuid, boolean) to authenticated;

-- =============================================================================
-- 0003 - Poll chat (Phase 3)
--
-- HOW TO RUN (once, after 0002):
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run
--
-- Each poll has its own chat that only the people in that poll can read or
-- post to. Unlike answers, the chat stays usable after a poll closes.
-- =============================================================================

create table public.poll_messages (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  -- Deleting replaces the text as well, so it is really gone.
  deleted_at timestamptz
);

create index poll_messages_poll_created on public.poll_messages (poll_id, created_at desc);

alter table public.poll_messages enable row level security;

-- Read-only for the app; posting goes through send_message below.
grant select on public.poll_messages to authenticated;
create policy "poll_messages: people in the poll"
  on public.poll_messages for select to authenticated
  using (public.is_in_poll(poll_id));


-- Post a message. Anyone in the poll, open or closed.
create function public.send_message(p_poll_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me         uuid := auth.uid();
  v_content  text := btrim(coalesce(p_content, ''));
  v_message  uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if char_length(v_content) not between 1 and 2000 then
    raise exception 'A message must be between 1 and 2000 characters';
  end if;
  if not exists (select 1 from public.polls where id = p_poll_id and creator_id = me)
     and not exists (select 1 from public.poll_invitees where poll_id = p_poll_id and user_id = me) then
    raise exception 'You are not in this poll';
  end if;

  insert into public.poll_messages (poll_id, author_id, content)
  values (p_poll_id, me, v_content)
  returning id into v_message;
  return v_message;
end;
$$;

-- Delete your own message. The text is overwritten, not just hidden.
create function public.delete_message(p_message_id uuid)
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
  update public.poll_messages
  set content = '[deleted]', deleted_at = now()
  where id = p_message_id and author_id = me and deleted_at is null;
  if not found then
    raise exception 'That message is not yours, or is already deleted';
  end if;
end;
$$;


-- Live updates: new messages appear without a refresh.
alter publication supabase_realtime add table public.poll_messages;


-- Function permissions.
revoke execute on function public.send_message(uuid, text) from public, anon;
grant  execute on function public.send_message(uuid, text) to authenticated;
revoke execute on function public.delete_message(uuid) from public, anon;
grant  execute on function public.delete_message(uuid) to authenticated;

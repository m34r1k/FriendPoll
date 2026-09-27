# FriendPoll

A desktop app for working out when friends are actually free.

Instead of asking "u free tonight?" in a group chat, you create a poll: a title,
the times **you** are free, and the friends you want to play with. Only those
friends get it. Each of them marks the times they are free as **Yes** or
**Maybe** — there is no "No", because not being free just means leaving a time
blank.

Every time where enough people said Yes becomes its own session, so there is no
single winning time. The creator decides how many people are needed (5 for a
5-stack, 2 for a chat) and always counts as one of them.

> **Example.** Ellis creates "MC tonight?" for 9 PM, 11 PM and 1 AM, needs 2
> people, and invites Avery, Dana, Casey and Jules.
> Dana says Yes to 9 PM, Casey says Yes to 11 PM, Jules says Maybe to 9 PM.
> Result: **9 PM is on** (Ellis, Dana — Jules maybe), **11 PM is on**
> (Ellis, Casey), and 1 AM still needs one more person.

## Features

- **Invite-based polls** — you pick exactly who is in, per poll. No servers, no
  channels, no public rooms.
- **Sessions, not winners** — every time is judged on its own, so two groups can
  play at two different times from one poll.
- **Suggesting friends** — anyone in a poll can suggest one of their friends;
  the creator allows or denies it.
- **Notification centre** — one place to see new invites, requests, answers and
  times that just turned on, with unread counts per poll.
- **Live** — invites, answers and new people arrive without a refresh.
- **Time zones** — times are stored in UTC and always shown in each person's own
  time zone.
- **Demo mode** — a button on the sign-in screen opens the whole app with fake
  data, no account needed.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Accounts, usernames, friend requests | Done |
| 2 | Polls, answers, sessions, join requests, notifications | Done |
| 3 | Chat inside each poll | Not started |
| 3b | AI helpers (poll from a sentence, catch me up, "for you") | Not started |
| 4 | Desktop notifications, tray, settings, dark mode, installer | Not started |

`PLAN.txt` holds the full design: the data model, the rules, and what each phase
covers.

## Built with

Electron · React 19 · TypeScript · Tailwind CSS · electron-vite · Supabase
(Postgres, Auth, Realtime)

All the rules live in the database rather than the app: people can only see
polls they are in, and every change goes through a database function that
checks it. A modified copy of the app cannot get around them.

## Running it

You need [Node.js](https://nodejs.org) 20+ and a free
[Supabase](https://supabase.com) project.

1. **Install the packages**

   ```bash
   npm install
   ```

2. **Set up the database.** In your Supabase dashboard, open **SQL Editor → New
   query**, then paste and run each file in `supabase/migrations/` **in order**:

   - `0001_accounts_friends.sql`
   - `0002_polls.sql`

3. **Turn off email confirmation** while testing (optional but recommended):
   **Authentication → Sign In / Providers → Email → Confirm email**. Supabase's
   built-in email sender only allows a few messages per hour, which a group
   signing up at once will hit.

4. **Add your project's details.** Copy `.env.example` to `.env` and fill in the
   two values from **Project Settings → API Keys**:

   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Use the **publishable** (anon) key. Never the secret / service_role key — it
   skips every rule above. `.env` is git-ignored.

5. **Start it**

   ```bash
   npm run dev
   ```

   On Windows you can double-click `start-dev.bat` instead; its window closes
   when you close the app.

### Building an installer

```bash
npm run build
```

Packaging to a `.exe` comes in Phase 4.

## Project layout

```
src/main/          Electron main process (the window)
src/preload/       bridge between the window and the OS
src/renderer/src/
  components/      screens: home, poll, new poll, notifications, friends
  lib/             session rules, time formatting, Supabase client, data loading
  fake/            demo data, used by demo mode only
supabase/migrations/  database setup, run in order
PLAN.txt           full design and phase plan
```

## Notes

- Answers are cleared by blanking them rather than deleting the row, because
  Supabase's live updates send deletions to every subscriber without applying
  the privacy rules.
- A poll closes automatically when its last time ends: answers lock, and it
  moves to "Past".
- Polls hold at most 20 people, including the creator.

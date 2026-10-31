create table if not exists public.poll_votes (
  poll_id text not null check (poll_id in ('costume-adults', 'costume-kids', 'spookiest-cookie')),
  username text not null check (char_length(username) between 1 and 32),
  answer text not null check (char_length(answer) between 1 and 180),
  updated_at timestamptz not null default now(),
  primary key (poll_id, username)
);

alter table public.poll_votes enable row level security;

-- All reads and writes go through the poll-api Edge Function, which uses the
-- service role key. The browser must not access this table directly.
revoke all on table public.poll_votes from anon, authenticated;

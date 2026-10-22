-- QPL Fantasy: бастапқы схема (спецификация 6) және қолжетімділік ережелері (спецификация 8).
-- Ішкі кілттер — uuid, дерек көзінің нөмірлері source_id бағандарында.

create table seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  source_season_id int unique,
  scoring_rules jsonb not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'finished'))
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  source_id int unique,
  name_ru text not null,
  name_kz text,
  code text,
  logo_url text,
  kit jsonb
);

create table players (
  id uuid primary key default gen_random_uuid(),
  source_id int unique,
  first_name text not null,
  last_name text not null,
  club_id uuid references clubs (id),
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  price int not null default 45,
  status text not null default 'available' check (status in ('available', 'injured', 'suspended', 'left')),
  photo_url text,
  needs_review boolean not null default false
);

create table gameweeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id),
  number int not null,
  deadline timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming', 'open', 'live', 'played', 'closed')),
  unique (season_id, number)
);

create table fixtures (
  id uuid primary key default gen_random_uuid(),
  source_id int unique,
  season_id uuid not null references seasons (id),
  gameweek_id uuid references gameweeks (id),
  home_club_id uuid not null references clubs (id),
  away_club_id uuid not null references clubs (id),
  kickoff timestamptz not null,
  status text not null,
  home_score int,
  away_score int,
  needs_review text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table player_match_stats (
  fixture_id uuid not null references fixtures (id) on delete cascade,
  player_id uuid not null references players (id),
  minutes int not null default 0,
  on_minute int,
  off_minute int,
  goals int not null default 0,
  assists int not null default 0,
  penalty_goals int not null default 0,
  own_goals int not null default 0,
  yellow int not null default 0,
  red int not null default 0,
  conceded int not null default 0,
  penalties_saved int not null default 0,
  penalties_missed int not null default 0,
  points int not null default 0,
  points_lines jsonb not null default '[]',
  manual_override boolean not null default false,
  primary key (fixture_id, player_id)
);

create table source_raw (
  id bigserial primary key,
  fixture_source_id int not null,
  fetched_at timestamptz not null default now(),
  body text not null
);

create table source_usage (
  day date primary key,
  requests int not null default 0
);

create table source_skip (
  source_id int primary key,
  reason text not null
);

create table users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  auth_id uuid unique,
  display_name text not null,
  lang text not null default 'kk' check (lang in ('kk', 'ru')),
  notify jsonb not null default '{}',
  role text not null default 'player' check (role in ('player', 'admin')),
  created_at timestamptz not null default now()
);

create table squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  gameweek_id uuid not null references gameweeks (id),
  bank int not null,
  free_transfers int not null,
  chip text check (chip in ('wildcard')),
  unique (user_id, gameweek_id)
);

create table squad_picks (
  squad_id uuid not null references squads (id) on delete cascade,
  player_id uuid not null references players (id),
  slot int not null check (slot between 1 and 15),
  is_captain boolean not null default false,
  is_vice boolean not null default false,
  primary key (squad_id, slot),
  unique (squad_id, player_id)
);

create table transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  gameweek_id uuid not null references gameweeks (id),
  player_out uuid not null references players (id),
  player_in uuid not null references players (id),
  price_out int not null,
  price_in int not null,
  penalty int not null default 0,
  created_at timestamptz not null default now()
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  owner_id uuid not null references users (id),
  created_at timestamptz not null default now()
);

create table league_members (
  league_id uuid not null references leagues (id) on delete cascade,
  user_id uuid not null references users (id),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table gameweek_scores (
  user_id uuid not null references users (id),
  gameweek_id uuid not null references gameweeks (id),
  points int not null default 0,
  penalty int not null default 0,
  season_total int not null default 0,
  rank int,
  primary key (user_id, gameweek_id)
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid references users (id),
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Қолжетімділік: барлық кесте RLS астында, тікелей жазу жоқ (тек серверлік функциялар арқылы)
do $$
declare t text;
begin
  foreach t in array array['seasons', 'clubs', 'players', 'gameweeks', 'fixtures', 'player_match_stats', 'source_raw',
    'source_usage', 'source_skip', 'users', 'squads', 'squad_picks', 'transfers', 'leagues', 'league_members',
    'gameweek_scores', 'audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;

  -- Ашық деректер: барлығы оқиды
  foreach t in array array['seasons', 'clubs', 'players', 'gameweeks', 'fixtures', 'player_match_stats', 'leagues',
    'league_members', 'gameweek_scores']
  loop
    execute format('grant select on %I to anon, authenticated', t);
    execute format('create policy public_read on %I for select using (true)', t);
  end loop;
end $$;

-- Пайдаланушы өзін ғана көреді
grant select on users to authenticated;
create policy own_row on users for select using (auth_id = auth.uid());

-- Өз құрамы — әрқашан, бөтен құрам — тур дедлайнынан кейін
create function squad_visible(sq_user uuid, sq_gameweek uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.id = sq_user and u.auth_id = auth.uid())
      or exists (select 1 from gameweeks g where g.id = sq_gameweek and g.deadline < now())
$$;

grant select on squads, squad_picks, transfers to authenticated;
create policy visible on squads for select using (squad_visible(user_id, gameweek_id));
create policy visible on squad_picks for select using (
  exists (select 1 from squads s where s.id = squad_id and squad_visible(s.user_id, s.gameweek_id))
);
create policy visible on transfers for select using (squad_visible(user_id, gameweek_id));

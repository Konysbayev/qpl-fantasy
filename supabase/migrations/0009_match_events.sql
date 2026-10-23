-- Матч барысы «Кесте» үшін: голдар (минут, автор, пас), карточкалар, ауыстырулар. upsertMatch әр жүктеуде толық ауыстырады.
create table match_events (
  fixture_id uuid not null references fixtures (id) on delete cascade,
  idx int not null,
  minute int not null,
  kind text not null check (kind in ('goal', 'penalty_goal', 'own_goal', 'penalty_missed', 'yellow', 'second_yellow', 'red', 'sub')),
  club_id uuid not null references clubs (id),
  -- Гол/карточка — ойыншы; ауыстыру — кірген ойыншы
  player_id uuid references players (id),
  -- Гол — пас берген; ауыстыру — шыққан ойыншы
  other_player_id uuid references players (id),
  primary key (fixture_id, idx)
);
alter table match_events enable row level security;
grant select on match_events to anon, authenticated;
create policy public_read on match_events for select using (true);

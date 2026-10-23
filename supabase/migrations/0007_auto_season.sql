-- Этап 3: облакта автоматты маусым (жоспар 2026-10-23-stage3-auto-season).
-- Матч бетінің соңғы жүктелген уақыты: ойыннан 2 сағат өткен соң хаттаманы бір рет қайта тексеру үшін
alter table fixtures add column fetched_at timestamptz;

-- Баға шектері (спецификация 4.3): [таза сатып алулардың үлесі, өзгерісі 0.1 млн бірлікпен]
alter table seasons add column price_steps jsonb not null default '[[0.05,1],[0.10,2],[0.20,3]]';

-- Кезеңдік тапсырмалардың соңғы орындалуы (мысалы, күнтізбе — 3 сағатта бір рет)
create table sync_state (
  key text primary key,
  at timestamptz not null
);

-- Әр тур мен түр бойынша хабарлама бір рет жіберіледі
create table notifications_sent (
  gameweek_id uuid not null references gameweeks (id),
  kind text not null check (kind in ('deadline_24h', 'deadline_2h', 'results')),
  sent_at timestamptz not null default now(),
  primary key (gameweek_id, kind)
);

-- Турдан кейінгі баға өзгерісі бір рет қана қолданылады
create table price_changes (
  gameweek_id uuid primary key references gameweeks (id),
  applied_at timestamptz not null default now(),
  changed int not null
);

alter table sync_state enable row level security;
alter table notifications_sent enable row level security;
alter table price_changes enable row level security;
revoke all on sync_state, notifications_sent, price_changes from anon, authenticated;

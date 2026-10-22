-- Трансфер сұрауының бірегейлігі: сол request_id қайта келсе, бұрынғы нәтиже қайтарылады (екінші рет есептен шығару жоқ).
create table transfer_requests (
  request_id uuid primary key,
  user_id uuid not null references users (id),
  gameweek_id uuid not null references gameweeks (id),
  result jsonb,
  created_at timestamptz not null default now()
);
alter table transfer_requests enable row level security;
revoke all on transfer_requests from anon, authenticated;

-- Ойыншыны таңдағандар үлесі (%): әр қатысушының ағымдағы ашық турға дейінгі соңғы құрамы бойынша; жеке дерек жоқ, тек жиынтық
create view player_selection as
with open_gw as (
  select g.deadline from gameweeks g join seasons s on s.id = g.season_id and s.status = 'active'
  where g.deadline > now() order by g.deadline limit 1
), latest as (
  select distinct on (sq.user_id) sq.id from squads sq join gameweeks g on g.id = sq.gameweek_id
  where g.deadline <= (select deadline from open_gw) order by sq.user_id, g.deadline desc
)
select p.player_id, round(100.0 * count(*) / (select count(*) from latest), 1)::float8 as selected_pct
from squad_picks p where p.squad_id in (select id from latest) group by p.player_id;
grant select on player_selection to anon, authenticated;

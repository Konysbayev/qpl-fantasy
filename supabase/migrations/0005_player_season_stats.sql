-- Ойыншының маусымдағы қорытындысы (тек аяқталған матчтар): трансфер тізімі мен ойыншы картасы үшін, жалпыға ашық.
-- «Құрғақ ойын» — 60+ минут және жіберілген гол жоқ; ұпай берілетін позициялар үшін ғана (ҚҚ, ҚОР, ЖҚ).
create view player_season_stats as
select s.player_id,
       sum(s.points)::int as points,
       sum(s.minutes)::int as minutes,
       count(*) filter (where s.minutes > 0)::int as appearances,
       sum(s.goals)::int as goals,
       sum(s.assists)::int as assists,
       count(*) filter (where s.minutes >= 60 and s.conceded = 0 and p.position <> 'FWD')::int as clean_sheets,
       sum(s.yellow)::int as yellow,
       sum(s.red)::int as red
from player_match_stats s
join fixtures f on f.id = s.fixture_id and f.status = 'finished'
join seasons se on se.id = f.season_id and se.status = 'active'
join players p on p.id = s.player_id
group by s.player_id;
grant select on player_season_stats to anon, authenticated;

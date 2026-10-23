-- Ойыншы фотосы (лига сайтынан сілтеме) тек карточкада көрсетіледі.
-- Клуб не лига сұраса, бір командамен өшіріледі: update app_flags set enabled = false where key = 'player_photos'
-- players.photo_url 0001-де бар; тек лига сайтының сілтемесі рұқсат етіледі
alter table players add constraint players_photo_url_source check (photo_url like 'https://kffleague.kz/%');

create table app_flags (
  key text primary key,
  enabled boolean not null
);
alter table app_flags enable row level security;
revoke all on app_flags from anon, authenticated;
insert into app_flags (key, enabled) values ('player_photos', true);

-- Қосымша фотоны тек осы көрініс арқылы алады: жалауша өшсе, бос
create view player_photo as
  select p.id as player_id, p.photo_url as url from players p
  where p.photo_url is not null and exists (select 1 from app_flags f where f.key = 'player_photos' and f.enabled);
grant select on player_photo to anon, authenticated;

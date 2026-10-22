-- Функцияларға сұрау жиілігін шектеу (спецификация 8): кілт (пайдаланушы:функция) бойынша минуттық есептегіш.
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

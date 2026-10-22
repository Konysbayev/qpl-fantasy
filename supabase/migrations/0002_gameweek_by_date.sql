-- Матч турға күні бойынша бөлінеді: сайттағы тур нөмірі бөлек сақталады, өткен дедлайн бекітіледі.
alter table fixtures add column source_tour int;
alter table gameweeks add column deadline_locked boolean not null default false;

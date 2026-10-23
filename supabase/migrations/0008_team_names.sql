-- Жалпы рейтингте көрінетін команда атауы (Telegram аты емес): 3–24 таңба
alter table users add column team_name text check (char_length(team_name) between 3 and 24);

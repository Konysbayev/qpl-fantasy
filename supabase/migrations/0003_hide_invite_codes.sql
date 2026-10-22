-- Лигаға шақыру коды жалпыға ашық емес: тек атауы мен иесі оқылады (кодты серверлік функция ғана береді).
revoke select on leagues from anon, authenticated;
grant select (id, name, owner_id, created_at) on leagues to anon, authenticated;

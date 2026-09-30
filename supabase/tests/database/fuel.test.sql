-- Tests για το καύσιμο ανά αυτοκίνητο (pgTAP): το ορίζει ο ιδιοκτήτης, μόνο γνωστές τιμές.
-- Εκτέλεση: npx supabase test db   (χρειάζεται τοπικό Supabase: npx supabase start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'owner.fuel@example.com', now(), '{}'),
  ('b0000000-0000-0000-0000-00000000000b', 'solo.fuel@example.com', now(), '{}'),
  ('d0000000-0000-0000-0000-00000000000d', 'driver.fuel@example.com', now(), '{}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a"}';
select lives_ok(
  $$ select public.create_fleet('Άλφα', 'ααα-1111', 'diesel') $$,
  '«Έχω δικό μου ταξί» με καύσιμο'
);
select is((select fuel from public.drivers where name = 'Άλφα'), 'diesel', 'το πρώτο αυτοκίνητο έχει το καύσιμο που δηλώθηκε');

select lives_ok(
  $$ insert into public.drivers (id, name, email, fuel)
     values ('a1000000-0000-0000-0000-000000000001', 'Οδηγός', 'driver.fuel@example.com', 'electric') $$,
  'ο ιδιοκτήτης προσθέτει αυτοκίνητο με καύσιμο'
);
select results_eq(
  $$ with u as (update public.drivers set fuel = 'hybrid' where id = 'a1000000-0000-0000-0000-000000000001' returning fuel)
     select fuel from u $$,
  $$ values ('hybrid') $$,
  'ο ιδιοκτήτης αλλάζει το καύσιμο'
);
select throws_ok(
  $$ update public.drivers set fuel = 'coal' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'μόνο βενζίνη, πετρέλαιο, αέριο, υβριδικό ή ηλεκτρικό'
);

-- Ο οδηγός δεν αλλάζει το καύσιμο του αυτοκινήτου (μόνο ο ιδιοκτήτης).
set local request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-00000000000d"}';
select is(public.accept_invite('a1000000-0000-0000-0000-000000000001'), true, 'ο οδηγός αποδέχεται την πρόσκληση');
select results_eq(
  $$ with u as (update public.drivers set fuel = 'petrol' where id = 'a1000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'ο οδηγός δεν αλλάζει το καύσιμο'
);

-- Χωρίς καύσιμο: κενό (η εφαρμογή ρωτά)· άγνωστη τιμή: απορρίπτεται.
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b"}';
select throws_ok(
  $$ select public.create_fleet('Βήτα', null, 'steam') $$,
  '23514', null, 'άγνωστο καύσιμο στο «Έχω δικό μου ταξί» απορρίπτεται'
);
select public.create_fleet('Βήτα', null);
select is((select fuel from public.drivers where name = 'Βήτα'), null, 'χωρίς καύσιμο: κενό, για να ρωτήσει η εφαρμογή');

select * from finish();
rollback;

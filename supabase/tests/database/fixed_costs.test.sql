-- Tests για τα πάγια έξοδα ανά αυτοκίνητο (pgTAP): κόστος άδειας και Ταμείο / ΕΦΚΑ / ΙΚΑ.
-- Τα ορίζει ο ιδιοκτήτης, ο οδηγός τα βλέπει αλλά δεν τα αλλάζει, και δεν μπαίνουν
-- σε κανέναν υπολογισμό (η `monthly_summary` δεν τα γνωρίζει).
-- Εκτέλεση: npx supabase test db   (χρειάζεται τοπικό Supabase: npx supabase start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'owner.fixed@example.com', now(), '{}'),
  ('d0000000-0000-0000-0000-00000000000d', 'driver.fixed@example.com', now(), '{}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a"}';
select public.create_fleet('Άλφα', 'ααα-1111', 'diesel');

-- Νέο αυτοκίνητο: τα πάγια ξεκινούν κενά (= δεν δηλώθηκαν).
select lives_ok(
  $$ insert into public.drivers (id, name, email)
     values ('a1000000-0000-0000-0000-000000000001', 'Οδηγός', 'driver.fixed@example.com') $$,
  'ο ιδιοκτήτης προσθέτει αυτοκίνητο'
);
select results_eq(
  $$ select license_cost, efka_cost from public.drivers where id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values (null::numeric, null::numeric) $$,
  'νέο αυτοκίνητο: τα πάγια κενά, μέχρι να τα συμπληρώσει ο ιδιοκτήτης'
);

select results_eq(
  $$ with u as (
       update public.drivers set license_cost = 160, efka_cost = 210.50
       where id = 'a1000000-0000-0000-0000-000000000001' returning license_cost, efka_cost)
     select license_cost, efka_cost from u $$,
  $$ values (160::numeric, 210.50::numeric) $$,
  'ο ιδιοκτήτης βάζει και αλλάζει τα πάγια (μηνιαία ποσά)'
);
select lives_ok(
  $$ update public.drivers set license_cost = 0 where id = 'a1000000-0000-0000-0000-000000000001' $$,
  'το 0 είναι δηλωμένο ποσό (δεν υπάρχει κόστος)'
);
select throws_ok(
  $$ update public.drivers set efka_cost = -1 where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'αρνητικό πάγιο απορρίπτεται'
);
select throws_ok(
  $$ update public.drivers set license_cost = 2000000 where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'εξωφρενικό πάγιο απορρίπτεται'
);

-- Τα πάγια είναι μόνο πληροφοριακά: δεν περνούν σε κανένα σύνολο της αναφοράς.
select hasnt_column('public', 'monthly_summary', 'license_cost', 'τα πάγια δεν μπαίνουν στη monthly_summary');

-- Ο οδηγός τα βλέπει (είναι του αυτοκινήτου του) αλλά δεν τα αλλάζει.
set local request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-00000000000d"}';
select is(public.accept_invite('a1000000-0000-0000-0000-000000000001'), true, 'ο οδηγός αποδέχεται την πρόσκληση');
select results_eq(
  $$ with u as (update public.drivers set license_cost = 999 where id = 'a1000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'ο οδηγός δεν αλλάζει τα πάγια του αυτοκινήτου του'
);

select * from finish();
rollback;

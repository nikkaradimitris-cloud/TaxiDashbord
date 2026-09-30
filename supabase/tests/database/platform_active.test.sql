-- Tests για το «Δουλεύει με» ανά αυτοκίνητο και εφαρμογή (pgTAP): το αλλάζουν ο ιδιοκτήτης και ο
-- οδηγός του αυτοκινήτου, κανείς άλλος.
-- Εκτέλεση: npx supabase test db   (χρειάζεται τοπικό Supabase: npx supabase start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-0000000000a1', 'owner.apps@example.com', now(), '{}'),
  ('d0000000-0000-0000-0000-0000000000d1', 'driver.apps@example.com', now(), '{}'),
  ('c0000000-0000-0000-0000-0000000000c1', 'other.apps@example.com', now(), '{}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000a1"}';
select public.create_fleet('Άλφα', 'ααα-2222', 'diesel');
insert into public.drivers (id, name, email) values ('a1000000-0000-0000-0000-0000000000a1', 'Οδηγός', 'driver.apps@example.com');
insert into public.platform_rates (driver_id, platform, rate_pct, vat_rate) values
  ('a1000000-0000-0000-0000-0000000000a1', 'uber', 12, 0),
  ('a1000000-0000-0000-0000-0000000000a1', 'bolt', 15, 24);

select is(
  (select active from public.platform_rates where driver_id = 'a1000000-0000-0000-0000-0000000000a1' and platform = 'uber'),
  true,
  'νέο ποσοστό: η εφαρμογή είναι «μέσα» (δουλεύει με αυτήν)'
);
select results_eq(
  $$ with u as (
       update public.platform_rates set active = false
       where driver_id = 'a1000000-0000-0000-0000-0000000000a1' and platform = 'uber'
       returning active, rate_pct
     ) select active, rate_pct from u $$,
  $$ values (false, 12.00::numeric(5, 2)) $$,
  'ο ιδιοκτήτης βγάζει την Uber: «εκτός», το ποσοστό μένει'
);

-- Ο οδηγός του αυτοκινήτου (μετά την «Αποδοχή») αλλάζει το δικό του.
set local request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-0000000000d1"}';
select is(public.accept_invite('a1000000-0000-0000-0000-0000000000a1'), true, 'ο οδηγός αποδέχεται την πρόσκληση');
select results_eq(
  $$ with u as (
       update public.platform_rates set active = true
       where driver_id = 'a1000000-0000-0000-0000-0000000000a1' and platform = 'uber'
       returning 1
     ) select count(*)::int from u $$,
  $$ values (1) $$,
  'ο οδηγός ξαναβάζει την Uber στο δικό του αυτοκίνητο'
);
select lives_ok(
  $$ insert into public.platform_rates (driver_id, platform, rate_pct, vat_rate, active)
     values ('a1000000-0000-0000-0000-0000000000a1', 'freenow', 14, 24, false) $$,
  'ο οδηγός ορίζει ποσοστό FreeNow και τη βάζει «εκτός»'
);

-- Κάποιος άλλος (δικός του στόλος) δεν βλέπει ούτε αλλάζει τίποτα.
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-0000000000c1"}';
select public.create_fleet('Γάμμα', null, 'petrol');
select is(
  (select count(*)::int from public.platform_rates where driver_id = 'a1000000-0000-0000-0000-0000000000a1'),
  0,
  'άλλος στόλος: δεν βλέπει τις εφαρμογές του αυτοκινήτου'
);
select results_eq(
  $$ with u as (
       update public.platform_rates set active = false
       where driver_id = 'a1000000-0000-0000-0000-0000000000a1'
       returning 1
     ) select count(*)::int from u $$,
  $$ values (0) $$,
  'άλλος στόλος: δεν αλλάζει το «Δουλεύει με»'
);

-- Τελική εικόνα (ως ιδιοκτήτης): Uber μέσα, Bolt μέσα, FreeNow εκτός.
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000a1"}';
select results_eq(
  $$ select platform, active from public.platform_rates
     where driver_id = 'a1000000-0000-0000-0000-0000000000a1' order by platform $$,
  $$ values ('bolt', true), ('freenow', false), ('uber', true) $$,
  'Uber και Bolt «μέσα», FreeNow «εκτός»'
);

select * from finish();
rollback;

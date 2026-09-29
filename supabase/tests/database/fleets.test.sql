-- Tests για τους χωριστούς στόλους (pgTAP): κάθε ιδιοκτήτης βλέπει και αλλάζει μόνο τον δικό
-- του στόλο· ο οδηγός συνδέεται μόνο με «Αποδοχή» και ανήκει σε έναν στόλο.
-- Εκτέλεση: npx supabase test db   (χρειάζεται τοπικό Supabase: npx supabase start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- Δύο ιδιοκτήτες (Α, Β), ένας οδηγός που τον προσκαλούν και οι δύο, ένας λογαριασμός χωρίς στόλο.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'owner.a@example.com', now(), '{"full_name": "Άλφα"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'owner.b@example.com', now(), '{"full_name": "Βήτα"}'),
  ('d0000000-0000-0000-0000-00000000000d', 'driver@example.com', now(), '{}'),
  ('e0000000-0000-0000-0000-00000000000e', 'solo@example.com', now(), '{}');

-- ------------------------------------------------------------------
-- Ο στόλος του Α και του Β, με στοιχεία
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a"}';
select lives_ok($$ select public.create_fleet('Άλφα', 'ααα-1111') $$, 'ο Α φτιάχνει τον στόλο του');
insert into public.drivers (id, name, plate, email)
values ('a1000000-0000-0000-0000-000000000001', 'Οδηγός Α', 'ΑΑΑ-2222', 'driver@example.com');
insert into public.shifts (id, driver_id, year, month, z_number, net_revenue)
values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 2026, 9, 'A1', 100);
insert into public.vehicle_expenses (id, driver_id, year, month, description, amount)
values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 2026, 9, 'Έξοδο Α', 12.40);
insert into public.platform_statements (id, driver_id, platform, kind, year, month, vat_rate, commission)
values ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'uber', 'invoice', 2026, 9, 0, 10);
insert into public.platform_rates (driver_id, platform, rate_pct, vat_rate)
values ('a1000000-0000-0000-0000-000000000001', 'uber', 15, 0);

set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b"}';
select lives_ok($$ select public.create_fleet('Βήτα', 'βββ-1111') $$, 'ο Β φτιάχνει τον δικό του στόλο');
select lives_ok(
  $$ insert into public.drivers (id, name, plate, email)
     values ('b1000000-0000-0000-0000-000000000001', 'Οδηγός Β', 'ΒΒΒ-2222', 'Driver@example.com') $$,
  'το ίδιο email και σε άλλον στόλο (από το σφάλμα δεν φαίνεται αν υπάρχει αλλού)'
);
insert into public.shifts (id, driver_id, year, month, z_number, net_revenue)
values ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 2026, 9, 'B1', 200);
insert into public.vehicle_expenses (id, driver_id, year, month, description, amount)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 2026, 9, 'Έξοδο Β', 24.80);
insert into public.platform_statements (id, driver_id, platform, kind, year, month, vat_rate, commission)
values ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'bolt', 'invoice', 2026, 9, 0, 20);
insert into public.platform_rates (driver_id, platform, rate_pct, vat_rate)
values ('b1000000-0000-0000-0000-000000000001', 'bolt', 20, 0);

-- ------------------------------------------------------------------
-- Ο Α βλέπει μόνο τον δικό του στόλο
-- ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a"}';
select results_eq($$ select name from public.fleets $$, $$ values ('Άλφα') $$, 'ο Α βλέπει μόνο τον δικό του στόλο');
select results_eq(
  $$ select name, plate from public.drivers order by name $$,
  $$ values ('Άλφα', 'ΑΑΑ-1111'), ('Οδηγός Α', 'ΑΑΑ-2222') $$,
  'ο Α βλέπει μόνο τα αυτοκίνητα του στόλου του'
);
select results_eq($$ select z_number from public.shifts $$, $$ values ('A1') $$, 'ο Α βλέπει μόνο τις δικές του βάρδιες');
select results_eq(
  $$ select description from public.vehicle_expenses $$, $$ values ('Έξοδο Α') $$,
  'ο Α βλέπει μόνο τα έξοδα του στόλου του'
);
select results_eq(
  $$ select platform from public.platform_statements $$, $$ values ('uber') $$,
  'ο Α βλέπει μόνο τις εφαρμογές του στόλου του'
);
select results_eq(
  $$ select platform from public.platform_rates $$, $$ values ('uber') $$,
  'ο Α βλέπει μόνο τα ποσοστά του στόλου του'
);
select results_eq(
  $$ select driver_name, net_revenue from public.monthly_summary $$,
  $$ values ('Οδηγός Α', 100.00::numeric) $$,
  'η μηνιαία αναφορά του Α έχει μόνο τον στόλο του'
);
select results_eq(
  $$ select email from public.profiles $$, $$ values ('owner.a@example.com') $$,
  'ο Α δεν βλέπει λογαριασμούς άλλων (μόνο τον δικό του)'
);

-- ------------------------------------------------------------------
-- Ο Α δεν γράφει τίποτα στον στόλο του Β
-- ------------------------------------------------------------------
select throws_ok(
  $$ insert into public.shifts (driver_id, year, month, z_number)
     values ('b1000000-0000-0000-0000-000000000001', 2026, 9, 'X') $$,
  '42501', null, 'ο Α δεν καταχωρεί βάρδια σε αυτοκίνητο του Β'
);
select throws_ok(
  $$ insert into public.vehicle_expenses (driver_id, year, month, amount)
     values ('b1000000-0000-0000-0000-000000000001', 2026, 9, 5) $$,
  '42501', null, 'ο Α δεν καταχωρεί έξοδο σε αυτοκίνητο του Β'
);
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, vat_rate, commission)
     values ('b1000000-0000-0000-0000-000000000001', 'uber', 'invoice', 2026, 9, 0, 5) $$,
  '42501', null, 'ο Α δεν καταχωρεί εφαρμογή σε αυτοκίνητο του Β'
);
select throws_ok(
  $$ insert into public.platform_rates (driver_id, platform, rate_pct, vat_rate)
     values ('b1000000-0000-0000-0000-000000000001', 'uber', 10, 0) $$,
  '42501', null, 'ο Α δεν ορίζει ποσοστό σε αυτοκίνητο του Β'
);
select results_eq(
  $$ with u as (update public.shifts set net_revenue = 1 where id = 'b2000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'ο Α δεν αλλάζει βάρδια του Β'
);
select results_eq(
  $$ with d as (delete from public.shifts where id = 'b2000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'ο Α δεν διαγράφει βάρδια του Β'
);
select results_eq(
  $$ with d as (delete from public.vehicle_expenses where id = 'b3000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'ο Α δεν διαγράφει έξοδο του Β'
);
select results_eq(
  $$ with u as (update public.platform_statements set commission = 1
                where id = 'b4000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'ο Α δεν αλλάζει εφαρμογή του Β'
);
select results_eq(
  $$ with u as (update public.platform_rates set rate_pct = 1
                where driver_id = 'b1000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'ο Α δεν αλλάζει ποσοστό του Β'
);
select results_eq(
  $$ with u as (update public.drivers set name = 'Χ' where id = 'b1000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'ο Α δεν αλλάζει οδηγό του Β'
);
select results_eq(
  $$ with d as (delete from public.drivers where id = 'b1000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'ο Α δεν διαγράφει οδηγό του Β'
);
select throws_ok(
  $$ update public.shifts set driver_id = 'b1000000-0000-0000-0000-000000000001'
     where id = 'a2000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'ο Α δεν μεταφέρει βάρδια σε αυτοκίνητο του Β'
);
select throws_ok(
  $$ insert into public.drivers (name, fleet_id) values ('Χ', gen_random_uuid()) $$,
  '42501', null, 'ο στόλος ενός νέου οδηγού δεν γράφεται από την εφαρμογή'
);
select throws_ok(
  $$ update public.drivers set fleet_id = fleet_id where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'ο οδηγός δεν μεταφέρεται σε άλλον στόλο'
);
select throws_ok(
  $$ update public.drivers set user_id = 'd0000000-0000-0000-0000-00000000000d'
     where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'η σύνδεση λογαριασμού γίνεται μόνο με «Αποδοχή» του οδηγού'
);
select throws_ok(
  $$ insert into public.fleets (name, owner_id) values ('Χ', auth.uid()) $$,
  '42501', null, 'στόλος φτιάχνεται μόνο με «Έχω δικό μου ταξί»'
);
select throws_ok(
  $$ delete from public.fleets $$,
  '42501', null, 'στόλος δεν διαγράφεται από την εφαρμογή'
);

-- ------------------------------------------------------------------
-- Ο Β βλέπει μόνο τον δικό του στόλο
-- ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b"}';
select results_eq($$ select name from public.fleets $$, $$ values ('Βήτα') $$, 'ο Β βλέπει μόνο τον δικό του στόλο');
select results_eq(
  $$ select z_number from public.shifts $$, $$ values ('B1') $$,
  'ο Β βλέπει μόνο τις δικές του βάρδιες (και οι δικές του έμειναν ίδιες)'
);
select results_eq(
  $$ select driver_name, net_revenue from public.monthly_summary $$,
  $$ values ('Οδηγός Β', 200.00::numeric) $$,
  'η μηνιαία αναφορά του Β έχει μόνο τον στόλο του'
);

-- ------------------------------------------------------------------
-- Ο οδηγός: δύο προσκλήσεις, αποδέχεται μία· ένας στόλος ανά λογαριασμό
-- ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-00000000000d"}';
select results_eq(
  $$ select fleet_name, driver_name, plate, owner_email from public.my_invites() order by fleet_name $$,
  $$ values ('Άλφα', 'Οδηγός Α', 'ΑΑΑ-2222', 'owner.a@example.com'),
            ('Βήτα', 'Οδηγός Β', 'ΒΒΒ-2222', 'owner.b@example.com') $$,
  'ο οδηγός βλέπει τις προσκλήσεις και των δύο στόλων'
);
select is_empty($$ select id from public.drivers $$, 'πριν από την «Αποδοχή» δεν βλέπει κανένα αυτοκίνητο');
select is_empty($$ select id from public.shifts $$, 'πριν από την «Αποδοχή» δεν βλέπει καμία βάρδια');
select is(public.accept_invite('a1000000-0000-0000-0000-000000000001'), true, 'αποδέχεται την πρόσκληση του Α');
select throws_ok(
  $$ select public.accept_invite('b1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'Ο λογαριασμός σας είναι ήδη οδηγός σε στόλο.', 'δεν αποδέχεται και την πρόσκληση του Β'
);
select throws_ok(
  $$ select public.create_fleet('Δικό μου', null) $$,
  'P0001', 'Ο λογαριασμός σας είναι ήδη οδηγός σε στόλο.', 'οδηγός στόλου δεν φτιάχνει και δικό του στόλο'
);
select results_eq(
  $$ select id from public.drivers $$, $$ values ('a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'ο οδηγός βλέπει μόνο το αυτοκίνητό του (όχι του Β με το ίδιο email)'
);
select results_eq($$ select z_number from public.shifts $$, $$ values ('A1') $$, 'ο οδηγός βλέπει μόνο τις βάρδιες του αυτοκινήτου του');
select is_empty($$ select id from public.fleets $$, 'ο οδηγός δεν βλέπει τα στοιχεία του στόλου');

set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a"}';
select results_eq(
  $$ select email from public.profiles order by email $$,
  $$ values ('driver@example.com'), ('owner.a@example.com') $$,
  'ο Α βλέπει τον λογαριασμό του οδηγού του'
);
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b"}';
select results_eq(
  $$ select email from public.profiles $$, $$ values ('owner.b@example.com') $$,
  'ο Β δεν βλέπει τον λογαριασμό του οδηγού (δεν είναι στον στόλο του)'
);
select is(
  (select user_id from public.drivers where id = 'b1000000-0000-0000-0000-000000000001'),
  null, 'η πρόσκληση του Β μένει χωρίς σύνδεση'
);

-- Ιδιοκτήτης στόλου δεν γίνεται οδηγός σε άλλον στόλο.
insert into public.drivers (id, name, email)
values ('b5000000-0000-0000-0000-000000000001', 'Ο Α ως οδηγός', 'owner.a@example.com');
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a"}';
select throws_ok(
  $$ select public.accept_invite('b5000000-0000-0000-0000-000000000001') $$,
  'P0001', 'Έχετε ήδη δικό σας στόλο.', 'ιδιοκτήτης στόλου δεν αποδέχεται πρόσκληση άλλου στόλου'
);

-- Το email του ίδιου του ιδιοκτήτη στον δικό του στόλο συνδέεται αμέσως.
update public.drivers set email = 'other@example.com' where name = 'Άλφα';
select is(
  (select user_id from public.drivers where name = 'Άλφα'),
  null, 'άλλο email στο αυτοκίνητο του ιδιοκτήτη → χωρίς σύνδεση'
);
update public.drivers set email = 'OWNER.A@example.com' where name = 'Άλφα';
select is(
  (select user_id from public.drivers where name = 'Άλφα'),
  'a0000000-0000-0000-0000-00000000000a'::uuid, 'το email του ιδιοκτήτη στον στόλο του → σύνδεση αμέσως'
);

-- ------------------------------------------------------------------
-- Λογαριασμός χωρίς στόλο: δεν βλέπει τίποτα· φτιάχνει τον δικό του
-- ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "e0000000-0000-0000-0000-00000000000e"}';
select is_empty($$ select * from public.my_invites() $$, 'χωρίς πρόσκληση: καμία πρόσκληση');
select is_empty($$ select id from public.drivers $$, 'χωρίς στόλο: κανένα αυτοκίνητο');
select is_empty($$ select id from public.shifts $$, 'χωρίς στόλο: καμία βάρδια');
select lives_ok($$ select public.create_fleet('Μόνος', null) $$, '«Έχω δικό μου ταξί» χωρίς πινακίδα');
select results_eq(
  $$ select name, plate from public.drivers $$, $$ values ('Μόνος', null::text) $$,
  'νέος στόλος: μόνο το δικό του αυτοκίνητο'
);
select is((select count(*)::int from public.monthly_summary), 0, 'νέος στόλος: άδεια μηνιαία αναφορά');

-- Χωρίς επιβεβαιωμένο email δεν φτιάχνεται στόλος.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values ('f0000000-0000-0000-0000-00000000000f', 'new@example.com', '{}');
set local role authenticated;
set local request.jwt.claims = '{"sub": "f0000000-0000-0000-0000-00000000000f"}';
select throws_ok(
  $$ select public.create_fleet('Νέος', null) $$,
  'P0001', 'Επιβεβαιώστε πρώτα το email σας (σύνδεσμος στο email της εγγραφής).',
  'χωρίς επιβεβαιωμένο email δεν φτιάχνεται στόλος'
);

-- Νέο email λογαριασμού → η σύνδεση με τον οδηγό χάνεται.
reset role;
update auth.users set email = 'driver.new@example.com' where id = 'd0000000-0000-0000-0000-00000000000d';
select is(
  (select user_id from public.drivers where id = 'a1000000-0000-0000-0000-000000000001'),
  null, 'νέο email λογαριασμού → η σύνδεση με τον οδηγό χάνεται'
);

-- Ανώνυμος: τίποτα.
set local role anon;
select throws_ok($$ select public.create_fleet('Χ', null) $$, '42501', null, 'ανώνυμος: δεν φτιάχνει στόλο');
select throws_ok($$ select * from public.my_invites() $$, '42501', null, 'ανώνυμος: καμία πρόσκληση');
select throws_ok(
  $$ select public.accept_invite('a1000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'ανώνυμος: καμία «Αποδοχή»'
);
select throws_ok($$ select id from public.fleets $$, '42501', null, 'ανώνυμος: καμία πρόσβαση στους στόλους');

select * from finish();
rollback;

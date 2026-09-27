-- Tests ασφαλείας & λογιστικής για τη βάση (pgTAP).
-- Εκτέλεση: npx supabase test db   (χρειάζεται τοπικό Supabase: npx supabase start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ------------------------------------------------------------------
-- Σχήμα
-- ------------------------------------------------------------------
select has_table('public', 'profiles', 'πίνακας profiles');
select has_table('public', 'drivers', 'πίνακας drivers');
select has_table('public', 'shifts', 'πίνακας shifts');
select has_view('public', 'monthly_summary', 'αναφορά monthly_summary');
select ok(
  (select bool_and(rowsecurity) from pg_tables
   where schemaname = 'public' and tablename in ('profiles', 'drivers', 'shifts')),
  'RLS ενεργό σε όλους τους πίνακες'
);

-- ------------------------------------------------------------------
-- Λογαριασμοί & ρόλοι
-- ------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com', now(), '{"full_name": "Ιδιοκτήτης"}'),
  ('33333333-3333-3333-3333-333333333333', 'maria@example.com', now(), '{}'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com', now(), '{}');

select is(
  (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'driver', 'νέος λογαριασμός ξεκινά ως driver'
);
select is(
  (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ιδιοκτήτης', 'το ονοματεπώνυμο της εγγραφής αποθηκεύεται'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is(public.admin_exists(), false, 'αρχικά δεν υπάρχει admin');
select is(public.claim_admin(), true, 'ο ιδιοκτήτης γίνεται admin');
select is(public.admin_exists(), true, 'υπάρχει πλέον admin');

set local request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444"}';
select is(public.claim_admin(), false, 'δεύτερη διεκδίκηση admin απορρίπτεται');
select is(
  (select role from public.profiles where id = auth.uid()),
  'driver', 'ο δεύτερος χρήστης παραμένει driver'
);

-- ------------------------------------------------------------------
-- Υποδομή στόλου (admin) & αυτόματη σύνδεση λογαριασμών με email
-- ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
insert into public.drivers (id, name, plate, phone, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ' Γιώργος ', 'ταε-1234', '6912345678', '  Giorgos@Example.com '),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Μαρία', 'ΤΑΧ-5678', '6987654321', 'maria@example.com');

select is(
  (select email from public.drivers where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'giorgos@example.com', 'το email κανονικοποιείται'
);
select is(
  (select plate from public.drivers where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'ΤΑΕ-1234', 'η πινακίδα αποθηκεύεται με κεφαλαία'
);
select is(
  (select user_id from public.drivers where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  null, 'χωρίς λογαριασμό → καμία σύνδεση'
);
select is(
  (select user_id from public.drivers where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '33333333-3333-3333-3333-333333333333'::uuid, 'υπάρχων επιβεβαιωμένος λογαριασμός → άμεση σύνδεση'
);
select throws_ok(
  $$ insert into public.drivers (name, email) values ('Διπλός', 'MARIA@example.com') $$,
  '23505', null, 'το ίδιο email δεν δίνεται σε δύο οδηγούς'
);

reset role;
insert into auth.users (id, email, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222', 'giorgos@example.com', '{}');
select is(
  (select user_id from public.drivers where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  null, 'μη επιβεβαιωμένο email → ακόμη καμία σύνδεση'
);
update auth.users set email_confirmed_at = now() where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select user_id from public.drivers where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '22222222-2222-2222-2222-222222222222'::uuid, 'μετά την επιβεβαίωση του email → σύνδεση'
);

-- ------------------------------------------------------------------
-- Λογιστική: υπολογιζόμενες στήλες της βάσης
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
insert into public.shifts
  (id, driver_id, year, month, z_number, trips, paid_km, empty_km, net_revenue, tips, fuel, other_expenses, repairs)
values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, '101', 14, 80.5, 40, 160.39, 5, 40, 10, 0),
  ('c0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2026, 9, '555', 10, 60, 20, 100, 0, 0, 0, 124);

select is((select vat from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'), 20.84,
  'ΦΠΑ 13%: 160,39 × 0.129933 = 20,84');
select is((select gross_receipts from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'), 186.23,
  'μικτή είσπραξη = καθαρά + ΦΠΑ + φιλοδωρήματα');
select is((select expenses_vat from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'), 9.68,
  'εμπεριεχόμενος ΦΠΑ 24% εξόδων: 50 / 1.24 × 0.24');
select is((select vat_balance from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'), 11.16,
  'συμψηφισμός ΦΠΑ (χρεωστικό)');
select is((select net_cash from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'), 136.23,
  'καθαρό ταμείο = (καθαρά + ΦΠΑ + φιλοδωρήματα) − έξοδα');
select is((select total_km from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'), 120.50,
  'συνολικά χιλιόμετρα');
select is((select vat_balance from public.shifts where id = 'c0000000-0000-0000-0000-000000000002'), -11.01,
  'πιστωτικό υπόλοιπο όταν τα έξοδα έχουν περισσότερο ΦΠΑ');
select is((select created_by from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'καταγράφεται ποιος καταχώρησε τη βάρδια');
select throws_ok(
  $$ insert into public.shifts (driver_id, year, month, z_number, net_revenue, vat)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 'X', 10, 999) $$,
  '428C9', null, 'ο ΦΠΑ δεν μπορεί να γραφτεί χειροκίνητα'
);
select throws_ok(
  $$ insert into public.shifts (driver_id, year, month, z_number)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, '   ') $$,
  '23514', null, 'ο αριθμός Ζ είναι υποχρεωτικός'
);

-- ------------------------------------------------------------------
-- Οδηγός: βλέπει και καταχωρεί ΜΟΝΟ τα δικά του
-- ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
select results_eq(
  $$ select id from public.shifts $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid) $$,
  'ο οδηγός βλέπει μόνο τις δικές του βάρδιες'
);
select results_eq(
  $$ select id from public.drivers $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'ο οδηγός βλέπει μόνο τη δική του εγγραφή στόλου'
);
select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('22222222-2222-2222-2222-222222222222'::uuid) $$,
  'ο οδηγός βλέπει μόνο το δικό του προφίλ'
);
select results_eq(
  $$ select driver_id, shifts from public.monthly_summary $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1) $$,
  'η μηνιαία αναφορά δείχνει μόνο τα δικά του'
);
select throws_ok(
  $$ insert into public.shifts (driver_id, year, month, z_number)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2026, 9, '1') $$,
  '42501', null, 'δεν καταχωρεί βάρδια για άλλον οδηγό'
);
select lives_ok(
  $$ insert into public.shifts (id, driver_id, year, month, z_number, net_revenue)
     values ('c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, '102', 50) $$,
  'καταχωρεί τη δική του βάρδια'
);
select throws_ok(
  $$ insert into public.drivers (name) values ('Νέος') $$,
  '42501', null, 'δεν προσθέτει οδηγούς στον στόλο'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501', null, 'δεν μπορεί να κάνει τον εαυτό του admin'
);

-- Διόρθωση δικής του πρόσφατης καταχώρησης (π.χ. ξέχασε τα έξοδα).
select results_eq(
  $$ with u as (update public.shifts set fuel = 12.40 where id = 'c0000000-0000-0000-0000-000000000003'
                returning expenses_vat, created_by)
     select expenses_vat, created_by from u $$,
  $$ values (2.40::numeric, '22222222-2222-2222-2222-222222222222'::uuid) $$,
  'διορθώνει δική του πρόσφατη βάρδια· ο ΦΠΑ ξαναϋπολογίζεται'
);
select throws_ok(
  $$ update public.shifts set driver_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     where id = 'c0000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'δεν μεταφέρει βάρδια σε άλλον οδηγό'
);

-- Αλλαγές/διαγραφές που δεν επιτρέπονται απλώς δεν επηρεάζουν γραμμές.
update public.shifts set net_revenue = 1 where id = 'c0000000-0000-0000-0000-000000000001';
update public.drivers set name = 'Hacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  $$ with d as (delete from public.shifts where id = 'c0000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'δεν διαγράφει βάρδια που καταχώρησε ο admin'
);
select results_eq(
  $$ with d as (delete from public.shifts where id = 'c0000000-0000-0000-0000-000000000003' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$, 'διαγράφει δική του πρόσφατη καταχώρηση (διόρθωση λάθους)'
);

-- Παλιά (48 ωρών) δική του βάρδια → κλειδωμένη για τον οδηγό.
reset role;
insert into public.shifts (id, driver_id, year, month, z_number)
values ('c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 8, '90');
alter table public.shifts disable trigger shifts_before_write;
update public.shifts set created_at = now() - interval '48 hours'
where id = 'c0000000-0000-0000-0000-000000000004';
alter table public.shifts enable trigger shifts_before_write;
set local role authenticated;
select results_eq(
  $$ with u as (update public.shifts set fuel = 1 where id = 'c0000000-0000-0000-0000-000000000004' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'μετά από 24 ώρες ο οδηγός δεν διορθώνει'
);
select results_eq(
  $$ with d as (delete from public.shifts where id = 'c0000000-0000-0000-0000-000000000004' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'μετά από 24 ώρες ο οδηγός δεν διαγράφει'
);

-- ------------------------------------------------------------------
-- Ανενεργός οδηγός, χρήστης χωρίς αντιστοίχιση, ανώνυμος
-- ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
update public.drivers set active = false where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$ insert into public.shifts (driver_id, year, month, z_number)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, '103') $$,
  '42501', null, 'ανενεργός οδηγός δεν καταχωρεί νέες βάρδιες'
);
select isnt_empty($$ select id from public.shifts $$, 'ανενεργός οδηγός βλέπει το ιστορικό του');

set local request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444"}';
select is_empty($$ select id from public.shifts $$, 'λογαριασμός χωρίς οδηγό δεν βλέπει βάρδιες');
select is_empty($$ select id from public.drivers $$, 'λογαριασμός χωρίς οδηγό δεν βλέπει τον στόλο');

set local role anon;
select throws_ok($$ select id from public.shifts $$, '42501', null, 'ανώνυμος: καμία πρόσβαση');

-- ------------------------------------------------------------------
-- Admin: τα βλέπει όλα, τίποτα δεν αλλοιώθηκε από τον οδηγό
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is((select count(*)::int from public.shifts), 3, 'ο admin βλέπει όλες τις βάρδιες');
select is(
  (select net_revenue from public.shifts where id = 'c0000000-0000-0000-0000-000000000001'),
  160.39, 'ο οδηγός δεν άλλαξε ποσά'
);
select is(
  (select name from public.drivers where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Γιώργος', 'ο οδηγός δεν άλλαξε τα στοιχεία του στόλου'
);
select results_eq(
  $$ with u as (update public.shifts set repairs = 124 where id = 'c0000000-0000-0000-0000-000000000001'
                returning vat_balance, created_by)
     select vat_balance, created_by from u $$,
  $$ values (-12.84::numeric, '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'ο admin διορθώνει οποιαδήποτε βάρδια· ο καταχωρητής δεν αλλάζει'
);
update public.drivers set email = null where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select is(
  (select user_id from public.drivers where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null, 'αφαίρεση email → ο οδηγός χάνει την πρόσβαση'
);
select throws_ok(
  $$ delete from public.drivers where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23503', null, 'οδηγός με βάρδιες δεν διαγράφεται (μόνο απενεργοποίηση)'
);

select * from finish();
rollback;

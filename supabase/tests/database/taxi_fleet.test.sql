-- Tests ασφαλείας & λογιστικής για τη βάση (pgTAP).
-- Εκτέλεση: npx supabase test db   (χρειάζεται τοπικό Supabase: npx supabase start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(101);

-- ------------------------------------------------------------------
-- Σχήμα
-- ------------------------------------------------------------------
select has_table('public', 'profiles', 'πίνακας profiles');
select has_table('public', 'drivers', 'πίνακας drivers');
select has_table('public', 'shifts', 'πίνακας shifts');
select has_table('public', 'vehicle_expenses', 'πίνακας vehicle_expenses');
select has_table('public', 'platform_statements', 'πίνακας platform_statements');
select has_view('public', 'monthly_summary', 'αναφορά monthly_summary');
select ok(
  (select bool_and(rowsecurity) from pg_tables
   where schemaname = 'public'
     and tablename in ('profiles', 'drivers', 'shifts', 'vehicle_expenses', 'platform_statements')),
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
-- Έξοδα οχήματος (εκτός βάρδιας): ανά αυτοκίνητο και μήνα, ΦΠΑ 24% μέσα
-- ------------------------------------------------------------------
insert into public.vehicle_expenses (id, driver_id, year, month, category, description, amount) values
  ('e0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2026, 9, 'repairs', '  Φρένα – συνεργείο  ', 800),
  ('e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 'other', '', 10);

select is((select vat from public.vehicle_expenses where id = 'e0000000-0000-0000-0000-000000000001'), 154.84,
  'ΦΠΑ 24% εξόδου: 800 / 1.24 × 0.24 = 154,84');
select is((select description from public.vehicle_expenses where id = 'e0000000-0000-0000-0000-000000000001'),
  'Φρένα – συνεργείο', 'η περιγραφή καθαρίζεται από κενά');
select is((select created_by from public.vehicle_expenses where id = 'e0000000-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'καταγράφεται ποιος καταχώρησε το έξοδο');
select throws_ok(
  $$ insert into public.vehicle_expenses (driver_id, year, month, amount) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 0) $$,
  '23514', null, 'το ποσό εξόδου πρέπει να είναι θετικό'
);
select throws_ok(
  $$ insert into public.vehicle_expenses (driver_id, year, month, category, amount) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 'wash', 5) $$,
  '23514', null, 'μόνο «Επισκευές / Συντήρηση» ή «Άλλα έξοδα»'
);
select throws_ok(
  $$ insert into public.vehicle_expenses (driver_id, year, month, amount, vat) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 5, 1) $$,
  '428C9', null, 'ο ΦΠΑ εξόδου δεν γράφεται χειροκίνητα'
);
select results_eq(
  $$ select total_expenses, expenses_vat, vat_balance, net_cash, vehicle_expenses
     from public.monthly_summary where driver_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and month = 9 $$,
  $$ values (924.00::numeric, 178.84::numeric, -165.85::numeric, -811.01::numeric, 800.00::numeric) $$,
  'η μηνιαία αναφορά περιλαμβάνει τα έξοδα οχήματος (ΦΠΑ και ταμείο)'
);

-- ------------------------------------------------------------------
-- Εφαρμογές (Uber / FreeNow): εβδομάδες κομμένες στον μήνα· κράτηση από
-- το τιμολόγιο του μήνα, αλλιώς από τις εβδομάδες
-- ------------------------------------------------------------------
-- Σεπτέμβριος 2026: ξεκινά Τρίτη (1–6), τελειώνει Τετάρτη (28–30).
insert into public.platform_statements
  (id, driver_id, platform, kind, year, month, week_start, trips, turnover, commission)
values
  ('f0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'uber', 'week', 2026, 9, '2026-09-01', 3, 60, 9),
  ('f0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'uber', 'week', 2026, 9, '2026-09-28', 1, 20, 3),
  ('f0000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'freenow', 'week', 2026, 9, '2026-09-07', 4, 200, 31),
  ('f0000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'uber', 'week', 2026, 9, '2026-09-14', 2, 30, 4.50);

select results_eq(
  $$ select week_end from public.platform_statements
     where driver_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and kind = 'week' order by week_start $$,
  $$ values ('2026-09-06'::date), ('2026-09-13'::date), ('2026-09-30'::date) $$,
  'η εβδομάδα τελειώνει Κυριακή ή στο τέλος του μήνα'
);
select results_eq(
  $$ select commission_vat from public.platform_statements
     where id in ('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003') order by platform $$,
  $$ values (6.00::numeric), (0.00::numeric) $$,
  'ΦΠΑ κράτησης: FreeNow 24% μέσα (31 → 6,00), Uber χωρίς ΦΠΑ'
);
select is((select created_by from public.platform_statements where id = 'f0000000-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'καταγράφεται ποιος καταχώρησε την εβδομάδα');
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, week_start, commission)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'uber', 'week', 2026, 9, '2026-09-09', 1) $$,
  '23514', null, 'η εβδομάδα ξεκινά Δευτέρα ή την 1η του μήνα'
);
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, week_start, commission)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'uber', 'week', 2026, 9, '2026-10-05', 1) $$,
  '23514', null, 'η εβδομάδα ανήκει στον μήνα της καταχώρησης'
);
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, week_start, commission)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'uber', 'week', 2026, 9, '2026-09-01', 1) $$,
  '23505', null, 'κάθε εβδομάδα καταχωρείται μία φορά ανά εφαρμογή'
);
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, week_start, commission, commission_vat)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'freenow', 'week', 2026, 9, '2026-09-14', 10, 0) $$,
  '428C9', null, 'ο ΦΠΑ κράτησης δεν γράφεται χειροκίνητα'
);
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, trips, commission)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'freenow', 'invoice', 2026, 9, 5, 37.20) $$,
  '23514', null, 'το τιμολόγιο δεν έχει διαδρομές ούτε εβδομάδα'
);
select lives_ok(
  $$ insert into public.platform_statements (id, driver_id, platform, kind, year, month, commission, reference)
     values ('f0000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'freenow', 'invoice', 2026, 9, 37.20, ' FN-123 ') $$,
  'καταχωρείται το μηνιαίο τιμολόγιο'
);
select is((select reference from public.platform_statements where id = 'f0000000-0000-0000-0000-000000000004'),
  'FN-123', 'ο αριθμός τιμολογίου καθαρίζεται από κενά');
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, commission)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'freenow', 'invoice', 2026, 9, 1) $$,
  '23505', null, 'ένα τιμολόγιο ανά εφαρμογή και μήνα'
);
-- Uber: εβδομάδες 9 + 3 (χωρίς ΦΠΑ) · FreeNow: τιμολόγιο 37,20 (ΦΠΑ 7,20) αντί για την εβδομάδα 31.
select results_eq(
  $$ select app_trips, app_turnover, app_commission, app_commission_vat, street_trips,
            total_expenses, expenses_vat, vat_balance, net_cash
     from public.monthly_summary where driver_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and month = 9 $$,
  $$ values (8, 280.00::numeric, 49.20::numeric, 7.20::numeric, 2,
             973.20::numeric, 186.04::numeric, -173.05::numeric, -860.21::numeric) $$,
  'μηνιαία αναφορά: διαδρομές δρόμου και κρατήσεις (το τιμολόγιο FreeNow αντί για τις εβδομάδες)'
);
insert into public.platform_statements (id, driver_id, platform, kind, year, month, commission)
values ('f0000000-0000-0000-0000-000000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'uber', 'invoice', 2026, 7, 20);
select results_eq(
  $$ select shifts, app_commission, net_cash from public.monthly_summary
     where driver_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and month = 7 $$,
  $$ values (0, 20.00::numeric, -20.00::numeric) $$,
  'μήνας μόνο με τιμολόγιο εφαρμογής εμφανίζεται στην αναφορά'
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
select results_eq(
  $$ select id from public.vehicle_expenses $$,
  $$ values ('e0000000-0000-0000-0000-000000000002'::uuid) $$,
  'ο οδηγός βλέπει μόνο τα έξοδα του δικού του αυτοκινήτου'
);
select throws_ok(
  $$ insert into public.vehicle_expenses (driver_id, year, month, amount) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2026, 9, 50) $$,
  '42501', null, 'δεν καταχωρεί έξοδο για άλλο αυτοκίνητο'
);
select lives_ok(
  $$ insert into public.vehicle_expenses (id, driver_id, year, month, category, amount)
     values ('e0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 'other', 12.40) $$,
  'καταχωρεί έξοδο για το δικό του αυτοκίνητο'
);
select results_eq(
  $$ with u as (update public.vehicle_expenses set amount = 24.80
                where id = 'e0000000-0000-0000-0000-000000000003' returning vat, created_by)
     select vat, created_by from u $$,
  $$ values (4.80::numeric, '22222222-2222-2222-2222-222222222222'::uuid) $$,
  'διορθώνει δικό του πρόσφατο έξοδο· ο ΦΠΑ ξαναϋπολογίζεται'
);
select throws_ok(
  $$ update public.vehicle_expenses set driver_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     where id = 'e0000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'δεν μεταφέρει έξοδο σε άλλο αυτοκίνητο'
);
select results_eq(
  $$ with u as (update public.vehicle_expenses set amount = 1
                where id = 'e0000000-0000-0000-0000-000000000002' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'δεν αλλάζει έξοδο που καταχώρησε ο admin'
);
select results_eq(
  $$ with d as (delete from public.vehicle_expenses where id = 'e0000000-0000-0000-0000-000000000003' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$, 'διαγράφει δικό του πρόσφατο έξοδο'
);
select results_eq(
  $$ select id from public.platform_statements $$,
  $$ values ('f0000000-0000-0000-0000-000000000006'::uuid) $$,
  'ο οδηγός βλέπει μόνο τις εφαρμογές του δικού του αυτοκινήτου'
);
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, week_start, trips, turnover, commission)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'uber', 'week', 2026, 9, '2026-09-14', 1, 10, 1) $$,
  '42501', null, 'δεν καταχωρεί εφαρμογή για άλλο αυτοκίνητο'
);
select lives_ok(
  $$ insert into public.platform_statements (id, driver_id, platform, kind, year, month, week_start, trips, turnover, commission)
     values ('f0000000-0000-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'freenow', 'week', 2026, 9, '2026-09-21', 2, 40, 6.20) $$,
  'καταχωρεί εβδομάδα εφαρμογής για το δικό του αυτοκίνητο'
);
select results_eq(
  $$ with u as (update public.platform_statements set commission = 12.40
                where id = 'f0000000-0000-0000-0000-000000000007' returning commission_vat, created_by)
     select commission_vat, created_by from u $$,
  $$ values (2.40::numeric, '22222222-2222-2222-2222-222222222222'::uuid) $$,
  'διορθώνει δική του πρόσφατη εβδομάδα· ο ΦΠΑ κράτησης ξαναϋπολογίζεται'
);
select results_eq(
  $$ with u as (update public.platform_statements set commission = 1
                where id = 'f0000000-0000-0000-0000-000000000006' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'δεν αλλάζει καταχώρηση εφαρμογής του admin'
);
select results_eq(
  $$ with d as (delete from public.platform_statements where id = 'f0000000-0000-0000-0000-000000000007' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$, 'διαγράφει δική του πρόσφατη καταχώρηση εφαρμογής'
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

reset role;
insert into public.vehicle_expenses (id, driver_id, year, month, amount)
values ('e0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 30);
alter table public.vehicle_expenses disable trigger vehicle_expenses_before_write;
update public.vehicle_expenses set created_at = now() - interval '48 hours'
where id = 'e0000000-0000-0000-0000-000000000004';
alter table public.vehicle_expenses enable trigger vehicle_expenses_before_write;
set local role authenticated;
select results_eq(
  $$ with u as (update public.vehicle_expenses set amount = 1
                where id = 'e0000000-0000-0000-0000-000000000004' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'μετά από 24 ώρες ο οδηγός δεν διορθώνει έξοδο'
);
select results_eq(
  $$ with d as (delete from public.vehicle_expenses where id = 'e0000000-0000-0000-0000-000000000004' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'μετά από 24 ώρες ο οδηγός δεν διαγράφει έξοδο'
);

reset role;
insert into public.platform_statements (id, driver_id, platform, kind, year, month, week_start, commission)
values ('f0000000-0000-0000-0000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'uber', 'week', 2026, 9, '2026-09-07', 0);
alter table public.platform_statements disable trigger platform_statements_before_write;
update public.platform_statements set created_at = now() - interval '48 hours'
where id = 'f0000000-0000-0000-0000-000000000008';
alter table public.platform_statements enable trigger platform_statements_before_write;
set local role authenticated;
select results_eq(
  $$ with u as (update public.platform_statements set commission = 1
                where id = 'f0000000-0000-0000-0000-000000000008' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'μετά από 24 ώρες ο οδηγός δεν διορθώνει εφαρμογή'
);
select results_eq(
  $$ with d as (delete from public.platform_statements where id = 'f0000000-0000-0000-0000-000000000008' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'μετά από 24 ώρες ο οδηγός δεν διαγράφει εφαρμογή'
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
select throws_ok(
  $$ insert into public.vehicle_expenses (driver_id, year, month, amount) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2026, 9, 5) $$,
  '42501', null, 'ανενεργός οδηγός δεν καταχωρεί νέα έξοδα'
);
select throws_ok(
  $$ insert into public.platform_statements (driver_id, platform, kind, year, month, commission)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'uber', 'invoice', 2026, 9, 5) $$,
  '42501', null, 'ανενεργός οδηγός δεν καταχωρεί εφαρμογές'
);

set local request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444"}';
select is_empty($$ select id from public.shifts $$, 'λογαριασμός χωρίς οδηγό δεν βλέπει βάρδιες');
select is_empty($$ select id from public.drivers $$, 'λογαριασμός χωρίς οδηγό δεν βλέπει τον στόλο');
select is_empty($$ select id from public.vehicle_expenses $$, 'λογαριασμός χωρίς οδηγό δεν βλέπει έξοδα');
select is_empty($$ select id from public.platform_statements $$, 'λογαριασμός χωρίς οδηγό δεν βλέπει εφαρμογές');

set local role anon;
select throws_ok($$ select id from public.shifts $$, '42501', null, 'ανώνυμος: καμία πρόσβαση');
select throws_ok($$ select id from public.vehicle_expenses $$, '42501', null, 'ανώνυμος: καμία πρόσβαση στα έξοδα');
select throws_ok($$ select id from public.platform_statements $$, '42501', null, 'ανώνυμος: καμία πρόσβαση στις εφαρμογές');

-- ------------------------------------------------------------------
-- Admin: τα βλέπει όλα, τίποτα δεν αλλοιώθηκε από τον οδηγό
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
select is((select count(*)::int from public.shifts), 3, 'ο admin βλέπει όλες τις βάρδιες');
select is((select count(*)::int from public.vehicle_expenses), 3, 'ο admin βλέπει όλα τα έξοδα');
select is((select count(*)::int from public.platform_statements), 7, 'ο admin βλέπει όλες τις καταχωρήσεις εφαρμογών');
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

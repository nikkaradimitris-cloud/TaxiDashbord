-- Tests για τα «Άλλα έξοδα» του αυτοκινήτου (pgTAP): στη μηνιαία αναφορά μετράει μόνο ο ΦΠΑ τους·
-- δεν μπαίνουν στα έξοδα και δεν αφαιρούνται από το ταμείο. Οι «Επισκευές / Συντήρηση» μετράνε όπως πριν.
-- Εκτέλεση: npx supabase test db   (χρειάζεται τοπικό Supabase: npx supabase start)
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-0000000000e1', 'owner.other@example.com', now(), '{}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000e1"}';
select public.create_fleet('Άλφα', 'ααα-3333', 'diesel');
insert into public.drivers (id, name, plate) values ('a1000000-0000-0000-0000-0000000000e1', 'Οδηγός', 'ΑΑΑ-4444');

select has_column('public', 'monthly_summary', 'vat_only_expenses', 'η αναφορά έχει χωριστά τα «Άλλα έξοδα»');

-- Σεπτέμβριος: βάρδια 100 € καθαρά (ΦΠΑ 12,99) με καύσιμα 12,40 (ΦΠΑ 2,40)· επισκευή 124 (ΦΠΑ 24,00)·
-- «Άλλα έξοδα» 180 (ΦΠΑ 34,84) και 20 (ΦΠΑ 3,87).
insert into public.shifts (driver_id, year, month, z_number, net_revenue, fuel)
values ('a1000000-0000-0000-0000-0000000000e1', 2026, 9, '910', 100, 12.40);
insert into public.vehicle_expenses (id, driver_id, year, month, category, description, amount) values
  ('a3000000-0000-0000-0000-0000000000e1', 'a1000000-0000-0000-0000-0000000000e1', 2026, 9, 'repairs', 'Φρένα', 124),
  ('a3000000-0000-0000-0000-0000000000e2', 'a1000000-0000-0000-0000-0000000000e1', 2026, 9, 'other', 'Λογιστής', 180),
  ('a3000000-0000-0000-0000-0000000000e3', 'a1000000-0000-0000-0000-0000000000e1', 2026, 9, 'other', 'Τηλέφωνο', 20);

select results_eq(
  $$ select total_expenses, expenses_vat, vat_balance, vat_status, net_cash, vehicle_expenses, vat_only_expenses
     from public.monthly_summary where driver_id = 'a1000000-0000-0000-0000-0000000000e1' and month = 9 $$,
  $$ values (136.40::numeric, 65.11::numeric, -52.12::numeric, 'Πιστωτικό'::text, -23.41::numeric,
             124.00::numeric, 200.00::numeric) $$,
  'Άλλα έξοδα: μόνο ο ΦΠΑ τους (34,84 + 3,87) στον συμψηφισμό· όχι στα έξοδα ούτε στο ταμείο'
);
select results_eq(
  $$ select amount, vat from public.vehicle_expenses where id = 'a3000000-0000-0000-0000-0000000000e2' $$,
  $$ values (180.00::numeric(12, 2), 34.84::numeric(12, 2)) $$,
  'η καταχώρηση μένει όπως γράφτηκε (ποσό και ΦΠΑ)'
);

-- Οκτώβριος: μόνο «Άλλα έξοδα» 10 € (ΦΠΑ 1,94). Ο μήνας φαίνεται, με ταμείο 0.
insert into public.vehicle_expenses (driver_id, year, month, category, amount)
values ('a1000000-0000-0000-0000-0000000000e1', 2026, 10, 'other', 10);
select results_eq(
  $$ select shifts, total_expenses, expenses_vat, vat_balance, net_cash, vehicle_expenses, vat_only_expenses
     from public.monthly_summary where driver_id = 'a1000000-0000-0000-0000-0000000000e1' and month = 10 $$,
  $$ values (0, 0.00::numeric, 1.94::numeric, -1.94::numeric, 0.00::numeric, 0.00::numeric, 10.00::numeric) $$,
  'μήνας μόνο με «Άλλα έξοδα»: πιστωτικός ΦΠΑ, ταμείο 0'
);

-- Αλλαγή κατηγορίας: τα 180 γίνονται «Επισκευές / Συντήρηση» και μετράνε στα έξοδα και στο ταμείο.
update public.vehicle_expenses set category = 'repairs' where id = 'a3000000-0000-0000-0000-0000000000e2';
select results_eq(
  $$ select total_expenses, expenses_vat, net_cash, vehicle_expenses, vat_only_expenses
     from public.monthly_summary where driver_id = 'a1000000-0000-0000-0000-0000000000e1' and month = 9 $$,
  $$ values (316.40::numeric, 65.11::numeric, -203.41::numeric, 304.00::numeric, 20.00::numeric) $$,
  'από «Άλλα έξοδα» σε «Επισκευές»: το ποσό μπαίνει στα έξοδα και στο ταμείο, ο ΦΠΑ μένει ίδιος'
);

select * from finish();
rollback;

-- =====================================================================
--  Taxi Fleet Tracker — βάση δεδομένων, λογιστική λογική & ασφάλεια
-- =====================================================================
--  Εκτελέστε ΟΛΟΚΛΗΡΟ το αρχείο μία φορά:
--    Supabase Dashboard → SQL Editor → New query → επικόλληση → Run
--  (ή με το CLI: `npx supabase link` και `npx supabase db push`).
--
--  Ρόλοι:
--    admin  (ιδιοκτήτης) : βλέπει/διαχειρίζεται τα πάντα.
--    driver (οδηγός)     : βλέπει και καταχωρεί ΜΟΝΟ τις δικές του βάρδιες.
--  Η απομόνωση γίνεται με Row Level Security μέσα στη βάση, άρα ισχύει
--  ακόμη κι αν κάποιος καλέσει απευθείας το API του Supabase.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Έλεγχος για πίνακες από παλιότερη εγκατάσταση
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is not null
     or to_regclass('public.drivers') is not null
     or to_regclass('public.shifts') is not null then
    raise exception using
      message = 'Υπάρχουν ήδη πίνακες profiles / drivers / shifts από παλιότερη εγκατάσταση.',
      hint = 'Χρησιμοποιήστε νέο Supabase project ή δείτε στο README την ενότητα «Παλιό Supabase project».';
  end if;
end;
$$;

-- Ιδιωτικό schema για βοηθητικές συναρτήσεις (δεν εκτίθεται στο API).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;


-- ---------------------------------------------------------------------
-- 1. Πίνακες
-- ---------------------------------------------------------------------

-- Ένα προφίλ για κάθε λογαριασμό (auth.users). Δημιουργείται αυτόματα.
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  full_name          text not null default '',
  role               text not null default 'driver' check (role in ('admin', 'driver')),
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);
comment on table public.profiles is 'Ρόλος κάθε χρήστη: admin (ιδιοκτήτης) ή driver (οδηγός).';

-- Υποδομή στόλου: οδηγοί, πινακίδες, κινητά. Τα διαχειρίζεται ο admin.
create table public.drivers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> '' and char_length(name) <= 100),
  plate      text check (char_length(plate) <= 20),
  phone      text check (char_length(phone) <= 30),
  -- Email με το οποίο ο οδηγός συνδέεται από τη δική του συσκευή.
  email      text unique check (email is null or (email = lower(btrim(email)) and email like '%_@_%')),
  -- Συμπληρώνεται ΑΥΤΟΜΑΤΑ όταν υπάρχει επιβεβαιωμένος λογαριασμός με το ίδιο email.
  user_id    uuid unique references auth.users (id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.drivers is 'Στόλος: Όνομα, Πινακίδα, Κινητό και (προαιρετικά) email σύνδεσης του οδηγού.';
comment on column public.drivers.user_id is 'Αυτόματη σύνδεση με τον λογαριασμό που έχει το ίδιο (επιβεβαιωμένο) email.';

-- Βάρδιες. Χωρίς ημερομηνία: οργάνωση ανά Έτος / Μήνα.
-- Οι υπολογιζόμενες στήλες (generated) ΔΕΝ γράφονται από την εφαρμογή·
-- τις υπολογίζει πάντα η βάση με τους επίσημους τύπους.
create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.drivers (id) on delete restrict,
  year           smallint not null check (year between 2000 and 2100),
  month          smallint not null check (month between 1 and 12),
  z_number       text not null check (btrim(z_number) <> '' and char_length(z_number) <= 40),
  trips          integer not null default 0 check (trips >= 0),
  paid_km        numeric(10, 2) not null default 0 check (paid_km >= 0),
  empty_km       numeric(10, 2) not null default 0 check (empty_km >= 0),
  net_revenue    numeric(12, 2) not null default 0 check (net_revenue >= 0),
  tips           numeric(12, 2) not null default 0 check (tips >= 0),
  fuel           numeric(12, 2) not null default 0 check (fuel >= 0),
  other_expenses numeric(12, 2) not null default 0 check (other_expenses >= 0),
  repairs        numeric(12, 2) not null default 0 check (repairs >= 0),

  -- ΦΠΑ εσόδων 13%: επίσημος συντελεστής αποφορολόγησης ταξί (160,39 → 20,84).
  vat            numeric(12, 2) generated always as (round(net_revenue * 0.129933, 2)) stored,
  total_km       numeric(12, 2) generated always as (paid_km + empty_km) stored,
  -- Μικτή είσπραξη (τζίρος) = καθαρά + ΦΠΑ 13% + φιλοδωρήματα (χωρίς ΦΠΑ).
  gross_receipts numeric(12, 2) generated always as (
                   net_revenue + round(net_revenue * 0.129933, 2) + tips) stored,
  total_expenses numeric(12, 2) generated always as (fuel + other_expenses + repairs) stored,
  -- Εμπεριεχόμενος ΦΠΑ 24% των εξόδων: ποσό / 1.24 × 0.24.
  expenses_vat   numeric(12, 2) generated always as (
                   round((fuel + other_expenses + repairs) / 1.24 * 0.24, 2)) stored,
  -- Συμψηφισμός: θετικό = Χρεωστικό (πληρωμή), αρνητικό = Πιστωτικό.
  vat_balance    numeric(12, 2) generated always as (
                   round(net_revenue * 0.129933, 2)
                   - round((fuel + other_expenses + repairs) / 1.24 * 0.24, 2)) stored,
  -- Καθαρό ταμείο (τσέπη) = (καθαρά + ΦΠΑ 13% + φιλοδωρήματα) − έξοδα.
  net_cash       numeric(12, 2) generated always as (
                   net_revenue + round(net_revenue * 0.129933, 2) + tips
                   - (fuel + other_expenses + repairs)) stored,

  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.shifts is 'Βάρδιες ανά Έτος/Μήνα. ΦΠΑ, σύνολα και ταμείο υπολογίζονται από τη βάση.';

create index shifts_period_idx on public.shifts (year, month);
create index shifts_driver_period_idx on public.shifts (driver_id, year, month);
create index shifts_created_by_idx on public.shifts (created_by);


-- ---------------------------------------------------------------------
-- 2. Βοηθητικές συναρτήσεις για τους κανόνες ασφαλείας
-- ---------------------------------------------------------------------

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Ο οδηγός που αντιστοιχεί στον συνδεδεμένο χρήστη (ή null).
create function private.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.drivers where user_id = (select auth.uid());
$$;

-- Όπως παραπάνω, αλλά μόνο αν ο οδηγός είναι ενεργός (για νέες καταχωρήσεις).
create function private.current_active_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.drivers where user_id = (select auth.uid()) and active;
$$;

-- Ο επιβεβαιωμένος λογαριασμός με αυτό το email (ή null).
create function private.confirmed_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where p_email is not null
    and lower(u.email) = p_email
    and u.email_confirmed_at is not null
  limit 1;
$$;


-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- 3α. Οδηγοί: κανονικοποίηση email και αυτόματη σύνδεση με λογαριασμό.
create function private.drivers_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name  := btrim(new.name);
  new.plate := nullif(upper(btrim(coalesce(new.plate, ''))), '');
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  -- Το user_id προκύπτει ΠΑΝΤΑ από το email· δεν ορίζεται χειροκίνητα.
  new.user_id := private.confirmed_user_id(new.email);
  return new;
end;
$$;

create trigger drivers_before_write
  before insert or update on public.drivers
  for each row execute function private.drivers_before_write();

-- 3β. Βάρδιες: ποιος/πότε καταχώρησε (δεν μπορεί να πλαστογραφηθεί).
create function private.shifts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.z_number := btrim(new.z_number);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger shifts_before_write
  before insert or update on public.shifts
  for each row execute function private.shifts_before_write();

-- 3γ. Νέος λογαριασμός → προφίλ (ρόλος driver) + σύνδεση με οδηγό (αν το email είναι επιβεβαιωμένο).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, email_confirmed_at)
  values (
    new.id,
    lower(new.email),
    coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email_confirmed_at
  )
  on conflict (id) do nothing;

  if new.email_confirmed_at is not null and new.email is not null then
    -- Το "update" ξανατρέχει το drivers_before_write, που κάνει τη σύνδεση.
    update public.drivers set email = email where email = lower(new.email);
  end if;
  return new;
end;
$$;

-- Αντικαθιστά τυχόν trigger με το ίδιο όνομα από παλιότερη εγκατάσταση.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 3δ. Επιβεβαίωση / αλλαγή email → ενημέρωση προφίλ και σύνδεσης οδηγού.
create function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(new.email), email_confirmed_at = new.email_confirmed_at
  where id = new.id;

  update public.drivers
  set email = email
  where user_id = new.id or email = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_user_updated();


-- ---------------------------------------------------------------------
-- 4. Ορισμός του πρώτου Admin (ιδιοκτήτη)
-- ---------------------------------------------------------------------
-- Όσο ΔΕΝ υπάρχει admin, ο πρώτος συνδεδεμένος χρήστης που θα πατήσει
-- «Είμαι ο ιδιοκτήτης» γίνεται admin. Μετά κλειδώνει οριστικά.

create function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

create function public.claim_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Απαιτείται σύνδεση' using errcode = '42501';
  end if;

  -- Σειριοποίηση ταυτόχρονων αιτημάτων.
  perform pg_advisory_xact_lock(hashtext('taxi_fleet.claim_admin'));

  if exists (select 1 from public.profiles where role = 'admin') then
    return false;
  end if;

  insert into public.profiles (id, email, email_confirmed_at, role)
  select u.id, lower(u.email), u.email_confirmed_at, 'admin'
  from auth.users u
  where u.id = v_uid
  on conflict (id) do update set role = 'admin';

  return true;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Αναφορά ανά οδηγό και μήνα (σέβεται το RLS του χρήστη που τη διαβάζει)
-- ---------------------------------------------------------------------
create view public.monthly_summary
with (security_invoker = true)
as
select
  s.driver_id,
  d.name                         as driver_name,
  d.plate,
  s.year,
  s.month,
  count(*)::integer              as shifts,
  sum(s.trips)::integer          as trips,
  sum(s.paid_km)                 as paid_km,
  sum(s.empty_km)                as empty_km,
  sum(s.total_km)                as total_km,
  sum(s.net_revenue)             as net_revenue,
  sum(s.vat)                     as vat,
  sum(s.tips)                    as tips,
  sum(s.gross_receipts)          as gross_receipts,
  sum(s.fuel)                    as fuel,
  sum(s.other_expenses)          as other_expenses,
  sum(s.repairs)                 as repairs,
  sum(s.total_expenses)          as total_expenses,
  sum(s.expenses_vat)            as expenses_vat,
  sum(s.vat_balance)             as vat_balance,
  case
    when sum(s.vat_balance) > 0 then 'Χρεωστικό'
    when sum(s.vat_balance) < 0 then 'Πιστωτικό'
    else 'Μηδενικό'
  end                            as vat_status,
  sum(s.net_cash)                as net_cash,
  case when sum(s.total_km) > 0
       then round(sum(s.paid_km) / sum(s.total_km) * 100, 1) else 0 end as utilization_pct,
  case when sum(s.total_km) > 0
       then round(sum(s.net_revenue) / sum(s.total_km), 2) else 0 end    as revenue_per_km
from public.shifts s
join public.drivers d on d.id = s.driver_id
group by s.driver_id, d.name, d.plate, s.year, s.month;

comment on view public.monthly_summary is 'Σύνολα ανά οδηγό/μήνα με τους ίδιους τύπους της εφαρμογής.';


-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.drivers  enable row level security;
alter table public.shifts   enable row level security;

-- Προφίλ: ο καθένας το δικό του, ο admin όλα. Αλλαγή μόνο ονόματος (βλ. GRANT).
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Οδηγοί: ο admin όλους, ο οδηγός μόνο τη δική του εγγραφή. Αλλαγές μόνο ο admin.
create policy "drivers_select_admin_or_self" on public.drivers
  for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()));

create policy "drivers_insert_admin" on public.drivers
  for insert to authenticated
  with check ((select private.is_admin()));

create policy "drivers_update_admin" on public.drivers
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "drivers_delete_admin" on public.drivers
  for delete to authenticated
  using ((select private.is_admin()));

-- Βάρδιες: ο admin όλες· ο οδηγός ΜΟΝΟ τις δικές του.
create policy "shifts_select_admin_or_own" on public.shifts
  for select to authenticated
  using ((select private.is_admin()) or driver_id = (select private.current_driver_id()));

create policy "shifts_insert_admin_or_own" on public.shifts
  for insert to authenticated
  with check ((select private.is_admin()) or driver_id = (select private.current_active_driver_id()));

create policy "shifts_update_admin" on public.shifts
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Ο οδηγός διορθώνει λάθος καταχώρηση μόνο μέσα σε 24 ώρες· μετά μόνο ο admin.
create policy "shifts_delete_admin_or_own_recent" on public.shifts
  for delete to authenticated
  using (
    (select private.is_admin())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  );


-- ---------------------------------------------------------------------
-- 7. Δικαιώματα (ρητά, ώστε να μη βασιζόμαστε σε προεπιλογές του project)
-- ---------------------------------------------------------------------
revoke all on table public.profiles, public.drivers, public.shifts, public.monthly_summary
  from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.drivers to authenticated;
grant select, insert, update, delete on table public.shifts to authenticated;
grant select on table public.monthly_summary to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_admin(),
  private.current_driver_id(),
  private.current_active_driver_id()
  to authenticated;

revoke all on function public.admin_exists(), public.claim_admin() from public, anon;
grant execute on function public.admin_exists(), public.claim_admin() to authenticated;


-- ---------------------------------------------------------------------
-- 8. Λογαριασμοί που υπήρχαν ήδη (π.χ. από προηγούμενη δοκιμή)
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, full_name, email_confirmed_at)
select u.id, lower(u.email), coalesce(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email_confirmed_at
from auth.users u
on conflict (id) do nothing;

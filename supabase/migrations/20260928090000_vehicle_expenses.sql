-- =====================================================================
--  Έξοδα Οχήματος (εκτός βάρδιας)
-- =====================================================================
--  Επισκευές, service, ελαστικά, πλύσιμο, διόδια κ.λπ. δεν ανήκουν σε μία
--  βάρδια (π.χ. ένα συνεργείο 800 € θα «χαλούσε» το ταμείο της βάρδιας):
--  καταχωρούνται χωριστά, ανά Έτος/Μήνα, για το συγκεκριμένο αυτοκίνητο
--  (εγγραφή στόλου: οδηγός + πινακίδα). Στη βάρδια μένουν τα καύσιμα.
--
--  Τα ποσά είναι τελικά, με ΦΠΑ 24% μέσα· ο ΦΠΑ τους συμψηφίζεται με τον
--  ΦΠΑ εσόδων 13%, όπως των καυσίμων.
--
--  Δικαιώματα όπως στις βάρδιες: ο admin όλα· ο οδηγός βλέπει τα έξοδα
--  του δικού του αυτοκινήτου, καταχωρεί νέα και διορθώνει/διαγράφει δικές
--  του καταχωρήσεις μέσα σε 24 ώρες.
-- =====================================================================

create table public.vehicle_expenses (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers (id) on delete restrict,
  year        smallint not null check (year between 2000 and 2100),
  month       smallint not null check (month between 1 and 12),
  category    text not null default 'other'
              check (category in ('repairs', 'service', 'tires', 'wash', 'tolls', 'other')),
  description text not null default '' check (char_length(description) <= 200),
  amount      numeric(12, 2) not null check (amount > 0 and amount <= 1000000),
  -- Εμπεριεχόμενος ΦΠΑ 24%: ποσό / 1.24 × 0.24 (ίδιος τύπος με τις βάρδιες).
  vat         numeric(12, 2) generated always as (round(amount / 1.24 * 0.24, 2)) stored,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.vehicle_expenses is
  'Έξοδα αυτοκινήτου εκτός βάρδιας (επισκευές, service, ελαστικά…), ανά Έτος/Μήνα, με ΦΠΑ 24% μέσα.';
comment on column public.vehicle_expenses.driver_id is 'Το αυτοκίνητο: εγγραφή στόλου (οδηγός + πινακίδα).';

create index vehicle_expenses_driver_period_idx on public.vehicle_expenses (driver_id, year, month);
create index vehicle_expenses_period_idx on public.vehicle_expenses (year, month);
create index vehicle_expenses_created_by_idx on public.vehicle_expenses (created_by);

-- Ποιος/πότε καταχώρησε (δεν μπορεί να πλαστογραφηθεί), όπως στις βάρδιες.
create function private.vehicle_expenses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.description := btrim(coalesce(new.description, ''));
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

create trigger vehicle_expenses_before_write
  before insert or update on public.vehicle_expenses
  for each row execute function private.vehicle_expenses_before_write();


-- ---------------------------------------------------------------------
-- Row Level Security & δικαιώματα
-- ---------------------------------------------------------------------
alter table public.vehicle_expenses enable row level security;

create policy "vehicle_expenses_select_admin_or_own" on public.vehicle_expenses
  for select to authenticated
  using ((select private.is_admin()) or driver_id = (select private.current_driver_id()));

create policy "vehicle_expenses_insert_admin_or_own" on public.vehicle_expenses
  for insert to authenticated
  with check ((select private.is_admin()) or driver_id = (select private.current_active_driver_id()));

create policy "vehicle_expenses_update_admin_or_own_recent" on public.vehicle_expenses
  for update to authenticated
  using (
    (select private.is_admin())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  )
  with check (
    (select private.is_admin())
    or (
      driver_id = (select private.current_active_driver_id())
      and created_by = (select auth.uid())
    )
  );

create policy "vehicle_expenses_delete_admin_or_own_recent" on public.vehicle_expenses
  for delete to authenticated
  using (
    (select private.is_admin())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  );

revoke all on table public.vehicle_expenses from anon, authenticated;
grant select, insert, update, delete on table public.vehicle_expenses to authenticated;
revoke all on function private.vehicle_expenses_before_write() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Ποσά «Άλλες δαπάνες» / «Επισκευές» που ήταν μέσα σε βάρδιες → Έξοδα
-- Οχήματος του ίδιου μήνα και αυτοκινήτου (τα σύνολα μένουν ίδια).
-- ---------------------------------------------------------------------
alter table public.vehicle_expenses disable trigger vehicle_expenses_before_write;

insert into public.vehicle_expenses (driver_id, year, month, category, description, amount, created_by, created_at)
select driver_id, year, month, 'repairs', 'Από τη βάρδια Ζ ' || z_number, repairs, created_by, created_at
from public.shifts
where repairs > 0
union all
select driver_id, year, month, 'other', 'Από τη βάρδια Ζ ' || z_number, other_expenses, created_by, created_at
from public.shifts
where other_expenses > 0;

alter table public.vehicle_expenses enable trigger vehicle_expenses_before_write;

update public.shifts
set other_expenses = 0, repairs = 0
where other_expenses > 0 or repairs > 0;


-- ---------------------------------------------------------------------
-- Μηνιαία αναφορά: βάρδιες + έξοδα οχήματος ανά αυτοκίνητο και μήνα
-- (ίδιες στήλες με πριν, και νέα στήλη vehicle_expenses στο τέλος).
-- ---------------------------------------------------------------------
create or replace view public.monthly_summary
with (security_invoker = true)
as
with s as (
  select
    driver_id, year, month,
    count(*)::integer     as shifts,
    sum(trips)::integer   as trips,
    sum(paid_km)          as paid_km,
    sum(empty_km)         as empty_km,
    sum(total_km)         as total_km,
    sum(net_revenue)      as net_revenue,
    sum(vat)              as vat,
    sum(tips)             as tips,
    sum(gross_receipts)   as gross_receipts,
    sum(fuel)             as fuel,
    sum(other_expenses)   as other_expenses,
    sum(repairs)          as repairs,
    sum(total_expenses)   as total_expenses,
    sum(expenses_vat)     as expenses_vat
  from public.shifts
  group by driver_id, year, month
),
e as (
  select driver_id, year, month, sum(amount) as amount, sum(vat) as vat
  from public.vehicle_expenses
  group by driver_id, year, month
),
m as (
  select
    coalesce(s.driver_id, e.driver_id)  as driver_id,
    coalesce(s.year, e.year)            as year,
    coalesce(s.month, e.month)          as month,
    coalesce(s.shifts, 0)               as shifts,
    coalesce(s.trips, 0)                as trips,
    coalesce(s.paid_km, 0)              as paid_km,
    coalesce(s.empty_km, 0)             as empty_km,
    coalesce(s.total_km, 0)             as total_km,
    coalesce(s.net_revenue, 0)          as net_revenue,
    coalesce(s.vat, 0)                  as vat,
    coalesce(s.tips, 0)                 as tips,
    coalesce(s.gross_receipts, 0)       as gross_receipts,
    coalesce(s.fuel, 0)                 as fuel,
    coalesce(s.other_expenses, 0)       as other_expenses,
    coalesce(s.repairs, 0)              as repairs,
    coalesce(s.total_expenses, 0) + coalesce(e.amount, 0) as total_expenses,
    coalesce(s.expenses_vat, 0) + coalesce(e.vat, 0)      as expenses_vat,
    coalesce(e.amount, 0)               as vehicle_expenses
  from s
  full join e on e.driver_id = s.driver_id and e.year = s.year and e.month = s.month
)
select
  m.driver_id,
  d.name                               as driver_name,
  d.plate,
  m.year,
  m.month,
  m.shifts,
  m.trips,
  m.paid_km,
  m.empty_km,
  m.total_km,
  m.net_revenue,
  m.vat,
  m.tips,
  m.gross_receipts,
  m.fuel,
  m.other_expenses,
  m.repairs,
  m.total_expenses,
  m.expenses_vat,
  m.vat - m.expenses_vat               as vat_balance,
  case
    when m.vat - m.expenses_vat > 0 then 'Χρεωστικό'
    when m.vat - m.expenses_vat < 0 then 'Πιστωτικό'
    else 'Μηδενικό'
  end                                  as vat_status,
  m.gross_receipts - m.total_expenses  as net_cash,
  case when m.total_km > 0
       then round(m.paid_km / m.total_km * 100, 1) else 0 end as utilization_pct,
  case when m.total_km > 0
       then round(m.net_revenue / m.total_km, 2) else 0 end    as revenue_per_km,
  m.vehicle_expenses
from m
join public.drivers d on d.id = m.driver_id;

comment on view public.monthly_summary is
  'Σύνολα ανά αυτοκίνητο (οδηγό) και μήνα: βάρδιες + έξοδα οχήματος, με τους ίδιους τύπους της εφαρμογής.';

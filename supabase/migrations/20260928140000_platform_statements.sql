-- =====================================================================
--  Εφαρμογές (Uber / FreeNow): εβδομαδιαία κίνηση & μηνιαίο τιμολόγιο
-- =====================================================================
--  Οι κούρσες των εφαρμογών περνάνε κι αυτές από το ταξίμετρο (είναι μέσα
--  στο Ζ). Από την εβδομαδιαία κίνηση της εφαρμογής καταχωρούνται οι
--  διαδρομές, ο τζίρος και η κράτηση (προμήθεια): έτσι φαίνονται οι
--  διαδρομές από τον δρόμο (Ζ − εφαρμογές) και τι κοστίζει κάθε εφαρμογή.
--
--  Εβδομάδα = Δευτέρα–Κυριακή, κομμένη στην αλλαγή του μήνα: ο Οκτώβριος
--  2026 ξεκινά Πέμπτη, άρα η πρώτη του εβδομάδα είναι 1–4/10 (4 ημέρες) και
--  η τελευταία 26–31/10. Κάθε εβδομάδα ανήκει σε έναν μόνο μήνα.
--
--  Κρατήσεις στα έξοδα, στον ΦΠΑ και στο ταμείο: όταν υπάρχει το μηνιαίο
--  τιμολόγιο της εφαρμογής μετράει αυτό, αλλιώς το άθροισμα των εβδομάδων.
--  FreeNow: τιμολόγιο με ΦΠΑ 24% μέσα (συμψηφίζεται).
--  Uber: τιμολόγιο χωρίς ΦΠΑ (δεν συμψηφίζεται).
--
--  Δικαιώματα όπως στα έξοδα οχήματος: ο admin όλα· ο οδηγός βλέπει και
--  καταχωρεί για το δικό του αυτοκίνητο και διορθώνει/διαγράφει δικές του
--  καταχωρήσεις μέσα σε 24 ώρες.
-- =====================================================================

create table public.platform_statements (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.drivers (id) on delete restrict,
  platform       text not null check (platform in ('uber', 'freenow')),
  -- 'week': εβδομαδιαία κίνηση · 'invoice': μηνιαίο τιμολόγιο κρατήσεων.
  kind           text not null check (kind in ('week', 'invoice')),
  year           smallint not null check (year between 2000 and 2100),
  month          smallint not null check (month between 1 and 12),
  -- Εβδομάδα: η πρώτη της μέρα (Δευτέρα ή 1η του μήνα)· το τέλος υπολογίζεται
  -- (Κυριακή ή τελευταία μέρα του μήνα).
  week_start     date,
  week_end       date generated always as (
                   case when kind = 'week' then least(
                     week_start + (7 - extract(isodow from week_start)::integer),
                     (date_trunc('month', week_start::timestamp) + interval '1 month - 1 day')::date
                   ) end
                 ) stored,
  trips          integer not null default 0 check (trips between 0 and 100000),
  turnover       numeric(12, 2) not null default 0 check (turnover between 0 and 1000000),
  -- Κράτηση της εφαρμογής, τελικό ποσό (με ΦΠΑ όπου υπάρχει).
  commission     numeric(12, 2) not null check (commission between 0 and 1000000),
  -- ΦΠΑ 24% μέσα στην κράτηση: μόνο FreeNow (η Uber τιμολογεί χωρίς ΦΠΑ).
  commission_vat numeric(12, 2) generated always as (
                   case when platform = 'freenow' then round(commission / 1.24 * 0.24, 2) else 0 end
                 ) stored,
  -- Αριθμός τιμολογίου (προαιρετικά).
  reference      text not null default '' check (char_length(reference) <= 60),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint platform_statements_shape check (
    case kind
      when 'week' then
        week_start is not null
        and extract(year from week_start) = year
        and extract(month from week_start) = month
        and (extract(isodow from week_start) = 1 or extract(day from week_start) = 1)
      else
        week_start is null and trips = 0 and turnover = 0 and commission > 0
    end
  )
);
comment on table public.platform_statements is
  'Εφαρμογές (Uber/FreeNow): εβδομαδιαία κίνηση (διαδρομές, τζίρος, κράτηση) και μηνιαίο τιμολόγιο κρατήσεων.';
comment on column public.platform_statements.driver_id is 'Το αυτοκίνητο: εγγραφή στόλου (οδηγός + πινακίδα).';

-- Μία εβδομάδα και ένα τιμολόγιο ανά αυτοκίνητο και εφαρμογή.
create unique index platform_statements_week_key
  on public.platform_statements (driver_id, platform, week_start) where kind = 'week';
create unique index platform_statements_invoice_key
  on public.platform_statements (driver_id, platform, year, month) where kind = 'invoice';
create index platform_statements_driver_period_idx on public.platform_statements (driver_id, year, month);
create index platform_statements_period_idx on public.platform_statements (year, month);
create index platform_statements_created_by_idx on public.platform_statements (created_by);

-- Ποιος/πότε καταχώρησε (δεν μπορεί να πλαστογραφηθεί), όπως στις βάρδιες.
create function private.platform_statements_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reference := btrim(coalesce(new.reference, ''));
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

create trigger platform_statements_before_write
  before insert or update on public.platform_statements
  for each row execute function private.platform_statements_before_write();


-- ---------------------------------------------------------------------
-- Row Level Security & δικαιώματα
-- ---------------------------------------------------------------------
alter table public.platform_statements enable row level security;

create policy "platform_statements_select_admin_or_own" on public.platform_statements
  for select to authenticated
  using ((select private.is_admin()) or driver_id = (select private.current_driver_id()));

create policy "platform_statements_insert_admin_or_own" on public.platform_statements
  for insert to authenticated
  with check ((select private.is_admin()) or driver_id = (select private.current_active_driver_id()));

create policy "platform_statements_update_admin_or_own_recent" on public.platform_statements
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

create policy "platform_statements_delete_admin_or_own_recent" on public.platform_statements
  for delete to authenticated
  using (
    (select private.is_admin())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  );

revoke all on table public.platform_statements from anon, authenticated;
grant select, insert, update, delete on table public.platform_statements to authenticated;
revoke all on function private.platform_statements_before_write() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Μηνιαία αναφορά: βάρδιες + έξοδα οχήματος + εφαρμογές ανά αυτοκίνητο και
-- μήνα (ίδιες στήλες με πριν, και νέες στήλες εφαρμογών στο τέλος).
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
-- Ανά εφαρμογή: διαδρομές/τζίρος από τις εβδομάδες· κράτηση από το
-- τιμολόγιο του μήνα, αλλιώς το άθροισμα των εβδομάδων.
p as (
  select
    driver_id, year, month, platform,
    coalesce(sum(trips) filter (where kind = 'week'), 0)    as trips,
    coalesce(sum(turnover) filter (where kind = 'week'), 0) as turnover,
    coalesce(sum(commission) filter (where kind = 'invoice'),
             sum(commission) filter (where kind = 'week'), 0)     as commission,
    coalesce(sum(commission_vat) filter (where kind = 'invoice'),
             sum(commission_vat) filter (where kind = 'week'), 0) as commission_vat
  from public.platform_statements
  group by driver_id, year, month, platform
),
a as (
  select
    driver_id, year, month,
    sum(trips)::integer  as trips,
    sum(turnover)        as turnover,
    sum(commission)      as commission,
    sum(commission_vat)  as commission_vat
  from p
  group by driver_id, year, month
),
k as (
  select driver_id, year, month from s
  union
  select driver_id, year, month from e
  union
  select driver_id, year, month from a
),
m as (
  select
    k.driver_id,
    k.year,
    k.month,
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
    coalesce(s.total_expenses, 0) + coalesce(e.amount, 0) + coalesce(a.commission, 0)  as total_expenses,
    coalesce(s.expenses_vat, 0) + coalesce(e.vat, 0) + coalesce(a.commission_vat, 0)   as expenses_vat,
    coalesce(e.amount, 0)               as vehicle_expenses,
    coalesce(a.trips, 0)                as app_trips,
    coalesce(a.turnover, 0)             as app_turnover,
    coalesce(a.commission, 0)           as app_commission,
    coalesce(a.commission_vat, 0)       as app_commission_vat
  from k
  left join s on s.driver_id = k.driver_id and s.year = k.year and s.month = k.month
  left join e on e.driver_id = k.driver_id and e.year = k.year and e.month = k.month
  left join a on a.driver_id = k.driver_id and a.year = k.year and a.month = k.month
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
  m.vehicle_expenses,
  m.app_trips,
  m.app_turnover,
  m.app_commission,
  m.app_commission_vat,
  m.trips - m.app_trips                as street_trips
from m
join public.drivers d on d.id = m.driver_id;

comment on view public.monthly_summary is
  'Σύνολα ανά αυτοκίνητο (οδηγό) και μήνα: βάρδιες + έξοδα οχήματος + κρατήσεις εφαρμογών, με τους ίδιους τύπους της εφαρμογής.';

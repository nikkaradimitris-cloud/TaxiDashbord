-- =====================================================================
--  «Άλλα έξοδα»: μετράει μόνο ο ΦΠΑ τους
-- =====================================================================
--  Τα έξοδα οχήματος «Άλλα έξοδα» (category = 'other') δεν μπαίνουν στο σύνολο
--  εξόδων και δεν αφαιρούνται από το ταμείο· ο ΦΠΑ τους συμψηφίζεται όπως πριν.
--  Οι «Επισκευές / Συντήρηση» μένουν όπως ήταν (έξοδα, ΦΠΑ, ταμείο). Ίδιος κανόνας
--  με την εφαρμογή (lib/accounting.ts). Η στήλη vehicle_expenses έχει πια μόνο
--  όσα μετράνε στα έξοδα· νέα στήλη στο τέλος: vat_only_expenses (τα «Άλλα έξοδα»).
--  Δεν αλλάζει κανένα αποθηκευμένο στοιχείο: μόνο η μηνιαία αναφορά.
-- =====================================================================

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
-- Έξοδα οχήματος: οι «Επισκευές / Συντήρηση» στα έξοδα και στο ταμείο· από τα
-- «Άλλα έξοδα» μετράει μόνο ο ΦΠΑ. Ο ΦΠΑ όλων συμψηφίζεται.
e as (
  select
    driver_id, year, month,
    coalesce(sum(amount) filter (where category <> 'other'), 0) as amount,
    coalesce(sum(amount) filter (where category = 'other'), 0)  as vat_only_amount,
    sum(vat)                                                     as vat
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
    coalesce(a.commission_vat, 0)       as app_commission_vat,
    coalesce(e.vat_only_amount, 0)      as vat_only_expenses
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
  m.trips - m.app_trips                as street_trips,
  m.vat_only_expenses
from m
join public.drivers d on d.id = m.driver_id;

comment on view public.monthly_summary is
  'Σύνολα ανά αυτοκίνητο (οδηγό) και μήνα: βάρδιες + έξοδα οχήματος (από τα «Άλλα έξοδα» μόνο ο ΦΠΑ) + κρατήσεις εφαρμογών, με τους ίδιους τύπους της εφαρμογής.';

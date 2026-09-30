-- =====================================================================
--  Καύσιμο ανά αυτοκίνητο: για τα όρια του μετρητή αξιοποίησης
-- =====================================================================
--  Ο μετρητής «Αξιοποίηση χιλιομέτρων» (μισθωμένα / συνολικά χλμ) κρίνει
--  με άλλα όρια ανάλογα με το καύσιμο (lib/utilization.ts):
--    βενζίνη, πετρέλαιο, αέριο  → υψηλότερες απαιτήσεις,
--    υβριδικό, ηλεκτρικό        → χαμηλότερες (φθηνότερο χιλιόμετρο).
--  Κενό = δεν έχει δηλωθεί ακόμη: η εφαρμογή ρωτά τον ιδιοκτήτη.
-- =====================================================================

alter table public.drivers
  add column fuel text check (fuel in ('petrol', 'diesel', 'lpg', 'hybrid', 'electric'));
comment on column public.drivers.fuel is
  'Καύσιμο: petrol, diesel, lpg (βενζίνη, πετρέλαιο, αέριο) ή hybrid, electric (υβριδικό, ηλεκτρικό). Κενό = δεν δηλώθηκε.';

-- Ο ιδιοκτήτης το ορίζει και το αλλάζει (όπως όνομα, πινακίδα, κινητό).
grant insert (fuel), update (fuel) on table public.drivers to authenticated;

-- «Έχω δικό μου ταξί»: και το καύσιμο του πρώτου αυτοκινήτου.
drop function public.create_fleet(text, text);

create function public.create_fleet(p_name text, p_plate text default null, p_fuel text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_fleet uuid;
begin
  if v_uid is null then
    raise exception 'Απαιτείται σύνδεση' using errcode = '42501';
  end if;

  -- Σειριοποίηση ταυτόχρονων αιτημάτων του ίδιου λογαριασμού.
  perform pg_advisory_xact_lock(hashtext('taxi_fleet.account'), hashtext(v_uid::text));

  if exists (select 1 from public.fleets where owner_id = v_uid) then
    raise exception 'Έχετε ήδη δικό σας στόλο.';
  end if;
  if exists (select 1 from public.drivers where user_id = v_uid) then
    raise exception 'Ο λογαριασμός σας είναι ήδη οδηγός σε στόλο.';
  end if;
  v_email := private.current_confirmed_email();
  if v_email is null then
    raise exception 'Επιβεβαιώστε πρώτα το email σας (σύνδεσμος στο email της εγγραφής).';
  end if;

  insert into public.fleets (name, owner_id) values (btrim(p_name), v_uid) returning id into v_fleet;

  insert into public.profiles (id, email, email_confirmed_at, role)
  select u.id, lower(u.email), u.email_confirmed_at, 'admin'
  from auth.users u
  where u.id = v_uid
  on conflict (id) do update set role = 'admin';

  -- Το trigger το βάζει στον στόλο και το συνδέει με τον ιδιοκτήτη (ίδιο email).
  insert into public.drivers (fleet_id, name, plate, email, fuel) values (v_fleet, p_name, p_plate, v_email, p_fuel);
  return v_fleet;
end;
$$;

revoke all on function public.create_fleet(text, text, text) from public, anon;
grant execute on function public.create_fleet(text, text, text) to authenticated;

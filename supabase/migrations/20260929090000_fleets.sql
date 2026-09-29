-- =====================================================================
--  Χωριστοί στόλοι: κάθε ιδιοκτήτης βλέπει μόνο τον δικό του
-- =====================================================================
--  Μέχρι τώρα η εφαρμογή είχε έναν στόλο και έναν Διαχειριστή. Από εδώ και
--  πέρα κάθε λογαριασμός μπορεί να φτιάξει τον δικό του στόλο («Έχω δικό
--  μου ταξί», public.create_fleet) και γίνεται ο ιδιοκτήτης του (ρόλος
--  admin). Ο ιδιοκτήτης βλέπει και διαχειρίζεται ΜΟΝΟ τον δικό του στόλο·
--  ο οδηγός ΜΟΝΟ τα δικά του, όπως πριν.
--
--  Οδηγοί: ο ιδιοκτήτης γράφει το email του οδηγού (το ίδιο email μπορεί να
--  υπάρχει σε δύο στόλους). Ο οδηγός κάνει εγγραφή με αυτό και βλέπει την
--  πρόσκληση (public.my_invites)· η σύνδεση γίνεται μόνο όταν πατήσει
--  «Αποδοχή» (public.accept_invite). Έτσι κανένας στόλος δεν «τραβάει» έναν
--  λογαριασμό χωρίς τη συγκατάθεσή του, και από τα σφάλματα δεν φαίνεται αν
--  ένα email υπάρχει σε άλλον στόλο. Εξαίρεση: το email του ίδιου του
--  ιδιοκτήτη στον δικό του στόλο συνδέεται αμέσως.
--
--  Κάθε λογαριασμός ανήκει σε έναν στόλο: ως ιδιοκτήτης ή ως οδηγός.
--  Τα υπάρχοντα στοιχεία γίνονται ο στόλος του υπάρχοντος Διαχειριστή· τα
--  ποσά και οι συνδέσεις των οδηγών δεν αλλάζουν.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Στόλοι
-- ---------------------------------------------------------------------
create table public.fleets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> '' and char_length(name) <= 100),
  -- Ένας ιδιοκτήτης ανά στόλο και ένας στόλος ανά ιδιοκτήτη. Ο λογαριασμός
  -- του δεν διαγράφεται όσο υπάρχει ο στόλος (προστασία των στοιχείων).
  owner_id   uuid not null unique references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
comment on table public.fleets is 'Στόλος: ο ιδιοκτήτης (owner_id) και τα αυτοκίνητα/οδηγοί του (drivers.fleet_id).';

alter table public.drivers add column fleet_id uuid references public.fleets (id) on delete restrict;
comment on column public.drivers.fleet_id is 'Ο στόλος του αυτοκινήτου/οδηγού. Ορίζεται αυτόματα (ο στόλος του ιδιοκτήτη) και δεν αλλάζει.';


-- ---------------------------------------------------------------------
-- 2. Τα υπάρχοντα στοιχεία → ο στόλος του υπάρχοντος Διαχειριστή
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_fleet uuid;
begin
  if (select count(*) from public.profiles where role = 'admin') > 1 then
    raise exception using
      message = 'Υπάρχουν περισσότεροι από ένας Διαχειριστές: δεν είναι σαφές σε ποιον ανήκει ο στόλος.',
      hint = 'Αφήστε έναν Διαχειριστή (οι άλλοι: role = ''driver'') και ξανατρέξτε.';
  end if;

  select id into v_owner from public.profiles where role = 'admin';
  if v_owner is null then
    if exists (select 1 from public.drivers) then
      raise exception 'Υπάρχουν οδηγοί χωρίς Διαχειριστή: δεν είναι σαφές σε ποιον ανήκει ο στόλος.';
    end if;
    return;
  end if;

  insert into public.fleets (name, owner_id)
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Ο στόλος μου'), p.id
  from public.profiles p
  where p.id = v_owner
  returning id into v_fleet;

  -- Χωρίς το trigger: οι συνδέσεις των οδηγών μένουν όπως είναι.
  alter table public.drivers disable trigger drivers_before_write;
  update public.drivers set fleet_id = v_fleet;
  alter table public.drivers enable trigger drivers_before_write;
end;
$$;

alter table public.drivers alter column fleet_id set not null;

-- Το ίδιο email μία φορά ανά στόλο (όχι σε όλη την εφαρμογή). Χρησιμεύει και
-- ως ευρετήριο για τα ερωτήματα ανά στόλο.
alter table public.drivers drop constraint drivers_email_key;
alter table public.drivers add constraint drivers_fleet_email_key unique (fleet_id, email);


-- ---------------------------------------------------------------------
-- 3. Βοηθητικές συναρτήσεις για τους κανόνες ασφαλείας
-- ---------------------------------------------------------------------

-- Ο στόλος του συνδεδεμένου ιδιοκτήτη (ή null).
create function private.owned_fleet_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.fleets where owner_id = (select auth.uid());
$$;

-- Τα αυτοκίνητα/οδηγοί του στόλου του συνδεδεμένου ιδιοκτήτη.
create function private.owned_driver_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.drivers d
  join public.fleets f on f.id = d.fleet_id
  where f.owner_id = (select auth.uid());
$$;

-- Οι λογαριασμοί των οδηγών του στόλου του συνδεδεμένου ιδιοκτήτη.
create function private.owned_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id
  from public.drivers d
  join public.fleets f on f.id = d.fleet_id
  where f.owner_id = (select auth.uid()) and d.user_id is not null;
$$;

-- Νέος οδηγός: στον στόλο του ιδιοκτήτη που τον προσθέτει (η εφαρμογή δεν στέλνει στόλο).
alter table public.drivers alter column fleet_id set default private.owned_fleet_id();

-- Το επιβεβαιωμένο email του συνδεδεμένου χρήστη (ή null).
create function private.current_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;


-- ---------------------------------------------------------------------
-- 4. Triggers: στόλος και σύνδεση λογαριασμού
-- ---------------------------------------------------------------------

-- Οδηγοί: κανονικοποίηση, στόλος του ιδιοκτήτη, σύνδεση μόνο με «Αποδοχή».
create or replace function private.drivers_before_write()
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

  if tg_op = 'INSERT' then
    -- Νέος οδηγός: στον στόλο του ιδιοκτήτη που τον προσθέτει.
    new.fleet_id := coalesce(new.fleet_id, private.owned_fleet_id());
  else
    -- Δεν μεταφέρεται σε άλλον στόλο.
    new.fleet_id := old.fleet_id;
  end if;

  -- Νέο ή άλλο email: καμία σύνδεση μέχρι την «Αποδοχή» της πρόσκλησης
  -- (public.accept_invite), εκτός από το email του ίδιου του ιδιοκτήτη
  -- στον δικό του στόλο. Αλλιώς η σύνδεση μένει όπως είναι.
  if tg_op = 'INSERT' or new.email is distinct from old.email then
    new.user_id := case
      when new.email is not null
       and new.email = private.current_confirmed_email()
       and new.fleet_id = private.owned_fleet_id()
      then (select auth.uid())
    end;
  end if;
  return new;
end;
$$;

-- Νέος λογαριασμός → μόνο προφίλ (ρόλος driver). Η σύνδεση με οδηγό γίνεται
-- πλέον μόνο με την «Αποδοχή» της πρόσκλησης.
create or replace function private.handle_new_user()
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
  return new;
end;
$$;

-- Αλλαγή email → ενημέρωση προφίλ· η σύνδεση με οδηγό που έχει άλλο email
-- χάνεται (ο ιδιοκτήτης γράφει το νέο email και ο οδηγός αποδέχεται ξανά).
create or replace function private.handle_user_updated()
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
  set user_id = null
  where user_id = new.id and email is distinct from lower(new.email);
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. «Έχω δικό μου ταξί», πρόσκληση και αποδοχή
-- ---------------------------------------------------------------------

-- Νέος στόλος: ο λογαριασμός γίνεται ιδιοκτήτης του, με το πρώτο αυτοκίνητο
-- (το όνομά του και η πινακίδα) συνδεδεμένο με τον ίδιο.
create function public.create_fleet(p_name text, p_plate text default null)
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
  insert into public.drivers (fleet_id, name, plate, email) values (v_fleet, p_name, p_plate, v_email);
  return v_fleet;
end;
$$;

-- Οι προσκλήσεις για το (επιβεβαιωμένο) email του συνδεδεμένου χρήστη.
create function public.my_invites()
returns table (driver_id uuid, driver_name text, plate text, fleet_name text, owner_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.plate, f.name, lower(o.email)
  from public.drivers d
  join public.fleets f on f.id = d.fleet_id
  join auth.users o on o.id = f.owner_id
  where d.user_id is null
    and d.email = private.current_confirmed_email()
  order by d.created_at, d.id;
$$;

-- «Αποδοχή»: ο λογαριασμός συνδέεται με τον οδηγό της πρόσκλησης.
-- false αν δεν υπάρχει (πια) τέτοια πρόσκληση για το email του.
create function public.accept_invite(p_driver_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Απαιτείται σύνδεση' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('taxi_fleet.account'), hashtext(v_uid::text));

  if exists (select 1 from public.fleets where owner_id = v_uid) then
    raise exception 'Έχετε ήδη δικό σας στόλο.';
  end if;
  if exists (select 1 from public.drivers where user_id = v_uid) then
    raise exception 'Ο λογαριασμός σας είναι ήδη οδηγός σε στόλο.';
  end if;

  v_email := private.current_confirmed_email();
  update public.drivers
  set user_id = v_uid
  where id = p_driver_id and user_id is null and v_email is not null and email = v_email;
  return found;
end;
$$;

-- Ο πρώτος Διαχειριστής δεν «διεκδικείται» πια: ο καθένας φτιάχνει τον δικό του στόλο.
drop function public.claim_admin();
drop function public.admin_exists();


-- ---------------------------------------------------------------------
-- 6. Row Level Security: ο ιδιοκτήτης μόνο τον στόλο του
-- ---------------------------------------------------------------------
drop policy "profiles_select_own_or_admin" on public.profiles;
drop policy "profiles_update_own" on public.profiles;
drop policy "drivers_select_admin_or_self" on public.drivers;
drop policy "drivers_insert_admin" on public.drivers;
drop policy "drivers_update_admin" on public.drivers;
drop policy "drivers_delete_admin" on public.drivers;
drop policy "shifts_select_admin_or_own" on public.shifts;
drop policy "shifts_insert_admin_or_own" on public.shifts;
drop policy "shifts_update_admin_or_own_recent" on public.shifts;
drop policy "shifts_delete_admin_or_own_recent" on public.shifts;
drop policy "vehicle_expenses_select_admin_or_own" on public.vehicle_expenses;
drop policy "vehicle_expenses_insert_admin_or_own" on public.vehicle_expenses;
drop policy "vehicle_expenses_update_admin_or_own_recent" on public.vehicle_expenses;
drop policy "vehicle_expenses_delete_admin_or_own_recent" on public.vehicle_expenses;
drop policy "platform_rates_select_admin_or_own" on public.platform_rates;
drop policy "platform_rates_insert_admin_or_own" on public.platform_rates;
drop policy "platform_rates_update_admin_or_own" on public.platform_rates;
drop policy "platform_rates_delete_admin" on public.platform_rates;
drop policy "platform_statements_select_admin_or_own" on public.platform_statements;
drop policy "platform_statements_insert_admin_or_own" on public.platform_statements;
drop policy "platform_statements_update_admin_or_own_recent" on public.platform_statements;
drop policy "platform_statements_delete_admin_or_own_recent" on public.platform_statements;

drop function private.is_admin();
drop function private.confirmed_user_id(text);

-- Στόλοι: μόνο ο ιδιοκτήτης βλέπει τον δικό του. Δημιουργία μόνο με create_fleet.
alter table public.fleets enable row level security;

create policy "fleets_select_owner" on public.fleets
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Προφίλ: το δικό του· ο ιδιοκτήτης και των οδηγών του στόλου του (όχι άλλων).
create policy "profiles_select_own_or_fleet" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id in (select private.owned_member_ids()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Οδηγοί: ο ιδιοκτήτης όσους έχει ο στόλος του, ο οδηγός μόνο τη δική του εγγραφή.
create policy "drivers_select_owner_or_self" on public.drivers
  for select to authenticated
  using (fleet_id = (select private.owned_fleet_id()) or user_id = (select auth.uid()));

create policy "drivers_insert_owner" on public.drivers
  for insert to authenticated
  with check (fleet_id = (select private.owned_fleet_id()));

create policy "drivers_update_owner" on public.drivers
  for update to authenticated
  using (fleet_id = (select private.owned_fleet_id()))
  with check (fleet_id = (select private.owned_fleet_id()));

create policy "drivers_delete_owner" on public.drivers
  for delete to authenticated
  using (fleet_id = (select private.owned_fleet_id()));

-- Βάρδιες: ο ιδιοκτήτης όσες είναι του στόλου του· ο οδηγός τις δικές του
-- (διόρθωση/διαγραφή δικών του καταχωρήσεων μέσα σε 24 ώρες).
create policy "shifts_select_owner_or_own" on public.shifts
  for select to authenticated
  using (driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_driver_id()));

create policy "shifts_insert_owner_or_own" on public.shifts
  for insert to authenticated
  with check (
    driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_active_driver_id())
  );

create policy "shifts_update_owner_or_own_recent" on public.shifts
  for update to authenticated
  using (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  )
  with check (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_active_driver_id())
      and created_by = (select auth.uid())
    )
  );

create policy "shifts_delete_owner_or_own_recent" on public.shifts
  for delete to authenticated
  using (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  );

-- Έξοδα οχήματος: όπως οι βάρδιες.
create policy "vehicle_expenses_select_owner_or_own" on public.vehicle_expenses
  for select to authenticated
  using (driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_driver_id()));

create policy "vehicle_expenses_insert_owner_or_own" on public.vehicle_expenses
  for insert to authenticated
  with check (
    driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_active_driver_id())
  );

create policy "vehicle_expenses_update_owner_or_own_recent" on public.vehicle_expenses
  for update to authenticated
  using (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  )
  with check (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_active_driver_id())
      and created_by = (select auth.uid())
    )
  );

create policy "vehicle_expenses_delete_owner_or_own_recent" on public.vehicle_expenses
  for delete to authenticated
  using (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  );

-- Ποσοστά εφαρμογών: ο ιδιοκτήτης του στόλου του· ο οδηγός ορίζει και αλλάζει
-- το ποσοστό του δικού του αυτοκινήτου (διαγραφή μόνο ο ιδιοκτήτης).
create policy "platform_rates_select_owner_or_own" on public.platform_rates
  for select to authenticated
  using (driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_driver_id()));

create policy "platform_rates_insert_owner_or_own" on public.platform_rates
  for insert to authenticated
  with check (
    driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_active_driver_id())
  );

create policy "platform_rates_update_owner_or_own" on public.platform_rates
  for update to authenticated
  using (driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_driver_id()))
  with check (
    driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_active_driver_id())
  );

create policy "platform_rates_delete_owner" on public.platform_rates
  for delete to authenticated
  using (driver_id in (select private.owned_driver_ids()));

-- Εφαρμογές (εβδομάδες / τιμολόγια): όπως οι βάρδιες.
create policy "platform_statements_select_owner_or_own" on public.platform_statements
  for select to authenticated
  using (driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_driver_id()));

create policy "platform_statements_insert_owner_or_own" on public.platform_statements
  for insert to authenticated
  with check (
    driver_id in (select private.owned_driver_ids()) or driver_id = (select private.current_active_driver_id())
  );

create policy "platform_statements_update_owner_or_own_recent" on public.platform_statements
  for update to authenticated
  using (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  )
  with check (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_active_driver_id())
      and created_by = (select auth.uid())
    )
  );

create policy "platform_statements_delete_owner_or_own_recent" on public.platform_statements
  for delete to authenticated
  using (
    driver_id in (select private.owned_driver_ids())
    or (
      driver_id = (select private.current_driver_id())
      and created_by = (select auth.uid())
      and created_at > now() - interval '24 hours'
    )
  );


-- ---------------------------------------------------------------------
-- 7. Δικαιώματα
-- ---------------------------------------------------------------------
revoke all on table public.fleets from anon, authenticated;
grant select on table public.fleets to authenticated;

-- Οδηγοί: ο στόλος και η σύνδεση λογαριασμού δεν γράφονται ποτέ από την εφαρμογή.
revoke insert, update on table public.drivers from authenticated;
grant insert (id, name, plate, phone, email, active) on table public.drivers to authenticated;
grant update (name, plate, phone, email, active) on table public.drivers to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.current_driver_id(),
  private.current_active_driver_id(),
  private.owned_fleet_id(),
  private.owned_driver_ids(),
  private.owned_member_ids()
  to authenticated;

revoke all on function public.create_fleet(text, text), public.my_invites(), public.accept_invite(uuid)
  from public, anon;
grant execute on function public.create_fleet(text, text), public.my_invites(), public.accept_invite(uuid)
  to authenticated;

-- =====================================================================
--  Διόρθωση (επεξεργασία) βάρδιας
-- =====================================================================
--  Ίδιος κανόνας με τη διαγραφή: ο admin διορθώνει οποιαδήποτε βάρδια,
--  ο οδηγός μόνο δικές του καταχωρήσεις μέσα σε 24 ώρες και χωρίς να
--  μπορεί να τις μεταφέρει σε άλλον οδηγό. Το ποιος/πότε καταχώρησε
--  (created_by / created_at) δεν αλλάζει ποτέ (trigger shifts_before_write),
--  και ο ΦΠΑ/τα σύνολα ξαναϋπολογίζονται από τη βάση.
-- =====================================================================

drop policy if exists "shifts_update_admin" on public.shifts;
drop policy if exists "shifts_update_admin_or_own_recent" on public.shifts;

create policy "shifts_update_admin_or_own_recent" on public.shifts
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

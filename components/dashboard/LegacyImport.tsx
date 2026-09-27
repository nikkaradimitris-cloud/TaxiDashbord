'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button, Notice } from '@/components/ui';
import { createDriver } from '@/lib/data';
import { dataErrorMessage } from '@/lib/errors';
import {
  LEGACY_BACKUP_SUFFIX,
  LEGACY_DRIVERS_KEY,
  LEGACY_SHIFTS_KEY,
  normalizeName,
  planLegacyImport,
} from '@/lib/legacy';
import { archiveLegacyKey, getLegacyShiftCount, readLegacyRaw, subscribeStorage } from '@/lib/storage';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow } from '@/lib/types';
import { newId } from '@/lib/uuid';

const CHUNK = 500;

/**
 * Αν σε αυτή τη συσκευή υπάρχουν βάρδιες από την παλιά τοπική έκδοση
 * (localStorage), προσφέρει μεταφορά τους στο Supabase.
 */
export function LegacyImport({
  supabase,
  drivers,
  onImported,
}: {
  supabase: BrowserSupabase;
  drivers: DriverRow[];
  onImported: () => void;
}) {
  const count = useSyncExternalStore(subscribeStorage, getLegacyShiftCount, () => 0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  if (count === 0 && !result) return null;

  async function runImport() {
    if (!confirm(`Μεταφορά ${count} βαρδιών της τοπικής έκδοσης στο Supabase;`)) return;
    setBusy(true);
    setResult(null);
    try {
      const plan = planLegacyImport(readLegacyRaw(LEGACY_SHIFTS_KEY), readLegacyRaw(LEGACY_DRIVERS_KEY), newId);

      // Οδηγοί: αντιστοίχιση με όνομα, αλλιώς δημιουργία.
      const idByName = new Map(drivers.map((d) => [normalizeName(d.name), d.id]));
      let createdDrivers = 0;
      for (const driver of plan.drivers) {
        const key = normalizeName(driver.name);
        if (idByName.has(key)) continue;
        const created = await createDriver(supabase, {
          name: driver.name,
          plate: driver.plate ?? '',
          phone: driver.phone ?? '',
          email: '',
        });
        idByName.set(key, created.id);
        createdDrivers++;
      }

      // Βάρδιες: το αρχικό id κρατιέται, οπότε μια επανάληψη δεν δημιουργεί διπλά.
      const rows = plan.shifts.map(({ driverName, ...shift }) => ({
        ...shift,
        driver_id: idByName.get(normalizeName(driverName))!,
      }));
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('shifts')
          .upsert(rows.slice(i, i + CHUNK), { onConflict: 'id', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        inserted += data.length;
      }

      archiveLegacyKey(LEGACY_SHIFTS_KEY, LEGACY_SHIFTS_KEY + LEGACY_BACKUP_SUFFIX);
      archiveLegacyKey(LEGACY_DRIVERS_KEY, LEGACY_DRIVERS_KEY + LEGACY_BACKUP_SUFFIX);
      setResult({
        tone: 'success',
        text:
          `Μεταφέρθηκαν ${inserted} βάρδιες` +
          (createdDrivers ? ` και ${createdDrivers} οδηγοί` : '') +
          (plan.shifts.length > inserted ? ` (${plan.shifts.length - inserted} υπήρχαν ήδη)` : '') +
          (plan.skipped ? `. ${plan.skipped} άκυρες εγγραφές παραλείφθηκαν` : '') +
          '. Ο ΦΠΑ υπολογίστηκε ξανά από τη βάση. Αντίγραφο των παλιών δεδομένων παραμένει στη συσκευή.',
      });
      onImported();
    } catch (error) {
      setResult({ tone: 'error', text: dataErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Notice tone={result.tone}>
        <div className="flex items-start justify-between gap-3">
          <span>{result.text}</span>
          <button type="button" className="font-semibold" onClick={() => setResult(null)} aria-label="Κλείσιμο">
            ✕
          </button>
        </div>
      </Notice>
    );
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-info-soft p-4">
      <p className="text-sm">
        Βρέθηκαν <b>{count}</b> βάρδιες από την παλιά τοπική (offline) έκδοση σε αυτή τη συσκευή.
      </p>
      <Button variant="primary" onClick={runImport} disabled={busy}>
        {busy ? 'Μεταφορά…' : 'Μεταφορά στο Supabase'}
      </Button>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { Panel } from '@/components/Panel';
import { Button, Field, Input, Notice } from '@/components/ui';
import { toCents } from '@/lib/accounting';
import { updateFixedCosts } from '@/lib/data';
import { dataErrorMessage } from '@/lib/errors';
import {
  EMPTY_FIXED_COSTS_FORM,
  FIXED_COST_FIELDS,
  FIXED_COSTS_NOTE,
  fixedCostsSummary,
  fixedCostsToFormValues,
  fixedCostsTotalCents,
  hasFixedCosts,
  parseFixedCosts,
  type FixedCostsErrors,
  type FixedCostsFormValues,
} from '@/lib/fixed-costs';
import { formatEuro } from '@/lib/format';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow } from '@/lib/types';

type Message = { tone: 'success' | 'error'; text: string };

/** «150,00 € τον μήνα», ή «—» όταν δεν έχει δηλωθεί. */
function monthly(value: number | null): string {
  return value === null ? '—' : `${formatEuro(toCents(Number(value)))} τον μήνα`;
}

/**
 * Πάγια έξοδα: κόστος άδειας και Ταμείο / ΕΦΚΑ / ΙΚΑ, σταθερά μηνιαία ποσά
 * για κάθε αυτοκίνητο χωριστά (μόνο ο ιδιοκτήτης — το RLS δεν αφήνει τον
 * οδηγό να τα αλλάξει). Μπαίνουν μία φορά και αλλάζουν όποτε χρειαστεί.
 *
 * Μόνο φαίνονται: δεν αγγίζουν ταμείο, έξοδα, κέρδος ή ΦΠΑ.
 */
export function FixedCostsPanel({
  supabase,
  drivers,
  loaded,
  onChanged,
}: {
  supabase: BrowserSupabase;
  drivers: DriverRow[];
  loaded: boolean;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FixedCostsFormValues>(EMPTY_FIXED_COSTS_FORM);
  const [errors, setErrors] = useState<FixedCostsErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  function startEdit(driver: DriverRow) {
    setEditingId(driver.id);
    setForm(fixedCostsToFormValues(driver));
    setErrors({});
    setMessage(null);
  }

  async function handleSave(driver: DriverRow) {
    const parsed = parseFixedCosts(form);
    setErrors(parsed.errors);
    if (!parsed.values) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateFixedCosts(supabase, driver.id, parsed.values);
      setMessage({ tone: 'success', text: `Τα πάγια του «${driver.name}» αποθηκεύτηκαν.` });
      setEditingId(null);
      onChanged();
    } catch (error) {
      setMessage({ tone: 'error', text: dataErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      id="fixed-costs"
      title="Πάγια έξοδα"
      summary={loaded ? fixedCostsSummary(drivers.filter(hasFixedCosts).length, drivers.length) : 'Φόρτωση…'}
    >
      <p className="mb-3 text-sm text-muted">{FIXED_COSTS_NOTE}</p>

      {message && (
        <Notice tone={message.tone} className="mb-3">
          {message.text}
        </Notice>
      )}

      <ul className="divide-y divide-line">
        {!loaded && <li className="py-4 text-sm text-muted">Φόρτωση…</li>}
        {loaded && drivers.length === 0 && (
          <li className="py-4 text-sm text-muted">Προσθέστε πρώτα αυτοκίνητο στην «Υποδομή Στόλου».</li>
        )}
        {drivers.map((driver) => {
          const total = fixedCostsTotalCents(driver);
          return (
            <li key={driver.id} className="py-3" data-testid="fixed-costs-row">
              <p className="font-semibold">
                {driver.name} {driver.plate && <span className="font-normal text-muted">· {driver.plate}</span>}
              </p>

              {editingId === driver.id ? (
                <div className="mt-2 grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
                  {FIXED_COST_FIELDS.map((field) => (
                    <Field key={field.id} label={`${field.label} (μηνιαίο)`} hint={field.hint} error={errors[field.id]}>
                      <Input
                        inputMode="decimal"
                        value={form[field.id]}
                        placeholder="π.χ. 150"
                        onChange={(e) => setForm({ ...form, [field.id]: e.target.value })}
                        autoComplete="off"
                      />
                    </Field>
                  ))}
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Button variant="primary" onClick={() => handleSave(driver)} disabled={busy}>
                      Αποθήκευση
                    </Button>
                    <Button onClick={() => setEditingId(null)} disabled={busy}>
                      Άκυρο
                    </Button>
                  </div>
                  <p className="text-xs text-muted sm:col-span-2">Κενό πεδίο = δεν δηλώνεται ποσό.</p>
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    {hasFixedCosts(driver) ? (
                      <>
                        {FIXED_COST_FIELDS.map((field) => (
                          <p key={field.id} className="text-muted">
                            {field.label}: <span className="font-medium text-fg">{monthly(driver[field.column])}</span>
                          </p>
                        ))}
                        {total !== null && (
                          <p className="mt-0.5 text-muted">
                            Σύνολο: <span className="font-semibold text-fg">{formatEuro(total)} τον μήνα</span>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted">Δεν έχουν μπει ακόμη.</p>
                    )}
                  </div>
                  <Button className="min-h-9 px-3 py-1" onClick={() => startEdit(driver)} disabled={busy}>
                    {hasFixedCosts(driver) ? 'Αλλαγή' : 'Συμπλήρωση'}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

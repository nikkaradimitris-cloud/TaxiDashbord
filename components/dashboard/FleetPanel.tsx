'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Panel, usePanelOpen } from '@/components/Panel';
import { Badge, Button, Field, Input, Notice, Select } from '@/components/ui';
import { createDriver, deleteDriver, updateDriver, type DriverInput } from '@/lib/data';
import { dataErrorMessage } from '@/lib/errors';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow } from '@/lib/types';
import { FUELS, fuelLabel, isFuel } from '@/lib/utilization';
import { toWhatsAppNumber, whatsappLink } from '@/lib/whatsapp';

type Message = { tone: 'success' | 'error'; text: string };

const EMPTY: DriverInput = { name: '', plate: '', phone: '', email: '', fuel: '' };

/** Καύσιμο του αυτοκινήτου (για τα όρια του μετρητή αξιοποίησης). */
function FuelSelect({ value, onChange }: { value: DriverInput['fuel']; onChange: (fuel: DriverInput['fuel']) => void }) {
  return (
    <Field label="Καύσιμο">
      <Select value={value} onChange={(e) => onChange(isFuel(e.target.value) ? e.target.value : '')}>
        <option value="">—</option>
        {FUELS.map((fuel) => (
          <option key={fuel.id} value={fuel.id}>
            {fuel.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Μετά από νέο email οδηγού: τι γίνεται στη συνέχεια. */
const INVITE_NOTE = ' Μόλις κάνει εγγραφή με αυτό το email, θα δει την πρόσκληση και θα πατήσει «Αποδοχή».';

function validate(input: DriverInput): string | null {
  if (!input.name.trim()) return 'Το όνομα οδηγού είναι υποχρεωτικό.';
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Το email δεν είναι έγκυρο.';
  return null;
}

function phoneWarning(phone: string): string | undefined {
  return phone.trim() && !toWhatsAppNumber(phone) ? 'Δεν μοιάζει με κινητό (69XXXXXXXX) — το WhatsApp δεν θα λειτουργεί.' : undefined;
}

/**
 * Υποδομή στόλου: οδηγοί, πινακίδες, κινητά και email σύνδεσης (μόνο ο ιδιοκτήτης). Ο οδηγός με email
 * βλέπει πρόσκληση όταν συνδεθεί και μπαίνει στον στόλο μόνο αν πατήσει «Αποδοχή». Λογαριασμοί άλλων
 * (π.χ. όσων έκαναν εγγραφή για δικό τους ταξί) δεν φαίνονται εδώ.
 */
export function FleetPanel({
  supabase,
  userId,
  drivers,
  loaded,
  onChanged,
}: {
  supabase: BrowserSupabase;
  userId: string;
  drivers: DriverRow[];
  loaded: boolean;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<DriverInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DriverInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  /** Η φόρμα «νέος οδηγός» ανοίγει με κουμπί (ανοιχτή από την αρχή όταν δεν υπάρχει κανένας οδηγός). */
  const [adding, setAdding] = useState(false);
  const showAddForm = adding || (loaded && drivers.length === 0);
  const newDriverRef = useRef<HTMLButtonElement>(null);
  // Χωρίς οδηγούς το πάνελ ανοίγει μόνο του· μετά τον πρώτο οδηγό μένει ανοιχτό μέχρι να το κλείσει ο χρήστης.
  const [, setPanelOpen] = usePanelOpen('fleet', false);
  const linkedCount = drivers.filter((driver) => driver.user_id).length;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: 'success', text: success });
      onChanged();
      return true;
    } catch (error) {
      setMessage({ tone: 'error', text: dataErrorMessage(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validate(form);
    if (problem) {
      setMessage({ tone: 'error', text: problem });
      return;
    }
    const ok = await run(
      () => createDriver(supabase, form),
      `Ο οδηγός «${form.name.trim()}» προστέθηκε.${form.email.trim() ? INVITE_NOTE : ''}`,
    );
    if (ok) {
      setForm(EMPTY);
      // Η φόρμα μένει ανοιχτή για τον επόμενο οδηγό (και όταν ήταν ο πρώτος).
      setAdding(true);
      setPanelOpen(true);
    }
  }

  async function handleSaveEdit(driver: DriverRow) {
    const problem = validate(editForm);
    if (problem) {
      setMessage({ tone: 'error', text: problem });
      return;
    }
    const newEmail = editForm.email.trim().toLowerCase();
    const ok = await run(
      () => updateDriver(supabase, driver.id, editForm),
      `Τα στοιχεία αποθηκεύτηκαν.${newEmail && newEmail !== driver.email ? INVITE_NOTE : ''}`,
    );
    if (ok) setEditingId(null);
  }

  function startEdit(driver: DriverRow) {
    setEditingId(driver.id);
    setEditForm({
      name: driver.name,
      plate: driver.plate ?? '',
      phone: driver.phone ?? '',
      email: driver.email ?? '',
      fuel: isFuel(driver.fuel) ? driver.fuel : '',
    });
  }

  function handleDelete(driver: DriverRow) {
    if (!confirm(`Οριστική διαγραφή του οδηγού «${driver.name}»;`)) return;
    void run(() => deleteDriver(supabase, driver.id), `Ο οδηγός «${driver.name}» διαγράφηκε.`);
  }

  function handleToggle(driver: DriverRow) {
    void run(
      () => updateDriver(supabase, driver.id, { active: !driver.active }),
      driver.active ? `Ο/Η ${driver.name} απενεργοποιήθηκε.` : `Ο/Η ${driver.name} ενεργοποιήθηκε.`,
    );
  }

  function invite(driver: DriverRow) {
    const text =
      `Γεια σου ${driver.name}! Για να καταχωρείς τις βάρδιές σου, κάνε εγγραφή στο Taxi Fleet Tracker` +
      `${driver.email ? ` με το email ${driver.email} και πάτησε «Αποδοχή» στην πρόσκληση` : ''}:\n` +
      `${window.location.origin}/register`;
    const link = whatsappLink(driver.phone, text);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <Panel
      id="fleet"
      title="Υποδομή Στόλου"
      summary={
        !loaded
          ? 'Φόρτωση…'
          : drivers.length === 0
            ? 'Κανένας οδηγός ακόμη'
            : `${drivers.length === 1 ? '1 οδηγός' : `${drivers.length} οδηγοί`} · ${linkedCount} με λογαριασμό`
      }
      defaultOpen={loaded && drivers.length === 0}
    >
      {showAddForm ? (
        <>
          <p className="mb-3 text-sm text-muted">
            Οι οδηγοί που προσθέτετε εμφανίζονται αυτόματα στα μενού. Αν δηλώσετε email, ο οδηγός κάνει εγγραφή με
            αυτό, πατά «Αποδοχή» στην πρόσκληση και βλέπει/καταχωρεί μόνο τις δικές του βάρδιες.
          </p>
          <form onSubmit={handleAdd} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Όνομα Οδηγού *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="off"
                autoFocus={adding}
              />
            </Field>
            <Field label="Πινακίδα">
              <Input
                value={form.plate}
                placeholder="π.χ. ΤΑΕ-1234"
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <FuelSelect value={form.fuel} onChange={(fuel) => setForm({ ...form, fuel })} />
            <Field label="Κινητό" error={phoneWarning(form.phone)}>
              <Input
                type="tel"
                inputMode="tel"
                value={form.phone}
                placeholder="69XXXXXXXX"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label="Email σύνδεσης" hint="Προαιρετικό">
              <Input
                type="email"
                inputMode="email"
                value={form.email}
                placeholder="odigos@email.gr"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                + Προσθήκη οδηγού
              </Button>
              {drivers.length > 0 && (
                <Button
                  onClick={() => {
                    setAdding(false);
                    requestAnimationFrame(() => newDriverRef.current?.focus());
                  }}
                  disabled={busy}
                >
                  Άκυρο
                </Button>
              )}
            </div>
          </form>
        </>
      ) : (
        <Button ref={newDriverRef} variant="primary" onClick={() => setAdding(true)}>
          + Νέος οδηγός
        </Button>
      )}

      {message && (
        <Notice tone={message.tone} className="mt-3">
          {message.text}
        </Notice>
      )}

      <ul className="mt-4 divide-y divide-line">
        {!loaded && <li className="py-4 text-sm text-muted">Φόρτωση…</li>}
        {loaded && drivers.length === 0 && (
          <li className="py-4 text-sm text-muted">Δεν έχουν καταχωρηθεί οδηγοί ακόμη.</li>
        )}
        {drivers.map((driver) =>
          editingId === driver.id ? (
            <li key={driver.id} className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Όνομα *">
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </Field>
              <Field label="Πινακίδα">
                <Input value={editForm.plate} onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })} />
              </Field>
              <FuelSelect value={editForm.fuel} onChange={(fuel) => setEditForm({ ...editForm, fuel })} />
              <Field label="Κινητό" error={phoneWarning(editForm.phone)}>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </Field>
              <Field label="Email σύνδεσης" hint="Άλλο email = νέα πρόσκληση · κενό = ο οδηγός χάνει την πρόσβαση">
                <Input
                  type="email"
                  inputMode="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button variant="primary" onClick={() => handleSaveEdit(driver)} disabled={busy}>
                  Αποθήκευση
                </Button>
                <Button onClick={() => setEditingId(null)}>Άκυρο</Button>
              </div>
            </li>
          ) : (
            <li key={driver.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {driver.name} {driver.plate && <span className="font-normal text-muted">· {driver.plate}</span>}
                </p>
                <p className="text-sm text-muted">
                  {driver.phone || 'χωρίς κινητό'} · {driver.email || 'χωρίς email σύνδεσης'}
                </p>
                <p className="text-sm text-muted">
                  Καύσιμο: {driver.fuel ? fuelLabel(driver.fuel) : 'δεν έχει δηλωθεί'}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {!driver.active && <Badge tone="bad">Ανενεργός</Badge>}
                  {driver.user_id === userId ? (
                    <Badge tone="good">✓ Ο λογαριασμός σας</Badge>
                  ) : driver.user_id ? (
                    <Badge tone="good">✓ Συνδεδεμένος λογαριασμός</Badge>
                  ) : driver.email ? (
                    <Badge tone="warn">Πρόσκληση: περιμένει εγγραφή και «Αποδοχή»</Badge>
                  ) : (
                    <Badge>Χωρίς λογαριασμό — καταχωρείτε εσείς</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!driver.user_id && driver.phone && toWhatsAppNumber(driver.phone) && (
                  <Button variant="whatsapp" className="min-h-9 px-3 py-1" onClick={() => invite(driver)}>
                    Πρόσκληση
                  </Button>
                )}
                <Button className="min-h-9 px-3 py-1" onClick={() => startEdit(driver)} disabled={busy}>
                  Επεξεργασία
                </Button>
                <Button className="min-h-9 px-3 py-1" onClick={() => handleToggle(driver)} disabled={busy}>
                  {driver.active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
                </Button>
                <Button variant="danger" className="min-h-9 px-3 py-1" onClick={() => handleDelete(driver)} disabled={busy}>
                  Διαγραφή
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
    </Panel>
  );
}

'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Field, Input, Notice, Select } from '@/components/ui';
import { createDriver, deleteDriver, fetchProfiles, updateDriver, type DriverInput } from '@/lib/data';
import { dataErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow, ProfileRow } from '@/lib/types';
import { toWhatsAppNumber, whatsappLink } from '@/lib/whatsapp';

type Message = { tone: 'success' | 'error'; text: string };

const EMPTY: DriverInput = { name: '', plate: '', phone: '', email: '' };

function validate(input: DriverInput): string | null {
  if (!input.name.trim()) return 'Το όνομα οδηγού είναι υποχρεωτικό.';
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Το email δεν είναι έγκυρο.';
  return null;
}

function phoneWarning(phone: string): string | undefined {
  return phone.trim() && !toWhatsAppNumber(phone) ? 'Δεν μοιάζει με κινητό (69XXXXXXXX) — το WhatsApp δεν θα λειτουργεί.' : undefined;
}

/** Υποδομή στόλου: οδηγοί, πινακίδες, κινητά και λογαριασμοί σύνδεσης (μόνο admin). */
export function FleetPanel({
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
  const [form, setForm] = useState<DriverInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DriverInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetchProfiles(supabase).then(
      (rows) => {
        if (!cancelled) setProfiles(rows);
      },
      () => {
        if (!cancelled) setProfiles([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [supabase, drivers]);

  const unlinked = useMemo(() => {
    const linked = new Set(drivers.map((d) => d.user_id).filter(Boolean));
    return (profiles ?? []).filter((p) => p.role !== 'admin' && !linked.has(p.id));
  }, [profiles, drivers]);

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
    const ok = await run(() => createDriver(supabase, form), `Ο οδηγός «${form.name.trim()}» προστέθηκε.`);
    if (ok) setForm(EMPTY);
  }

  async function handleSaveEdit(driver: DriverRow) {
    const problem = validate(editForm);
    if (problem) {
      setMessage({ tone: 'error', text: problem });
      return;
    }
    const ok = await run(() => updateDriver(supabase, driver.id, editForm), 'Τα στοιχεία αποθηκεύτηκαν.');
    if (ok) setEditingId(null);
  }

  function startEdit(driver: DriverRow) {
    setEditingId(driver.id);
    setEditForm({ name: driver.name, plate: driver.plate ?? '', phone: driver.phone ?? '', email: driver.email ?? '' });
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

  function handleAssign(profile: ProfileRow) {
    const driverId = assign[profile.id];
    const driver = drivers.find((d) => d.id === driverId);
    if (!driver || !profile.email) return;
    if (driver.email && driver.email !== profile.email && !confirm(`Αντικατάσταση του email ${driver.email} με ${profile.email};`)) {
      return;
    }
    void run(
      () => updateDriver(supabase, driver.id, { email: profile.email ?? '' }),
      profile.email_confirmed_at
        ? `Ο λογαριασμός ${profile.email} συνδέθηκε με τον/την ${driver.name}.`
        : `Ορίστηκε το email. Η σύνδεση θα ολοκληρωθεί μόλις ο/η ${driver.name} επιβεβαιώσει το email του/της.`,
    );
  }

  function invite(driver: DriverRow) {
    const text =
      `Γεια σου ${driver.name}! Για να καταχωρείς τις βάρδιές σου, κάνε εγγραφή στο Taxi Fleet Tracker` +
      `${driver.email ? ` με το email ${driver.email}` : ''}:\n${window.location.origin}/register`;
    const link = whatsappLink(driver.phone, text);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <Card title="Υποδομή Στόλου" id="fleet">
      <p className="-mt-2 mb-4 text-sm text-muted">
        Οι οδηγοί που προσθέτετε εμφανίζονται αυτόματα στα μενού. Αν δηλώσετε email, ο οδηγός κάνει εγγραφή με αυτό
        και βλέπει/καταχωρεί μόνο τις δικές του βάρδιες.
      </p>

      <form onSubmit={handleAdd} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Όνομα Οδηγού *">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Πινακίδα">
          <Input
            value={form.plate}
            placeholder="π.χ. ΤΑΕ-1234"
            onChange={(e) => setForm({ ...form, plate: e.target.value })}
            autoComplete="off"
          />
        </Field>
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
        <div className="flex items-end">
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            + Προσθήκη οδηγού
          </Button>
        </div>
      </form>

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
            <li key={driver.id} className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Όνομα *">
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </Field>
              <Field label="Πινακίδα">
                <Input value={editForm.plate} onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })} />
              </Field>
              <Field label="Κινητό" error={phoneWarning(editForm.phone)}>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </Field>
              <Field label="Email σύνδεσης" hint="Κενό = ο οδηγός χάνει την πρόσβαση">
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
                <div className="mt-1 flex flex-wrap gap-1">
                  {!driver.active && <Badge tone="bad">Ανενεργός</Badge>}
                  {driver.user_id ? (
                    <Badge tone="good">✓ Συνδεδεμένος λογαριασμός</Badge>
                  ) : driver.email ? (
                    <Badge tone="warn">Αναμονή εγγραφής / επιβεβαίωσης email</Badge>
                  ) : (
                    <Badge>Χωρίς λογαριασμό — καταχωρεί ο admin</Badge>
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

      {unlinked.length > 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-accent-strong p-3">
          <h3 className="font-semibold">Λογαριασμοί χωρίς αντιστοίχιση ({unlinked.length})</h3>
          <p className="mb-3 text-sm text-muted">
            Έκαναν εγγραφή αλλά το email τους δεν ταιριάζει με κανέναν οδηγό. Αντιστοιχίστε τους με ένα κλικ.
          </p>
          <ul className="space-y-3">
            {unlinked.map((profile) => (
              <li key={profile.id} className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{profile.email}</p>
                  <p className="text-xs text-muted">
                    {profile.full_name || '—'} · εγγραφή {formatDateTime(profile.created_at)} ·{' '}
                    {profile.email_confirmed_at ? 'email επιβεβαιωμένο' : 'email ΟΧΙ επιβεβαιωμένο'}
                  </p>
                </div>
                <Select
                  aria-label={`Οδηγός για ${profile.email}`}
                  className="w-auto min-w-48"
                  value={assign[profile.id] ?? ''}
                  onChange={(e) => setAssign({ ...assign, [profile.id]: e.target.value })}
                >
                  <option value="">Επιλογή οδηγού…</option>
                  {drivers
                    .filter((d) => !d.user_id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.plate ? ` · ${d.plate}` : ''}
                      </option>
                    ))}
                </Select>
                <Button onClick={() => handleAssign(profile)} disabled={busy || !assign[profile.id]}>
                  Αντιστοίχιση
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

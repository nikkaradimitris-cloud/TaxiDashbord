'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Logo } from '@/components/Logo';
import { SignOutButton } from '@/components/SignOutButton';
import { TextSizeToggle } from '@/components/TextSizeToggle';
import { Badge, Notice } from '@/components/ui';
import { figuresFromStored, summarize } from '@/lib/accounting';
import { buildShiftsCsv, csvFileName } from '@/lib/csv';
import { deleteShift, fetchDrivers, fetchMonthlySummary, fetchShifts, insertShift } from '@/lib/data';
import { dataErrorMessage, isNetworkError } from '@/lib/errors';
import { periodLabel } from '@/lib/period';
import {
  emptyOutbox,
  getOutbox,
  getPreferences,
  setOutbox,
  subscribeStorage,
  updatePreferences,
  type PendingShift,
  type Preferences,
} from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import type { MonthSummaryRow } from '@/lib/table';
import type { DriverRow, SessionInfo, ShiftRow } from '@/lib/types';
import { AnalysisCard } from './AnalysisCard';
import { EditShiftDialog } from './EditShiftDialog';
import { FleetPanel } from './FleetPanel';
import { LegacyImport } from './LegacyImport';
import { OutboxPanel } from './OutboxPanel';
import { PeriodBar } from './PeriodBar';
import { ShiftForm } from './ShiftForm';
import { ShiftList } from './ShiftList';
import { StatsPanel } from './StatsPanel';

type Message = { tone: 'success' | 'error' | 'info'; text: string };

interface ShiftsState {
  key: string;
  rows: ShiftRow[];
  fetchedAt: number;
  error: string | null;
}

export function Dashboard({ session }: { session: SessionInfo }) {
  const supabase = useMemo(() => createClient(), []);
  const { userId, ownDriver } = session;
  const isAdmin = session.role === 'admin';

  // Μνήμη συσκευής: περίοδος/φίλτρα και ουρά αποστολής (null κατά το server render).
  const prefs = useSyncExternalStore(subscribeStorage, () => getPreferences(userId), () => null);
  const outbox = useSyncExternalStore(subscribeStorage, () => getOutbox(userId), emptyOutbox);
  const setPrefs = useCallback(
    (changes: Partial<Omit<Preferences, 'today'>>) => updatePreferences(userId, changes),
    [userId],
  );

  const [message, setMessage] = useState<Message | null>(null);
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeEdit = useCallback(() => setEditing(null), []);

  /** Σύντομο μήνυμα κάτω στην οθόνη, ορατό όπου κι αν βρίσκεται ο χρήστης. */
  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 4000);
  }

  // ------------------------------------------------------------------
  // Οδηγοί (admin: όλος ο στόλος — οδηγός: μόνο ο εαυτός του)
  // ------------------------------------------------------------------
  const [driversVersion, setDriversVersion] = useState(0);
  const [driversState, setDriversState] = useState<{ rows: DriverRow[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchDrivers(supabase).then(
      (rows) => {
        if (!cancelled) setDriversState({ rows, error: null });
      },
      (error) => {
        if (!cancelled) setDriversState((prev) => ({ rows: prev?.rows ?? [], error: dataErrorMessage(error) }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isAdmin, supabase, driversVersion]);

  const drivers = useMemo<DriverRow[]>(
    () => (isAdmin ? (driversState?.rows ?? []) : ownDriver ? [ownDriver] : []),
    [isAdmin, driversState, ownDriver],
  );
  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  // Φίλτρο οδηγού: μόνο για τον admin και μόνο αν ο οδηγός υπάρχει ακόμη.
  const storedFilter = prefs?.driverFilter ?? 'all';
  const driverFilter =
    isAdmin && storedFilter !== 'all' && (!driversState || driversById.has(storedFilter)) ? storedFilter : 'all';

  // ------------------------------------------------------------------
  // Βάρδιες της επιλεγμένης περιόδου
  // ------------------------------------------------------------------
  const [shiftsVersion, setShiftsVersion] = useState(0);
  const [shiftsState, setShiftsState] = useState<ShiftsState | null>(null);
  const year = prefs?.year;
  const month = prefs?.month;
  const queryKey = year === undefined ? null : `${year}|${month}|${driverFilter}|${shiftsVersion}`;

  useEffect(() => {
    if (year === undefined || month === undefined) return;
    const key = `${year}|${month}|${driverFilter}|${shiftsVersion}`;
    let cancelled = false;
    fetchShifts(supabase, { year, month, driverId: driverFilter === 'all' ? null : driverFilter }).then(
      (rows) => {
        if (!cancelled) setShiftsState({ key, rows, fetchedAt: Date.now(), error: null });
      },
      (error) => {
        // Ποτέ δεδομένα άλλης περιόδου κάτω από τον νέο τίτλο: κενό + μήνυμα σφάλματος.
        if (!cancelled) setShiftsState({ key, rows: [], fetchedAt: Date.now(), error: dataErrorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [supabase, year, month, driverFilter, shiftsVersion]);

  const loading = !shiftsState || shiftsState.key !== queryKey;
  const shifts = useMemo(() => shiftsState?.rows ?? [], [shiftsState]);

  // ------------------------------------------------------------------
  // Σύνολα όλων των μηνών του έτους (πίνακας «Ανά μήνα» με ανοιχτό έναν μήνα).
  // Ξαναφορτώνονται μετά από κάθε καταχώρηση/διόρθωση/διαγραφή.
  // ------------------------------------------------------------------
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [summaryState, setSummaryState] = useState<{
    key: string;
    rows: MonthSummaryRow[];
    error: string | null;
  } | null>(null);
  const needsYearSummary =
    prefs?.statsView === 'table' && prefs.tableGroup === 'months' && prefs.month !== 'all';
  const summaryKey = needsYearSummary ? `${year}|${driverFilter}|${shiftsVersion}|${summaryVersion}` : null;

  useEffect(() => {
    if (summaryKey === null || year === undefined) return;
    let cancelled = false;
    fetchMonthlySummary(supabase, { year, driverId: driverFilter === 'all' ? null : driverFilter }).then(
      (rows) => {
        if (!cancelled) setSummaryState({ key: summaryKey, rows, error: null });
      },
      (error) => {
        if (!cancelled) setSummaryState({ key: summaryKey, rows: [], error: dataErrorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [supabase, summaryKey, year, driverFilter]);

  const yearSummary = summaryKey
    ? {
        rows: summaryState?.rows ?? [],
        loading: summaryState?.key !== summaryKey,
        error: summaryState?.key === summaryKey ? summaryState.error : null,
      }
    : null;
  const items = useMemo(() => shifts.map((row) => ({ row, figures: figuresFromStored(row) })), [shifts]);
  const totals = useMemo(() => summarize(items.map((item) => item.figures)), [items]);

  // ------------------------------------------------------------------
  // Ενέργειες
  // ------------------------------------------------------------------
  const matchesView = (row: ShiftRow) =>
    prefs !== null &&
    row.year === prefs.year &&
    (prefs.month === 'all' || row.month === prefs.month) &&
    (driverFilter === 'all' || row.driver_id === driverFilter);

  function handleSaved(row: ShiftRow) {
    setSummaryVersion((v) => v + 1);
    if (!matchesView(row)) return;
    setShiftsState((prev) =>
      prev && prev.key === queryKey && !prev.rows.some((r) => r.id === row.id)
        ? { ...prev, rows: [row, ...prev.rows] }
        : prev,
    );
  }

  function startEdit(row: ShiftRow) {
    setEditing(row);
    setMessage(null);
  }

  function handleUpdated(row: ShiftRow) {
    setSummaryVersion((v) => v + 1);
    setShiftsState((prev) =>
      prev
        ? {
            ...prev,
            rows: matchesView(row)
              ? prev.rows.map((r) => (r.id === row.id ? row : r))
              : prev.rows.filter((r) => r.id !== row.id),
          }
        : prev,
    );
    setEditing(null);
    showToast(`✓ Αποθηκεύτηκαν οι διορθώσεις στη βάρδια Ζ ${row.z_number}.`);
  }

  function handleQueued(item: PendingShift) {
    setOutbox(userId, [...getOutbox(userId), item]);
  }

  async function handleDelete(row: ShiftRow) {
    const driverName = driversById.get(row.driver_id)?.name ?? '';
    if (!confirm(`Διαγραφή της βάρδιας Ζ ${row.z_number}${driverName ? ` (${driverName})` : ''};`)) return;
    try {
      const deleted = await deleteShift(supabase, row.id);
      if (!deleted) {
        setMessage({
          tone: 'error',
          text: 'Η διαγραφή δεν επιτρέπεται. Οι οδηγοί διορθώνουν/διαγράφουν μόνο δικές τους καταχωρήσεις μέσα σε 24 ώρες — επικοινωνήστε με τον ιδιοκτήτη.',
        });
        return;
      }
      setShiftsState((prev) => (prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== row.id) } : prev));
      setSummaryVersion((v) => v + 1);
      if (editing?.id === row.id) setEditing(null);
      setMessage({ tone: 'success', text: `Η βάρδια Ζ ${row.z_number} διαγράφηκε.` });
    } catch (error) {
      setMessage({ tone: 'error', text: dataErrorMessage(error) });
    }
  }

  /** Αποστολή όσων βαρδιών περιμένουν στην ουρά. */
  const flushOutbox = useCallback(async () => {
    const pending = getOutbox(userId);
    if (pending.length === 0) return;
    const remaining: PendingShift[] = [];
    let sent = 0;
    for (const item of pending) {
      try {
        await insertShift(supabase, item.payload);
        sent++;
      } catch (error) {
        remaining.push(isNetworkError(error) ? item : { ...item, lastError: dataErrorMessage(error) });
      }
    }
    // Κρατάμε και όσες μπήκαν στην ουρά όσο γινόταν η αποστολή.
    const addedMeanwhile = getOutbox(userId).filter((item) => !pending.some((p) => p.payload.id === item.payload.id));
    setOutbox(userId, [...remaining, ...addedMeanwhile]);
    if (sent > 0) {
      setShiftsVersion((v) => v + 1);
      setMessage({ tone: 'success', text: `Στάλθηκαν ${sent} βάρδιες που περίμεναν στη συσκευή.` });
    }
  }, [supabase, userId]);

  useEffect(() => {
    window.addEventListener('online', flushOutbox);
    return () => window.removeEventListener('online', flushOutbox);
  }, [flushOutbox]);

  useEffect(() => {
    if (getOutbox(userId).length === 0) return;
    const timer = window.setTimeout(flushOutbox, 1500);
    return () => window.clearTimeout(timer);
  }, [flushOutbox, userId]);

  function exportCsv() {
    if (!prefs) return;
    const selected = driverFilter === 'all' ? null : driversById.get(driverFilter);
    const csv = buildShiftsCsv(
      items.map(({ row, figures }) => {
        const driver = driversById.get(row.driver_id);
        return {
          year: row.year,
          month: row.month,
          driverName: driver?.name ?? '—',
          plate: driver?.plate ?? null,
          zNumber: row.z_number,
          createdAt: row.created_at,
          figures,
        };
      }),
      totals,
      {
        period: periodLabel(prefs.year, prefs.month),
        driverLabel: isAdmin ? (selected?.name ?? 'Όλοι οι οδηγοί') : (ownDriver?.name ?? ''),
      },
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFileName(prefs.year, prefs.month);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const selectedDriver = driverFilter === 'all' ? null : (driversById.get(driverFilter) ?? null);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Logo className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-bold leading-tight">Taxi Fleet Tracker</p>
              <p className="truncate text-xs text-muted">
                {isAdmin ? 'Διαχειριστής' : `${ownDriver?.name ?? ''}${ownDriver?.plate ? ` · ${ownDriver.plate}` : ''}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sm text-muted lg:inline">{session.email}</span>
            {/* Στο κινητό ο ρόλος φαίνεται ήδη κάτω από τον τίτλο. */}
            <span className="hidden sm:inline-flex">
              <Badge tone={isAdmin ? 'accent' : 'neutral'}>{isAdmin ? 'Admin' : 'Οδηγός'}</Badge>
            </span>
            <TextSizeToggle />
            <SignOutButton className="px-3" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-3 pb-16 pt-4 sm:px-6">
        {!prefs ? (
          <p className="py-20 text-center text-muted">Φόρτωση…</p>
        ) : (
          <>
            <PeriodBar
              prefs={prefs}
              isAdmin={isAdmin}
              drivers={drivers}
              driverFilter={driverFilter}
              onChange={setPrefs}
              onExport={exportCsv}
              canExport={!loading && shifts.length > 0}
            />

            {isAdmin && (
              <LegacyImport
                supabase={supabase}
                drivers={drivers}
                onImported={() => {
                  setDriversVersion((v) => v + 1);
                  setShiftsVersion((v) => v + 1);
                }}
              />
            )}

            <OutboxPanel
              items={outbox}
              onSend={flushOutbox}
              onDiscard={(id) => setOutbox(userId, getOutbox(userId).filter((item) => item.payload.id !== id))}
            />

            {message && (
              <Notice tone={message.tone}>
                <div className="flex items-start justify-between gap-3">
                  <span>{message.text}</span>
                  <button type="button" className="font-semibold" onClick={() => setMessage(null)} aria-label="Κλείσιμο">
                    ✕
                  </button>
                </div>
              </Notice>
            )}
            {shiftsState?.error && !loading && (
              <Notice tone="error">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Οι βάρδιες δεν φορτώθηκαν. {shiftsState.error}</span>
                  <button type="button" className="font-semibold underline" onClick={() => setShiftsVersion((v) => v + 1)}>
                    Δοκιμή ξανά
                  </button>
                </div>
              </Notice>
            )}
            {driversState?.error && <Notice tone="error">{driversState.error}</Notice>}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start">
              <ShiftForm
                supabase={supabase}
                isAdmin={isAdmin}
                drivers={drivers}
                driversLoaded={!isAdmin || driversState !== null}
                prefs={prefs}
                driverFilter={driverFilter}
                onPrefsChange={setPrefs}
                onSaved={handleSaved}
                onQueued={handleQueued}
                editing={null}
                onUpdated={handleUpdated}
                onCancelEdit={closeEdit}
              />
              <StatsPanel
                totals={totals}
                loading={loading}
                isAdmin={isAdmin}
                year={prefs.year}
                month={prefs.month}
                selectedDriver={selectedDriver}
                items={items}
                driversById={driversById}
                showPerDriver={isAdmin && driverFilter === 'all'}
                onSelectDriver={(id) => setPrefs({ driverFilter: id })}
                analysis={
                  <AnalysisCard
                    items={items}
                    driversById={driversById}
                    isAdmin={isAdmin}
                    selectedDriver={selectedDriver}
                    year={prefs.year}
                    month={prefs.month}
                    view={prefs.statsView}
                    onViewChange={(statsView) => setPrefs({ statsView })}
                    tableGroup={prefs.tableGroup}
                    onTableGroupChange={(tableGroup) => setPrefs({ tableGroup })}
                    chartMetric={prefs.chartMetric}
                    onChartMetricChange={(chartMetric) => setPrefs({ chartMetric })}
                    yearSummary={yearSummary}
                    onSelectMonth={(month) => setPrefs({ month, tableGroup: 'shifts' })}
                  />
                }
              />
            </div>

            <ShiftList
              items={items}
              loading={loading}
              driversById={driversById}
              isAdmin={isAdmin}
              userId={userId}
              fetchedAt={shiftsState?.fetchedAt ?? 0}
              periodText={periodLabel(prefs.year, prefs.month)}
              editingId={editing?.id ?? null}
              onEdit={startEdit}
              onDelete={handleDelete}
            />

            {editing && (
              <EditShiftDialog onClose={closeEdit}>
                <ShiftForm
                  key={editing.id}
                  supabase={supabase}
                  isAdmin={isAdmin}
                  drivers={drivers}
                  driversLoaded={!isAdmin || driversState !== null}
                  prefs={prefs}
                  driverFilter={driverFilter}
                  onPrefsChange={setPrefs}
                  onSaved={handleSaved}
                  onQueued={handleQueued}
                  editing={editing}
                  onUpdated={handleUpdated}
                  onCancelEdit={closeEdit}
                />
              </EditShiftDialog>
            )}

            {isAdmin && (
              <FleetPanel
                supabase={supabase}
                drivers={drivers}
                loaded={driversState !== null}
                onChanged={() => setDriversVersion((v) => v + 1)}
              />
            )}
          </>
        )}
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 mx-auto max-w-md">
          <Notice tone="success" className="pointer-events-auto shadow-lg">
            {toast}
          </Notice>
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge, Button, Notice } from '@/components/ui';
import {
  BACKUP_REMINDER_DAYS,
  BACKUP_TABLES,
  backupFileName,
  backupSheets,
  backupSummary,
  buildBackup,
  isBackupDue,
  type BackupTable,
} from '@/lib/backup';
import { fetchBackupTable } from '@/lib/data';
import { saveFile } from '@/lib/download';
import { dataErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import type { BrowserSupabase } from '@/lib/supabase/client';
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx';

type Origin = 'reminder' | 'panel';
type Message = { tone: 'success' | 'warning' | 'error'; text: string; origin: Origin };

/**
 * Αντίγραφο ασφαλείας (μόνο ο ιδιοκτήτης): κατεβάζει όλους τους πίνακες σε ένα αρχείο Excel.
 * Η ημερομηνία του τελευταίου αντιγράφου μένει στον λογαριασμό (user metadata), ώστε η
 * υπενθύμιση να ισχύει σε κινητό και υπολογιστή, χωρίς αλλαγή στη βάση.
 */
export function useBackup(supabase: BrowserSupabase, email: string, enabled: boolean) {
  const [last, setLast] = useState<{ at: string | null; due: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const value: unknown = data.user?.user_metadata?.last_backup_at;
      const at = typeof value === 'string' ? value : null;
      setLast({ at, due: isBackupDue(at, new Date()) });
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, enabled]);

  const run = useCallback(
    async (origin: Origin) => {
      setBusy(true);
      setMessage(null);
      try {
        const entries = await Promise.all(
          BACKUP_TABLES.map(async (table) => [table, await fetchBackupTable(supabase, table)] as const),
        );
        const tables = {} as Record<BackupTable, unknown[]>;
        for (const [table, rows] of entries) tables[table] = rows;
        const now = new Date();
        const file = buildBackup(tables, email, now);
        const name = backupFileName(now);
        saveFile(buildXlsx(backupSheets(file)), XLSX_MIME, name);
        setLast({ at: file.createdAt, due: false });
        const { error } = await supabase.auth.updateUser({ data: { last_backup_at: file.createdAt } });
        setMessage(
          error
            ? {
                tone: 'warning',
                text: `Το ${name} κατέβηκε, αλλά η ημερομηνία του αντιγράφου δεν αποθηκεύτηκε: η υπενθύμιση μπορεί να ξαναφανεί.`,
                origin,
              }
            : { tone: 'success', text: `✓ Κατέβηκε το ${name}: ${backupSummary(file.counts)}.`, origin },
        );
      } catch (error) {
        setMessage({ tone: 'error', text: `Το αντίγραφο δεν έγινε. ${dataErrorMessage(error)}`, origin });
      } finally {
        setBusy(false);
      }
    },
    [supabase, email],
  );

  return { loaded: last !== null, lastBackupAt: last?.at ?? null, due: last?.due ?? false, busy, message, run };
}

export type BackupState = ReturnType<typeof useBackup>;

/** Υπενθύμιση πάνω στη σελίδα όταν δεν έχει γίνει αντίγραφο τον τελευταίο μήνα. */
export function BackupReminder({ backup, hasData }: { backup: BackupState; hasData: boolean }) {
  const { loaded, due, lastBackupAt, busy, message, run } = backup;
  if (message?.origin === 'reminder') {
    return <Notice tone={message.tone}>{message.text}</Notice>;
  }
  if (!loaded || !due || !hasData) return null;
  return (
    <Notice tone="warning">
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="backup-reminder">
        <span>
          {lastBackupAt
            ? `Έχει περάσει πάνω από μήνας από το τελευταίο αντίγραφο ασφαλείας (${formatDate(lastBackupAt)}).`
            : 'Δεν έχετε κρατήσει ακόμα αντίγραφο ασφαλείας των στοιχείων.'}
        </span>
        <Button variant="primary" onClick={() => run('reminder')} disabled={busy}>
          {busy ? 'Ετοιμάζεται…' : 'Κατέβασμα τώρα'}
        </Button>
      </div>
    </Notice>
  );
}

export function BackupPanel({ backup }: { backup: BackupState }) {
  const { loaded, due, lastBackupAt, busy, message, run } = backup;
  return (
    <Panel
      id="backup"
      title="Αντίγραφο ασφαλείας"
      summary={!loaded ? 'Φόρτωση…' : lastBackupAt ? `Τελευταίο: ${formatDate(lastBackupAt)}` : 'Δεν έχει γίνει ακόμα'}
      badge={loaded && due ? <Badge tone="warn">χρειάζεται</Badge> : null}
    >
      <div className="space-y-3 text-sm">
        <p>
          <b>Τελευταίο αντίγραφο:</b> {!loaded ? '…' : lastBackupAt ? formatDate(lastBackupAt) : 'δεν έχει γίνει ακόμα'}
        </p>
        <p>
          Κατεβάζει όλα τα στοιχεία της εφαρμογής σε ένα αρχείο Excel, με μία καρτέλα για κάθε είδος: βάρδιες,
          έξοδα οχήματος, εφαρμογές, ποσοστά, οδηγοί. Ανοίγει στο κινητό (Excel ή Google Sheets). Κρατήστε το σε ασφαλές
          μέρος, π.χ. στείλτε το με email στον εαυτό σας ή βάλτε το στο Google Drive. Αν χρειαστεί ποτέ, από αυτό
          ξαναμπαίνουν όλα τα στοιχεία.
        </p>
        <p className="text-muted">
          Καλό είναι να γίνεται μία φορά τον μήνα· μετά από {BACKUP_REMINDER_DAYS} μέρες η εφαρμογή το θυμίζει. Το
          αρχείο έχει τα στοιχεία των οδηγών: μην το στέλνετε σε άλλους.
        </p>
        <Button variant="primary" onClick={() => run('panel')} disabled={busy}>
          {busy ? 'Ετοιμάζεται…' : 'Κατέβασμα αντιγράφου'}
        </Button>
        {message?.origin === 'panel' && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>
    </Panel>
  );
}

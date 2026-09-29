'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button, Notice } from '@/components/ui';
import { dismissInstall, getInstallDismissed, subscribeStorage } from '@/lib/storage';
import { getInstallState, getServerInstallState, promptInstall, subscribeInstall } from './install';

export const INSTALL_TEXT = 'Βάλτε την εφαρμογή στην αρχική οθόνη: ανοίγει με ένα πάτημα, σε πλήρη οθόνη.';
export const IOS_STEPS =
  'Στο iPhone: πατήστε το κουμπί «Κοινοποίηση» (το τετράγωνο με το βέλος) και μετά «Προσθήκη στην οθόνη Αφετηρίας».';

export function useInstallState() {
  return useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
}

/** Στην κεντρική σελίδα: μία φορά, μέχρι να εγκατασταθεί ή να πατηθεί «Όχι τώρα». */
export function InstallNotice() {
  const state = useInstallState();
  const dismissed = useSyncExternalStore(subscribeStorage, getInstallDismissed, () => true);
  const [busy, setBusy] = useState(false);
  if (dismissed || (state !== 'available' && state !== 'ios')) return null;

  async function install() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Notice tone="info">
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="install-notice">
        <span>{state === 'ios' ? IOS_STEPS : INSTALL_TEXT}</span>
        <span className="flex shrink-0 gap-2">
          {state === 'available' && (
            <Button variant="primary" onClick={install} disabled={busy}>
              Εγκατάσταση
            </Button>
          )}
          <Button variant="ghost" onClick={dismissInstall}>
            {state === 'ios' ? 'Εντάξει' : 'Όχι τώρα'}
          </Button>
        </span>
      </div>
    </Notice>
  );
}

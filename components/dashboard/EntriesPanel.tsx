'use client';

import { type ReactNode } from 'react';
import { Panel } from '@/components/Panel';
import { Badge, choiceStyles, cx } from '@/components/ui';
import type { EntriesTab } from '@/lib/storage';

export interface EntriesTabInfo {
  id: EntriesTab;
  label: string;
  count: number;
  /** Σήμανση που φαίνεται και με κλειστό πάνελ, π.χ. «λείπει 1 Ζ». */
  warning?: string | null;
  body: ReactNode;
}

/**
 * Ένα πάνελ για όλες τις καταχωρήσεις της περιόδου: καρτέλες Βάρδιες | Έξοδα | Εφαρμογές (όπως ο
 * διακόπτης της φόρμας), αντί για τρία πάνελ το ένα κάτω από το άλλο. Η καρτέλα μένει στη συσκευή.
 */
export function EntriesPanel({
  periodText,
  loading,
  tabs,
  active,
  onChange,
}: {
  periodText: string;
  loading: boolean;
  tabs: readonly EntriesTabInfo[];
  active: EntriesTab;
  onChange: (tab: EntriesTab) => void;
}) {
  const warnings = tabs.flatMap((tab) => (tab.warning ? [tab.warning] : []));
  return (
    <Panel
      id="entries"
      title={`Καταχωρήσεις · ${periodText}`}
      summary={loading ? 'Φόρτωση…' : tabs.map((tab) => `${tab.label} ${tab.count}`).join(' · ')}
      badge={
        warnings.length > 0 ? (
          <span className="flex flex-wrap justify-end gap-1">
            {warnings.map((warning) => (
              <Badge key={warning} tone="warn">
                {warning}
              </Badge>
            ))}
          </span>
        ) : null
      }
    >
      <div
        role="tablist"
        aria-label="Καταχωρήσεις"
        className="mb-3 grid grid-cols-[repeat(3,minmax(min-content,1fr))] gap-1 rounded-xl bg-bg p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${tab.id}-tab`}
            aria-selected={tab.id === active}
            aria-controls={tab.id}
            onClick={() => onChange(tab.id)}
            className={cx(
              'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-sm leading-tight transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
              tab.id === active ? choiceStyles.on : choiceStyles.off,
            )}
          >
            {tab.label}
            <span className="tabular-nums opacity-80">{tab.count}</span>
            {tab.warning && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" aria-label={tab.warning} />}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={tab.id} role="tabpanel" aria-labelledby={`${tab.id}-tab`} hidden={tab.id !== active}>
          {tab.body}
        </div>
      ))}
    </Panel>
  );
}

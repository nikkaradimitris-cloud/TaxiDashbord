'use client';

import { Button } from '@/components/ui';
import { buildShareMessage, whatsappShareLink } from '@/lib/whatsapp';

/**
 * «Στείλτε την εφαρμογή σε φίλο»: WhatsApp με έτοιμο μήνυμα· ο σύνδεσμος δείχνει την εικόνα προεπισκόπησης
 * και ανοίγει κατευθείαν την εγγραφή (μετά ο φίλος πατά «Έχω δικό μου ταξί»).
 */
export function ShareApp() {
  function share() {
    const link = whatsappShareLink(buildShareMessage(`${window.location.origin}/register`));
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="flex flex-col items-center gap-1 pt-2 text-center">
      <Button variant="whatsapp" onClick={share}>
        Στείλτε την εφαρμογή σε φίλο
      </Button>
      <p className="text-xs text-muted">Ανοίγει το WhatsApp με έτοιμο μήνυμα και εικόνα.</p>
    </div>
  );
}

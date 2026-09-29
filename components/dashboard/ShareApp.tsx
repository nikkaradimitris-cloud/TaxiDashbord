'use client';

import { Button } from '@/components/ui';
import { buildShareMessage, whatsappShareLink } from '@/lib/whatsapp';

/** «Στείλτε την εφαρμογή σε φίλο»: WhatsApp με έτοιμο μήνυμα· ο σύνδεσμος δείχνει την εικόνα προεπισκόπησης. */
export function ShareApp() {
  function share() {
    window.open(whatsappShareLink(buildShareMessage(window.location.origin)), '_blank', 'noopener,noreferrer');
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

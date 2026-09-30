import type { VatCardData } from '@/lib/whatsapp';

/**
 * Εικόνα ΦΠΑ για το WhatsApp (1080×1080 PNG): το ίδιο σκούρο, κρυστάλλινο στυλ με το «Καλώς ήρθατε»,
 * μόνο με τον ΦΠΑ της περιόδου. Σχεδιάζεται στον browser (canvas), με τις γραμματοσειρές του κινητού.
 */
const SIZE = 1080;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif';
const TEXT = '#f8fafc';
const MUTED = '#cbd5e1';
const STATUS_COLOR = { debit: '#f87171', credit: '#34d399', zero: '#f8fafc' } as const;

/** Το λογότυπο της εφαρμογής (components/Logo.tsx) ως εικόνα. */
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#facc15"/>' +
  '<g transform="translate(0 3.25)"><rect x="25" y="11" width="14" height="7" rx="2" fill="#111827"/>' +
  '<rect x="28" y="13.4" width="8" height="2.2" rx="1.1" fill="#fde68a"/>' +
  '<path d="M12 44V35l5-11a6 6 0 0 1 5.5-3.6h19A6 6 0 0 1 47 24l5 11v9a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 44 44v-1.5H20V44a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 12 44z" fill="#111827"/>' +
  '<path d="M19.5 33l3-7.4a2.5 2.5 0 0 1 2.3-1.6h14.4a2.5 2.5 0 0 1 2.3 1.6l3 7.4z" fill="#fef08a"/>' +
  '<circle cx="20" cy="38" r="3" fill="#fef9c3"/><circle cx="44" cy="38" r="3" fill="#fef9c3"/>' +
  '<rect x="27" y="37" width="10" height="2" rx="1" fill="#374151"/></g></svg>';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Η εικόνα δεν φόρτωσε.'));
    image.src = src;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Κείμενο που χωράει στο πλάτος: μικραίνει ως το `min` και μετά κόβεται με «…». */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight: number,
  min = Math.round(size * 0.6),
): string {
  let current = size;
  ctx.font = `${weight} ${current}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && current > min) {
    current -= 2;
    ctx.font = `${weight} ${current}px ${FONT}`;
  }
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (const [x, y, r, color] of [
    [SIZE * 0.5, SIZE * 0.22, SIZE * 0.75, '#1c2b58'],
    [SIZE * 0.5, SIZE * 1.1, SIZE * 0.65, '#0d3b4a'],
  ] as const) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(11, 16, 32, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  // Κουκκίδες σαν ψηφιακός χάρτης, πιο αχνές προς τις άκρες.
  for (let x = 15; x < SIZE; x += 30) {
    for (let y = 15; y < SIZE; y += 30) {
      const fade = 1 - Math.hypot(x - SIZE / 2, y - SIZE * 0.45) / (SIZE * 0.62);
      if (fade <= 0) continue;
      ctx.fillStyle = `rgba(148, 163, 184, ${(0.22 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Σχεδιάζει την κάρτα ΦΠΑ και επιστρέφει PNG. */
export async function renderVatImage(card: VatCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Ο browser δεν σχεδιάζει εικόνες.');

  drawBackground(ctx);

  // Κεφαλίδα: λογότυπο και όνομα της εφαρμογής.
  const logo = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`);
  ctx.drawImage(logo, 96, 72, 76, 76);
  ctx.fillStyle = TEXT;
  ctx.textBaseline = 'middle';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('Taxi Fleet Tracker', 194, 112);

  // Κρυστάλλινη κάρτα.
  const x = 96;
  const y = 196;
  const w = SIZE - 2 * x;
  const h = 700;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  roundedRect(ctx, x, y, w, h, 48);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, x, y, w, h, 48);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const left = x + 64;
  const right = x + w - 64;
  const inner = right - left;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText('Προς Απόδοση ΦΠΑ', left, y + 96);
  ctx.fillStyle = TEXT;
  ctx.fillText(fitText(ctx, card.period, inner, 58, 800), left, y + 168);
  ctx.fillStyle = MUTED;
  ctx.fillText(fitText(ctx, card.car, inner, 36, 500), left, y + 222);

  const line = (at: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, at);
    ctx.lineTo(right, at);
    ctx.stroke();
  };
  line(y + 262);
  for (const [label, value, at] of [
    ['ΦΠΑ εσόδων 13%', card.vatIn, y + 330],
    ['ΦΠΑ εξόδων 24%', card.vatOut, y + 392],
  ] as const) {
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = `500 36px ${FONT}`;
    ctx.fillText(label, left, at);
    ctx.textAlign = 'right';
    ctx.fillStyle = TEXT;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(value, right, at);
  }
  line(y + 432);

  // Το ποσό, μεγάλο, στο χρώμα της κατάστασης, και η κατάσταση σε «χάπι».
  const color = STATUS_COLOR[card.status];
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(fitText(ctx, card.amount, inner, 150, 800), SIZE / 2, y + 584);
  ctx.font = `700 36px ${FONT}`;
  const pillWidth = Math.min(inner, ctx.measureText(card.statusText).width + 72);
  roundedRect(ctx, SIZE / 2 - pillWidth / 2, y + 616, pillWidth, 60, 30);
  ctx.fillStyle = card.status === 'zero' ? 'rgba(255, 255, 255, 0.08)' : `${color}26`;
  ctx.fill();
  ctx.strokeStyle = card.status === 'zero' ? 'rgba(255, 255, 255, 0.3)' : `${color}b3`;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(card.statusText, SIZE / 2, y + 647);

  // Υποσημείωση: ενδεικτικός υπολογισμός.
  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(fitText(ctx, card.note, SIZE - 2 * x, 30, 500), SIZE / 2, 972);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Η εικόνα δεν έγινε.'))), 'image/png');
  });
}

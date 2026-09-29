// Εικονίδια της εφαρμογής για την αρχική οθόνη του κινητού, από τα SVG (sharp: έρχεται με το Next.js).
//   node scripts/icons.mjs
import sharp from 'sharp';

const ICONS = [
  // [πηγή, αρχείο, μέγεθος]
  ['app/icon.svg', 'public/icons/icon-192.png', 192],
  ['app/icon.svg', 'public/icons/icon-512.png', 512],
  // Android: το σχήμα (κύκλος, στρογγυλεμένο τετράγωνο) το κόβει το κινητό.
  ['public/icons/maskable.svg', 'public/icons/maskable-512.png', 512],
  // iPhone: γεμάτο τετράγωνο χωρίς διαφάνεια· τις γωνίες τις στρογγυλεύει το iPhone.
  ['public/icons/maskable.svg', 'app/apple-icon.png', 180],
];

for (const [source, target, size] of ICONS) {
  // Τα SVG έχουν viewBox 64: ζωγραφίζονται απευθείας στο τελικό μέγεθος, όχι μεγέθυνση.
  await sharp(source, { density: (72 * size) / 64 })
    .resize(size, size)
    .flatten(target.includes('apple') ? { background: '#facc15' } : false)
    .png({ compressionLevel: 9 })
    .toFile(target);
  console.log(`${target} (${size}×${size})`);
}

// Εικόνα προεπισκόπησης όταν στέλνεται ο σύνδεσμος της εφαρμογής (WhatsApp κ.λπ.), 1200×630.
await sharp('scripts/share-image.svg').png({ compressionLevel: 9 }).toFile('app/opengraph-image.png');
console.log('app/opengraph-image.png (1200×630)');

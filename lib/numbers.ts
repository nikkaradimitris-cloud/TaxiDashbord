/**
 * Ανάγνωση αριθμών όπως τους πληκτρολογεί ο χρήστης στο κινητό.
 *
 * Δέχεται ελληνικό κόμμα ("12,5"), τελεία ("12.5") και ελληνική μορφή με
 * διαχωριστικό χιλιάδων ("1.234,56"). Επιστρέφει `null` όταν η τιμή δεν είναι
 * έγκυρος μη-αρνητικός αριθμός, ώστε η φόρμα να δείξει σφάλμα αντί να
 * αποθηκεύσει λάθος ποσό.
 */
export function parseDecimal(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let value = String(raw).replace(/[\s €]/g, '');
  if (value === '') return null;

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Και τα δύο υπάρχουν: το τελευταίο είναι η υποδιαστολή, το άλλο χιλιάδες.
    if (lastComma > lastDot) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    if (value.indexOf(',') !== lastComma) return null; // π.χ. "1,2,3"
    value = value.replace(',', '.');
  } else if (lastDot !== -1 && value.indexOf('.') !== lastDot) {
    // Πολλές τελείες ("1.234.567") = διαχωριστικά χιλιάδων.
    value = value.replace(/\./g, '');
  }

  if (!/^(\d+\.?\d*|\.\d+)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Όπως η `parseDecimal`, αλλά το κενό πεδίο μετράει ως 0. */
export function parseOptionalDecimal(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return 0;
  return parseDecimal(raw);
}

/** Ακέραιος μη-αρνητικός (π.χ. αριθμός διαδρομών). Κενό = 0. */
export function parseOptionalInteger(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return 0;
  const value = String(raw).trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

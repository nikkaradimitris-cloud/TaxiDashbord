// End-to-end έλεγχος του Taxi Fleet Tracker πάνω σε ΤΟΠΙΚΟ Supabase (Docker), ποτέ στην κανονική βάση.
// Τρέχει με `bash e2e/run.sh` (βάση, build, server, έλεγχοι). Εικόνες στο e2e/shots/.
//
// Ο browser έχει σταθερή ημερομηνία (28/09/2026, Δευτέρα): οι έλεγχοι περιμένουν «Σεπτέμβριος 2026»,
// τις εβδομάδες του Σεπτεμβρίου κ.λπ., οπότε περνούν όποια μέρα κι αν τρέξουν.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const nbsp0 = (text) => text.replace(/\u00a0/g, ' ');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const OUT = path.resolve(process.argv[2] ?? fileURLToPath(new URL('./shots', import.meta.url)));
const TODAY = new Date('2026-09-28T10:00:00+03:00');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(condition, label) {
  if (condition) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`);
  }
}

async function confirmationLink(email) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const data = await res.json();
    if (data.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${data.messages[0].ID}`)).json();
      const m = msg.Text.match(/https?:\/\/[^\s)\]]+\/auth\/v1\/verify\?[^\s)\]]+/);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Δεν ήρθε email για ${email}`);
}

function watch(page, name) {
  page.on('pageerror', (e) => {
    failures++;
    console.log(`  ✘ [${name}] pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  ! [${name}] console: ${m.text()}`);
  });
}

/** Η σελίδα έχει «ζωντανέψει» (React): πριν από αυτό ένα πάτημα θα ξαναφόρτωνε απλώς τη φόρμα. */
const hydrated = (p) =>
  p.waitForFunction(() => {
    const form = document.querySelector('form');
    return !!form && Object.keys(form).some((key) => key.startsWith('__reactProps'));
  });

async function register(page, { name, email, password }) {
  await page.goto(`${BASE}/register`);
  await hydrated(page);
  await page.getByLabel('Ονοματεπώνυμο').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Κωδικός', { exact: false }).first().fill(password);
  await page.getByLabel('Επανάληψη κωδικού').fill(password);
  await page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click();
  await page.getByText('Σας στείλαμε email').waitFor();
}

async function fillShift(form, values) {
  for (const [label, value] of Object.entries(values)) {
    await form.getByLabel(label, { exact: false }).first().fill(value);
  }
}

/** Ανοίγει όσα πάνελ είναι κλειστά (και «Ανάλυση ΦΠΑ», «+ Νέα καταχώρηση»). */
async function openAll(p) {
  const closed = p.locator(
    [
      'main section > :is(h2, h3) > button[aria-expanded="false"]',
      'main button[aria-controls="vat-details"][aria-expanded="false"]',
      'main button[aria-expanded="false"]:has-text("Νέα καταχώρηση")',
    ].join(', '),
  );
  for (let i = 0; i < 20 && (await closed.count()) > 0; i++) await closed.first().click();
}
const panelButton = (p, id) => p.locator(`#${id} > :is(h2, h3) > button`);
const panelOpen = async (p, id) => (await panelButton(p, id).getAttribute('aria-expanded')) === 'true';
async function openPanel(p, id) {
  if (!(await panelOpen(p, id))) await panelButton(p, id).click();
}
/** «Για: Σεπτέμβριος 2026 · … — Αλλαγή»: εμφανίζει τα πεδία μήνα / οδηγού της φόρμας. */
async function expandTarget(f) {
  const change = f.getByRole('button', { name: /^Αλλαγή μήνα/ });
  if (await change.count()) await change.click();
}
/** Ο κέρσορας πάει στο επόμενο frame: περιμένουμε έως 2 δευτ. */
async function isFocused(locator) {
  const end = Date.now() + 2000;
  for (;;) {
    if (await locator.evaluate((el) => el === document.activeElement)) return true;
    if (Date.now() > end) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
const idle = (p) => p.waitForFunction(() => !document.querySelector('section[aria-busy="true"]'));

/** Στοιχεία με κίτρινο φόντο που δεν πατιούνται (κανόνας: κίτρινο μόνο ό,τι πατιέται). */
function yellowNotPressable(p) {
  return p.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--accent)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll('body *')]
      .filter((el) => getComputedStyle(el).backgroundColor === accent)
      .filter((el) => !el.closest('button, a, label, [role="button"], svg'))
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || el.tagName);
  });
}

const browser = await chromium.launch();
/** Νέο «κινητό/υπολογιστής» με τη σταθερή ημερομηνία του ελέγχου (η ώρα κυλάει κανονικά από εκεί). */
async function newContext(options) {
  const context = await browser.newContext(options);
  await context.clock.install({ time: TODAY });
  return context;
}
const ctxOptions = { locale: 'el-GR', timezoneId: 'Europe/Athens', acceptDownloads: true };

// ---------------------------------------------------------------------
console.log('1. Ιδιοκτήτης: εγγραφή, επιβεβαίωση email, ενεργοποίηση Admin');
const owner = await newContext({ ...ctxOptions, viewport: { width: 1366, height: 900 } });
const page = await owner.newPage();
watch(page, 'owner');

await page.goto(BASE);
check(page.url().endsWith('/login'), 'χωρίς σύνδεση → /login');
await page.screenshot({ path: `${OUT}/01-login.png` });

await register(page, { name: 'Νίκος Ιδιοκτήτης', email: 'owner@example.com', password: 'OwnerPass123' });
await page.screenshot({ path: `${OUT}/02-register-sent.png` });

await page.goto(await confirmationLink('owner@example.com'));
await page.waitForURL(`${BASE}/`);
await page.getByText('Είμαι ο ιδιοκτήτης').waitFor();
check(true, 'σύνδεσμος επιβεβαίωσης → συνδεδεμένος, οθόνη αναμονής');
await page.screenshot({ path: `${OUT}/03-pending-owner.png` });

page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: /Είμαι ο ιδιοκτήτης/ }).click();
await page.locator('#fleet').waitFor();
check(await page.getByText('Admin', { exact: true }).isVisible(), 'ο ιδιοκτήτης είναι πλέον Admin');

console.log('1β. Πάνελ: προεπιλογές του ιδιοκτήτη');
// Περιμένουμε να φορτωθούν οι οδηγοί (κλειστό: «Κανένας οδηγός ακόμη» · ανοιχτό: «Δεν έχουν καταχωρηθεί…»).
await page.locator('#fleet').getByText(/Κανένας οδηγός ακόμη|Δεν έχουν καταχωρηθεί οδηγοί ακόμη/).first().waitFor();
check(
  (await page.getByRole('button', { name: /Νέα καταχώρηση/ }).isVisible()) && !(await page.locator('#shift-form').isVisible()),
  'ιδιοκτήτης: η φόρμα είναι κλειστή — φαίνεται το «+ Νέα καταχώρηση»',
);
check(
  (await panelOpen(page, 'fleet')) && (await page.locator('#fleet').getByRole('button', { name: '+ Προσθήκη οδηγού' }).isVisible()),
  'χωρίς οδηγούς η «Υποδομή Στόλου» ανοίγει μόνη της, με τη φόρμα',
);
check(
  !(await panelOpen(page, 'shifts')) && nbsp0(await page.locator('#shifts').innerText()).includes('Καμία βάρδια'),
  'κλειστό πάνελ «Ιστορικό βαρδιών» με σύνοψη «Καμία βάρδια»',
);

// ---------------------------------------------------------------------
console.log('2. Υποδομή Στόλου');
const fleet = page.locator('#fleet');
async function addDriver(d) {
  await fleet.getByLabel('Όνομα Οδηγού').fill(d.name);
  await fleet.getByLabel('Πινακίδα').first().fill(d.plate);
  await fleet.getByLabel('Κινητό').first().fill(d.phone);
  await fleet.getByLabel('Email σύνδεσης').first().fill(d.email);
  await fleet.getByRole('button', { name: '+ Προσθήκη οδηγού' }).click();
  await fleet.getByText(`Ο οδηγός «${d.name}» προστέθηκε.`).waitFor();
}
await addDriver({ name: 'Γιώργος Παπαδόπουλος', plate: 'ταε-1234', phone: '691 234 5678', email: 'Giorgos@Example.com' });
check(
  (await panelOpen(page, 'fleet')) && (await fleet.getByLabel('Όνομα Οδηγού').isVisible()),
  'μετά τον πρώτο οδηγό το πάνελ και η φόρμα μένουν ανοιχτά',
);
await addDriver({ name: 'Μαρία Κωνσταντίνου', plate: 'ΙΚΒ-5678', phone: '6987654321', email: '' });
await addDriver({ name: 'Νίκος (Ιδιοκτήτης)', plate: 'ΤΑΧ-9999', phone: '6900000000', email: 'owner@example.com' });
check(await fleet.getByText('ΤΑΕ-1234').isVisible(), 'η πινακίδα αποθηκεύτηκε με κεφαλαία');
check((await fleet.getByText('✓ Συνδεδεμένος λογαριασμός').count()) === 1, 'ο ιδιοκτήτης συνδέθηκε αυτόματα με τον οδηγό του');
check((await fleet.getByText('Αναμονή εγγραφής').count()) === 1, 'ο Γιώργος σε αναμονή εγγραφής');
await fleet.getByRole('button', { name: 'Άκυρο' }).click();
check(await isFocused(fleet.getByRole('button', { name: '+ Νέος οδηγός' })), '«Άκυρο» → η φόρμα κλείνει, ο κέρσορας στο «+ Νέος οδηγός»');
await fleet.getByRole('button', { name: '+ Νέος οδηγός' }).click();
check(await isFocused(fleet.getByLabel('Όνομα Οδηγού')), '«+ Νέος οδηγός» → ο κέρσορας στο όνομα');
await fleet.getByRole('button', { name: 'Άκυρο' }).click();

// ---------------------------------------------------------------------
console.log('3. Καταχώρηση βαρδιών (Admin)');
const form = page.locator('#shift-form');
await page.getByRole('button', { name: /Νέα καταχώρηση/ }).click();
await form.waitFor();
check(
  await page
    .waitForFunction(() => document.activeElement?.contains(document.getElementById('shift-form')), null, { timeout: 2000 })
    .then(() => true, () => false),
  '«+ Νέα καταχώρηση» → ανοίγει η φόρμα, ο κέρσορας πάει σε αυτήν',
);
check(
  nbsp0(await form.innerText()).replace(/\s+/g, ' ').includes('Για: Σεπτέμβριος 2026 Γιώργος Παπαδόπουλος · ΤΑΕ-1234 Αλλαγή') &&
    (await form.getByRole('combobox').count()) === 0,
  '«Για: Σεπτέμβριος 2026 / Γιώργος Παπαδόπουλος · ΤΑΕ-1234 — Αλλαγή» αντί για 3 πεδία',
);
await form.getByRole('button', { name: 'Αλλαγή μήνα ή οδηγού' }).click();
check(
  (await form.getByRole('combobox', { name: 'Οδηγός' }).isVisible()) && (await isFocused(form.getByRole('combobox', { name: 'Μήνας' }))),
  '«Αλλαγή» → εμφανίζονται μήνας, έτος και οδηγός (ο κέρσορας στον μήνα)',
);
await form.getByLabel('Οδηγός').selectOption({ label: 'Γιώργος Παπαδόπουλος · ΤΑΕ-1234' });
await fillShift(form, {
  'Αριθμός Ζ': '101',
  'Αρ. Διαδρομών': '14',
  'Μισθωμένα Χλμ': '80,5',
  'Ελεύθερα Χλμ': '40',
  'Αποφορολογημένα Έσοδα': '160,39',
  'Φιλοδωρήματα': '5',
  'Καύσιμα': '40',
});
check(
  (await form.getByLabel('Άλλες Δαπάνες (€)', { exact: true }).count()) === 0 &&
    (await form.getByLabel('Επισκευές / Συντήρηση (€)', { exact: true }).count()) === 0 &&
    (await form.locator('input[inputmode="decimal"]').count()) === 5,
  'η βάρδια δεν έχει πια «Άλλες Δαπάνες» / «Επισκευές» (μόνο καύσιμα)',
);
const vatText = await form.locator('output').innerText();
check(vatText.includes('20,84'), `ζωντανός ΦΠΑ 13%: ${vatText}`);
check((await form.innerText()).includes('146,23'), 'προεπισκόπηση ταμείου βάρδιας 146,23 € (μόνο καύσιμα)');
await page.screenshot({ path: `${OUT}/04-admin-form-filled.png` });
await form.getByRole('button', { name: /^Καταχώρηση/ }).click();
await form.getByText('✓ Καταχωρήθηκε: Ζ 101').waitFor();
check(true, 'βάρδια Ζ 101 καταχωρήθηκε');

await form.getByLabel('Οδηγός').selectOption({ label: 'Μαρία Κωνσταντίνου · ΙΚΒ-5678' });
await fillShift(form, { 'Αριθμός Ζ': '55', 'Αρ. Διαδρομών': '9', 'Μισθωμένα Χλμ': '60', 'Ελεύθερα Χλμ': '20', 'Αποφορολογημένα Έσοδα': '100' });
await form.getByRole('button', { name: /^Καταχώρηση/ }).click();
await form.getByText('✓ Καταχωρήθηκε: Ζ 55').waitFor();

// Ίδιος αριθμός Ζ → ερώτηση επιβεβαίωσης (την απορρίπτουμε).
await form.getByLabel('Οδηγός').selectOption({ label: 'Μαρία Κωνσταντίνου · ΙΚΒ-5678' });
await fillShift(form, { 'Αριθμός Ζ': '55', 'Αποφορολογημένα Έσοδα': '1' });
let dupAsked = false;
page.once('dialog', (d) => {
  dupAsked = d.message().includes('Υπάρχει ήδη βάρδια με Ζ 55');
  d.dismiss();
});
await form.getByRole('button', { name: /^Καταχώρηση/ }).click();
await page.waitForTimeout(800);
check(dupAsked, 'προειδοποίηση για διπλό αριθμό Ζ');
await fillShift(form, { 'Αριθμός Ζ': '', 'Αποφορολογημένα Έσοδα': '' });

console.log('3α. Έξοδα οχήματος (εκτός βάρδιας)');
await page.getByRole('button', { name: 'Έξοδο οχήματος', exact: true }).click();
const xform = page.locator('#expense-form');
await xform.waitFor();
check(await xform.getByText('Καταχώρηση Εξόδου Οχήματος').isVisible(), 'διακόπτης «Βάρδια | Έξοδο οχήματος» → φόρμα εξόδου');
await expandTarget(xform);
await xform.getByLabel('Αυτοκίνητο').selectOption({ label: 'ΤΑΕ-1234 · Γιώργος Παπαδόπουλος' });
check(
  (await xform.getByRole('radio').count()) === 2 &&
    (await xform.getByLabel('Επισκευές / Συντήρηση').isChecked()) &&
    (await xform.getByText(/Πλύσιμο|Διόδια|Parking|Ελαστικά|Service/).count()) === 0,
  'μόνο δύο είδη εξόδου: «Επισκευές / Συντήρηση» (προεπιλογή) και «Άλλα έξοδα»',
);
await xform.getByText('Άλλα έξοδα', { exact: true }).click();
check(await xform.getByLabel('Άλλα έξοδα').isChecked(), 'επιλογή «Άλλα έξοδα»');
await xform.getByLabel('Ποσό με ΦΠΑ').fill('10');
await xform.getByLabel('Περιγραφή').fill('Λογιστής');
check((await xform.locator('output').innerText()).includes('1,94'), 'ζωντανός ΦΠΑ 24% εξόδου: 10 € → 1,94 €');
await xform.getByRole('button', { name: /^Καταχώρηση εξόδου/ }).click();
await xform.getByText(/✓ Καταχωρήθηκε: Άλλα έξοδα 10,00.€ · ΤΑΕ-1234 · Γιώργος Παπαδόπουλος · Σεπτέμβριος 2026/).waitFor();
check(true, 'έξοδο «Άλλα έξοδα 10 € – Λογιστής» για το ΤΑΕ-1234');
await xform.getByLabel('Αυτοκίνητο').selectOption({ label: 'ΙΚΒ-5678 · Μαρία Κωνσταντίνου' });
check(await xform.getByLabel('Επισκευές / Συντήρηση').isChecked(), 'μετά την καταχώρηση η φόρμα ξαναγυρίζει σε «Επισκευές / Συντήρηση»');
await xform.getByLabel('Ποσό με ΦΠΑ').fill('124');
await xform.getByLabel('Περιγραφή').fill('Φρένα');
await xform.getByRole('button', { name: /^Καταχώρηση εξόδου/ }).click();
await xform.getByText(/✓ Καταχωρήθηκε: Επισκευές \/ Συντήρηση 124,00.€/).waitFor();
check(true, 'έξοδο «Επισκευή 124 € – Φρένα» για το ΙΚΒ-5678');
await xform.getByLabel('Ποσό με ΦΠΑ').fill('');
await xform.getByRole('button', { name: /^Καταχώρηση εξόδου/ }).click();
check(await xform.getByText('Γράψτε το ποσό').isVisible(), 'το ποσό εξόδου είναι υποχρεωτικό');
await page.screenshot({ path: `${OUT}/04b-expense-form.png` });
check(
  nbsp0(await page.locator('#expenses').innerText()).includes('2 έξοδα · 134,00 €'),
  'κλειστό πάνελ «Έξοδα Οχήματος»: σύνοψη «2 έξοδα · 134,00 €»',
);
await openPanel(page, 'expenses');
const expCard = nbsp0(await page.locator('#expenses').innerText());
check(expCard.includes('Άλλα έξοδα') && expCard.includes('Λογιστής') && expCard.includes('Επισκευές / Συντήρηση') && expCard.includes('Φρένα'), 'λίστα «Έξοδα Οχήματος» με τα 2 έξοδα');
check(expCard.includes('Σύνολο εξόδων οχήματος') && expCard.includes('134,00'), 'σύνολο εξόδων οχήματος 134,00 €');
await page.getByRole('button', { name: 'Βάρδια', exact: true }).click();
await form.waitFor();

console.log('3γ. Πάνελ: σύνοψη όταν είναι κλειστά, άνοιγμα, μνήμη');
const shiftsSummary = nbsp0(await page.locator('#shifts').innerText()).replace(/\s+/g, ' ');
check(shiftsSummary.includes('2 βάρδιες · μικτή είσπραξη 299,22 €'), `κλειστό πάνελ βαρδιών: «${shiftsSummary}»`);
const detailsSummary = nbsp0(await page.locator('#stats-details').innerText()).replace(/\s+/g, ' ');
check(detailsSummary.includes('καθαρά 260,39 € · 200,5 χλμ · 23 διαδρομές'), `κλειστό «Έσοδα, χιλιόμετρα & διαδρομές»: «${detailsSummary}»`);
check(!(await page.getByText('ΦΠΑ εξόδων 24%').first().isVisible()), 'η «Ανάλυση ΦΠΑ» είναι κλειστή');
await page.getByRole('button', { name: 'Ανάλυση ΦΠΑ' }).click();
check(await page.getByText('ΦΠΑ εξόδων 24%').first().isVisible(), '«Ανάλυση ΦΠΑ» → φαίνεται ο ΦΠΑ εσόδων και εξόδων');
await form.getByRole('button', { name: 'Κλείσιμο φόρμας' }).click();
check(
  !(await form.isVisible()) && (await isFocused(page.getByRole('button', { name: /Νέα καταχώρηση/ }))),
  '«Κλείσιμο» → η φόρμα κλείνει, ο κέρσορας στο «+ Νέα καταχώρηση»',
);
await panelButton(page, 'fleet').click();
check(!(await panelOpen(page, 'fleet')), 'η «Υποδομή Στόλου» κλείνει με πάτημα στον τίτλο');
await page.evaluate(() => {
  window.location.hash = 'fleet';
});
await page.waitForFunction(() => document.querySelector('#fleet > h2 > button')?.getAttribute('aria-expanded') === 'true');
check(true, 'σύνδεσμος «#fleet» → η «Υποδομή Στόλου» ανοίγει μόνη της');
await page.evaluate(() => history.replaceState(null, '', '/'));
await openAll(page);
check((await page.locator('main section > :is(h2, h3) > button[aria-expanded="false"]').count()) === 0, 'όλα τα πάνελ ανοίγουν');
await page.reload();
await form.waitFor();
check(
  (await panelOpen(page, 'shifts')) && (await panelOpen(page, 'analysis')) && (await page.locator('#vat-details').isVisible()),
  'μετά από ανανέωση τα πάνελ και η φόρμα μένουν όπως τα άφησε ο χρήστης',
);

const body = nbsp0(await page.locator('main').innerText());
check(body.includes('260,39'), 'σύνολο καθαρών εσόδων 260,39 €');
check(body.includes('33,83'), 'ΦΠΑ εσόδων 13%: 20,84 + 12,99 = 33,83 €');
check(body.includes('33,68'), 'ΦΠΑ εξόδων 24%: καύσιμα 7,74 + άλλα έξοδα 1,94 + επισκευή 24,00 = 33,68 €');
check(body.includes('Καύσιμα 40,00 € · Έξοδα οχήματος 134,00 €'), 'Συνολικά Έξοδα: καύσιμα 40 € + έξοδα οχήματος 134 €');
check(body.includes('0,15') && body.includes('Χρεωστικό — προς πληρωμή'), 'προς απόδοση ΦΠΑ 0,15 € χρεωστικό');
check(body.includes('Ανά οδηγό'), 'πίνακας ανά οδηγό για τον admin');
await page.screenshot({ path: `${OUT}/05-admin-desktop.png`, fullPage: true });

// ---------------------------------------------------------------------
console.log('3β. Αναλυτικά: Πίνακας (προεπιλογή) · Ανά μήνα · Γράφημα');
const chart = page.getByTestId('analysis-card');
await chart.scrollIntoViewIfNeeded();
const nbsp = (text) => text.replace(/\u00a0/g, ' ');
check((await chart.getByRole('button', { name: 'Πίνακας' }).getAttribute('aria-pressed')) === 'true', 'προεπιλογή: Πίνακας');
check((await chart.getByRole('button', { name: 'Ανά βάρδια' }).getAttribute('aria-pressed')) === 'true', 'προεπιλογή: Ανά βάρδια');
const shiftTable = nbsp(await chart.locator('table').innerText());
check(['Τζίρος', 'Διαδρομές', 'Μέση αξία'].every((h) => shiftTable.includes(h)), 'στήλες Τζίρος, Διαδρομές, Μέση αξία μαζί');
check(shiftTable.includes('Γιώργος Παπαδόπουλος · 1 βάρδια') && shiftTable.includes('Μαρία Κωνσταντίνου · 1 βάρδια'), 'επικεφαλίδα για κάθε οδηγό');
check(/Ζ 101\s+186,23 €\s+14\s+12,95 €/.test(shiftTable), 'Ζ 101: 186,23 € · 14 διαδρομές · 12,95 € (χωρίς φιλοδωρήματα)');
check(/Ζ 55\s+112,99 €\s+9\s+12,55 €/.test(shiftTable), 'Ζ 55: 112,99 € · 9 διαδρομές · 12,55 €');
check(/Σύνολο\s+2 βάρδιες\s+299,22 €\s+23\s+12,79 €/.test(shiftTable), 'Σύνολο: 299,22 € · 23 · 12,79 €');
check(/Μ\.Ο\. ανά βάρδια\s+149,61 €\s+11,5/.test(shiftTable), 'Μ.Ο. ανά βάρδια: 149,61 € · 11,5');
const chartBox = await chart.boundingBox();
const statsTop = await page.getByText('Προς Απόδοση ΦΠΑ').first().boundingBox();
const formBoxDesktop = await page.locator('#shift-form').boundingBox();
check(chartBox.x > formBoxDesktop.x + formBoxDesktop.width - 1 && chartBox.y > statsTop.y, 'η κάρτα είναι δεξιά της φόρμας, κάτω από τα στατιστικά');
await chart.screenshot({ path: `${OUT}/05b-table-shifts.png` });

await chart.getByRole('button', { name: 'Ανά μήνα' }).click();
await chart.getByRole('button', { name: 'Σεπτέμβριος' }).waitFor();
await page.waitForFunction(() => !document.querySelector('[data-testid="analysis-card"] [aria-busy="true"]'));
const monthTable = nbsp(await chart.locator('table').innerText());
check(/Σεπτέμβριος\s+2 βάρδιες\s+299,22 €\s+23\s+12,79 €/.test(monthTable) && monthTable.includes('Έτος 2026'), 'Ανά μήνα: Σεπτέμβριος και σύνολο έτους');
await chart.screenshot({ path: `${OUT}/05c-table-months.png` });
await chart.getByRole('button', { name: 'Σεπτέμβριος' }).click();
await chart.getByRole('button', { name: 'Ανά βάρδια', pressed: true }).waitFor();
check(true, 'πατώντας τον μήνα ανοίγουν οι βάρδιές του');

await chart.getByRole('button', { name: 'Γράφημα' }).click();
check(await chart.getByRole('heading', { name: 'Τζίρος ανά βάρδια' }).isVisible(), 'Γράφημα: «Τζίρος ανά βάρδια»');
check((await chart.getByRole('button', { name: 'Τζίρος' }).getAttribute('aria-pressed')) === 'true', 'το κουμπί «Τζίρος» είναι επιλεγμένο');
const legendText = await chart.getByRole('list', { name: 'Οδηγοί' }).innerText();
check(legendText.includes('Γιώργος Παπαδόπουλος') && legendText.includes('Μαρία Κωνσταντίνου'), 'υπόμνημα: ένα χρώμα ανά οδηγό');
check((await chart.locator('svg circle').count()) === 2, 'ένα σημείο για κάθε βάρδια (2)');
const plot = chart.getByRole('group', { name: /ακούτε τις τιμές/ });
await plot.hover();
const tip = chart.getByText('1η βάρδια του μήνα', { exact: true });
await tip.waitFor();
const tipText = nbsp(await tip.locator('..').innerText());
check(tipText.includes('186,23') && tipText.includes('112,99') && tipText.includes('Ζ 101'), `tooltip με τις τιμές όλων των οδηγών (${tipText.replace(/\s+/g, ' ')})`);
await chart.screenshot({ path: `${OUT}/05d-chart-gross-tooltip.png` });
await page.mouse.move(5, 5);

await chart.getByRole('button', { name: 'Διαδρομές' }).click();
check(await chart.getByRole('heading', { name: 'Διαδρομές ανά βάρδια' }).isVisible(), 'κουμπί «Διαδρομές» → Διαδρομές ανά βάρδια');
check((await chart.innerText()).includes('Μ.Ο. ανά βάρδια') && (await chart.innerText()).includes('11,5'), 'Μ.Ο. διαδρομών ανά βάρδια: (14 + 9) ÷ 2 = 11,5');

await chart.getByRole('button', { name: 'Μέση αξία διαδρομής' }).click();
check(await chart.getByRole('heading', { name: 'Μέση αξία διαδρομής ανά βάρδια' }).isVisible(), 'κουμπί «Μέση αξία διαδρομής»');
const avgText = await chart.innerText();
check(avgText.includes('Μέση αξία περιόδου') && avgText.includes('12,79'), 'μέση αξία περιόδου χωρίς φιλοδωρήματα: (181,23 + 112,99) ÷ 23 = 12,79 €');

await plot.focus();
await page.keyboard.press('End');
const live = await chart.locator('[aria-live="polite"]').innerText();
check(live.includes('1η βάρδια του μήνα') && live.includes('12,95'), `πληκτρολόγιο: οι τιμές ανακοινώνονται (${nbsp(live)})`);
await page.keyboard.press('Escape');

await page.reload();
await page.getByTestId('analysis-card').getByRole('heading', { name: 'Μέση αξία διαδρομής ανά βάρδια' }).waitFor();
check(true, 'θυμάται «Γράφημα» και «Μέση αξία» μετά από ανανέωση');
await page.getByTestId('analysis-card').getByRole('button', { name: 'Τζίρος' }).click();

// ---------------------------------------------------------------------
console.log('4. WhatsApp & CSV');
await page.locator('#filters').getByLabel('Οδηγός').selectOption({ label: 'Γιώργος Παπαδόπουλος · ΤΑΕ-1234' });
const wa = page.getByRole('link', { name: /Αποστολή WhatsApp/ });
await wa.waitFor();
const href = await wa.getAttribute('href');
const waText = decodeURIComponent(href.split('?text=')[1] ?? '');
check(href.startsWith('https://wa.me/306912345678?text='), `σύνδεσμος wa.me σωστός (${href.slice(0, 40)}…)`);
check(
  ['Οδηγός: Γιώργος Παπαδόπουλος', 'Όχημα: ΤΑΕ-1234', 'Μήνας: Σεπτέμβριος 2026', '186,23', '50,00', '11,16', 'Χρεωστικό'].every((t) =>
    waText.includes(t),
  ),
  'κείμενο WhatsApp με όνομα, πινακίδα, μήνα, είσπραξη, έξοδα, ΦΠΑ, ένδειξη',
);
console.log(waText.split('\n').map((l) => `      ${l}`).join('\n'));
check(nbsp0(waText).includes('Έξοδα: 50,00 € (καύσιμα 40,00 € + οχήματος 10,00 €)'), 'WhatsApp: έξοδα με ανάλυση καύσιμα + οχήματος');

await page.locator('#filters').getByLabel('Οδηγός').selectOption('all');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /Εξαγωγή Excel/ }).click(),
]);
const csvPath = `${OUT}/export.csv`;
await download.saveAs(csvPath);
const csv = fs.readFileSync(csvPath, 'utf8');
check(download.suggestedFilename() === 'taxi-fleet-2026-09.csv', `όνομα αρχείου ${download.suggestedFilename()}`);
check(csv.charCodeAt(0) === 0xfeff, 'CSV με UTF-8 BOM');
check(csv.includes('Γιώργος Παπαδόπουλος;ΤΑΕ-1234;101;14;80,5;40;120,5;160,39;20,84'), 'γραμμή CSV με ελληνικά και υποδιαστολή');
check(csv.includes('Προς Απόδοση ΦΠΑ (€);0,15;Χρεωστικό'), 'σύνοψη ΦΠΑ στο CSV');
check(csv.includes('ΕΞΟΔΑ ΟΧΗΜΑΤΟΣ (εκτός βάρδιας)') && csv.includes('Επισκευές / Συντήρηση;Φρένα;124,00;24,00;'), 'CSV: ενότητα «Έξοδα Οχήματος»');
check(csv.includes('Έξοδα Οχήματος (€);134,00') && csv.includes('Σύνολο Εξόδων (€);174,00'), 'CSV: σύνοψη με καύσιμα + έξοδα οχήματος');

// ---------------------------------------------------------------------
console.log('4β. Διόρθωση βάρδιας (Admin) — παράθυρο, χωρίς μετακίνηση της σελίδας');
const editBtn = page.getByRole('button', { name: 'Επεξεργασία βάρδιας Ζ 101' });
await editBtn.scrollIntoViewIfNeeded();
const yBefore = await page.evaluate(() => window.scrollY);
await editBtn.click();
const edit = page.locator('#shift-edit-form');
await edit.getByText('Επεξεργασία Βάρδιας · Ζ 101').waitFor();
check(await page.getByRole('dialog', { name: 'Επεξεργασία βάρδιας' }).isVisible(), 'η βάρδια ανοίγει σε παράθυρο');
check((await edit.getByLabel('Αποφορολογημένα Έσοδα').inputValue()) === '160,39', 'το παράθυρο γέμισε με τα στοιχεία της βάρδιας');
check((await edit.getByLabel('Καύσιμα').inputValue()) === '40', 'τα καύσιμα της βάρδιας στη φόρμα');
await page.screenshot({ path: `${OUT}/05b-admin-editing.png` });
await edit.getByLabel('Φιλοδωρήματα').fill('7');
check((await edit.innerText()).includes('148,23'), 'ζωντανό ταμείο βάρδιας μετά τη διόρθωση (φιλοδωρήματα 7 € → 148,23 €)');
await edit.getByRole('button', { name: 'Αποθήκευση διορθώσεων' }).click();
await page.getByText('✓ Αποθηκεύτηκαν οι διορθώσεις στη βάρδια Ζ 101.').waitFor();
check((await page.locator('#shift-edit-form').count()) === 0, 'το παράθυρο κλείνει μετά την αποθήκευση');
const yAfter = await page.evaluate(() => window.scrollY);
check(Math.abs(yAfter - yBefore) < 5, `η σελίδα έμεινε στην ίδια θέση (${yBefore} → ${yAfter})`);
const afterEdit = await page.locator('main').innerText();
check(afterEdit.includes('148,23'), 'το ιστορικό δείχνει το νέο ταμείο της βάρδιας (148,23)');
await page.getByRole('button', { name: 'Επεξεργασία βάρδιας Ζ 55' }).click();
await edit.getByText('Επεξεργασία Βάρδιας · Ζ 55').waitFor();
await edit.getByRole('button', { name: 'Ακύρωση' }).click();
check((await page.locator('#shift-edit-form').count()) === 0, 'Ακύρωση κλείνει το παράθυρο');
await page.getByRole('button', { name: 'Επεξεργασία βάρδιας Ζ 55' }).click();
await edit.getByText('Επεξεργασία Βάρδιας · Ζ 55').waitFor();
await page.keyboard.press('Escape');
check((await page.locator('#shift-edit-form').count()) === 0, 'το Esc κλείνει το παράθυρο');
check(await form.getByText('Καταχώρηση Βάρδιας').isVisible(), 'η φόρμα νέας καταχώρησης δεν επηρεάστηκε');

console.log('4γ. Διόρθωση εξόδου οχήματος');
await page.getByRole('button', { name: /Επεξεργασία εξόδου Άλλα έξοδα/ }).click();
const xedit = page.locator('#expense-edit-form');
await xedit.waitFor();
check(await page.getByRole('dialog', { name: 'Επεξεργασία εξόδου οχήματος' }).isVisible(), 'το έξοδο ανοίγει σε παράθυρο');
check((await xedit.getByLabel('Ποσό με ΦΠΑ').inputValue()) === '10' && (await xedit.getByLabel('Άλλα έξοδα').isChecked()), 'το παράθυρο γέμισε με το ποσό και το είδος του εξόδου');
await xedit.getByLabel('Ποσό με ΦΠΑ').fill('20');
check((await xedit.locator('output').innerText()).includes('3,87'), 'ζωντανός ΦΠΑ 24%: 20 € → 3,87 €');
await xedit.getByRole('button', { name: 'Αποθήκευση διορθώσεων' }).click();
await page.getByText(/✓ Αποθηκεύτηκαν οι διορθώσεις στο έξοδο «Άλλα έξοδα 20,00.€»/).waitFor();
check((await page.locator('#expense-edit-form').count()) === 0, 'το παράθυρο κλείνει μετά την αποθήκευση');
const afterExpenseEdit = nbsp0(await page.locator('main').innerText());
check(afterExpenseEdit.includes('Έξοδα οχήματος 144,00 €'), 'έξοδα οχήματος 144,00 € μετά τη διόρθωση');
check(afterExpenseEdit.includes('1,78') && afterExpenseEdit.includes('Πιστωτικό υπόλοιπο'), 'ο ΦΠΑ ξαναϋπολογίστηκε: 33,83 − (7,74 + 3,87 + 24,00) = 1,78 € πιστωτικό');

// ---------------------------------------------------------------------
console.log('5. Κινητό (Admin)');
const ownerState = await owner.storageState();
// Το κινητό είναι άλλη συσκευή: τα πάνελ ξεκινούν με τις προεπιλογές τους.
for (const origin of ownerState.origins) {
  origin.localStorage = origin.localStorage.filter((item) => !item.name.startsWith('taxi-tracker:panels:'));
}
const ownerMobile = await newContext({ ...ctxOptions, storageState: ownerState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mpage = await ownerMobile.newPage();
watch(mpage, 'owner-mobile');
await mpage.goto(BASE);
const mNewEntry = mpage.getByRole('button', { name: /Νέα καταχώρηση/ });
await mNewEntry.waitFor();
await idle(mpage);
const formBox = await mNewEntry.boundingBox();
const statsBox = await mpage.getByText('Προς Απόδοση ΦΠΑ').first().boundingBox();
check(formBox.y < statsBox.y, 'στο κινητό το «+ Νέα καταχώρηση» είναι πάνω από τα στατιστικά');
const mScreens = await mpage.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
check(mScreens < 4, `κινητό (ιδιοκτήτης): όλη η σελίδα ${mScreens.toFixed(1)} οθόνες με κλειστά πάνελ`);
const width = await mpage.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);
check(width[0] === 390 && width[1] === 390, `πλάτος σελίδας 390px στο κινητό, χωρίς zoom-out/κύλιση (${width})`);
await mpage.screenshot({ path: `${OUT}/06-admin-mobile.png`, fullPage: true });
const mchart = mpage.getByTestId('analysis-card');
await openPanel(mpage, 'analysis');
await mchart.scrollIntoViewIfNeeded();
await mchart.getByRole('button', { name: 'Γράφημα' }).click();
const mchartBox = await mchart.boundingBox();
check(mchartBox.x >= 0 && mchartBox.x + mchartBox.width <= 390, `κινητό: το γράφημα χωράει στην οθόνη (${Math.round(mchartBox.x)}–${Math.round(mchartBox.x + mchartBox.width)})`);
const buttonsOk = await mchart.getByRole('button', { name: 'Μέση αξία διαδρομής' }).boundingBox();
check(buttonsOk.x + buttonsOk.width <= 390 && buttonsOk.height >= 44, 'κινητό: και τα 3 κουμπιά χωράνε, ύψος ≥ 44px');
await mchart.getByRole('group', { name: /ακούτε τις τιμές/ }).tap();
await mchart.getByText('1η βάρδια του μήνα', { exact: true }).waitFor();
check(true, 'κινητό: με ένα άγγιγμα εμφανίζονται οι τιμές');
await mchart.screenshot({ path: `${OUT}/06b-chart-mobile.png` });
check((await mpage.evaluate(() => getComputedStyle(document.body).fontSize)) === '18px', 'κανονικά γράμματα: 18px (ήταν 16px)');
await mpage.getByRole('button', { name: 'Μεγαλύτερα γράμματα' }).click();
check(await mpage.evaluate(() => document.documentElement.dataset.textSize === 'large'), 'Α+: μεγαλύτερα γράμματα');
const largeSize = await mpage.evaluate(() => getComputedStyle(document.body).fontSize);
check(largeSize === '20.25px', `Α+: βασικό μέγεθος 20,25px (${largeSize})`);
const largeWidth = await mpage.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);
check(largeWidth[0] === 390 && largeWidth[1] === 390, `Α+: χωρίς πλάγια κύλιση (${largeWidth})`);
await mpage.screenshot({ path: `${OUT}/06c-admin-mobile-large.png`, fullPage: true });
await mpage.reload();
await mNewEntry.waitFor();
check(await mpage.evaluate(() => document.documentElement.dataset.textSize === 'large'), 'Α+: θυμάται μετά από ανανέωση');
check((await mpage.getByRole('button', { name: 'Μεγαλύτερα γράμματα' }).getAttribute('aria-pressed')) === 'true', 'Α+: το κουμπί δείχνει ότι είναι ενεργό');
await mpage.getByRole('button', { name: 'Μεγαλύτερα γράμματα' }).click();
check(await mpage.evaluate(() => !document.documentElement.dataset.textSize), 'Α+: ξανά κανονικά γράμματα');
await ownerMobile.close();

// ---------------------------------------------------------------------
console.log('6. Οδηγός: εγγραφή, αυτόματη σύνδεση, μόνο δικά του δεδομένα');
const driverCtx = await newContext({ ...ctxOptions, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const dpage = await driverCtx.newPage();
watch(dpage, 'driver');
await register(dpage, { name: 'Γιώργος Π.', email: 'giorgos@example.com', password: 'DriverPass123' });
await dpage.goto(await confirmationLink('giorgos@example.com'));
await dpage.waitForURL(`${BASE}/`);
await dpage.locator('#shift-form').waitFor();
check((await dpage.getByRole('button', { name: /Νέα καταχώρηση/ }).count()) === 0, 'οδηγός: η φόρμα είναι ανοιχτή από την αρχή');
check(
  nbsp0(await dpage.locator('#shift-form').innerText()).replace(/\s+/g, ' ').includes('Για: Σεπτέμβριος 2026 Γιώργος Παπαδόπουλος · ΤΑΕ-1234') &&
    (await dpage.locator('#shift-form').getByRole('button', { name: 'Αλλαγή μήνα' }).count()) === 1,
  'οδηγός: «Για: Σεπτέμβριος 2026 / Γιώργος Παπαδόπουλος · ΤΑΕ-1234 — Αλλαγή» (μόνο ο μήνας αλλάζει)',
);
check(
  !(await panelOpen(dpage, 'shifts')) && nbsp0(await dpage.locator('#shifts').innerText()).includes('1 βάρδια · μικτή είσπραξη'),
  'οδηγός: κλειστό ιστορικό βαρδιών με σύνοψη',
);
const dwidth = await dpage.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);
check(dwidth[0] === 390 && dwidth[1] === 390, `οδηγός: πλάτος 390px στο κινητό (${dwidth})`);
const dtext = await dpage.locator('body').innerText();
check(dtext.includes('Γιώργος Παπαδόπουλος · ΤΑΕ-1234'), 'ο οδηγός συνδέθηκε αυτόματα με την εγγραφή του στόλου');
check(!dtext.includes('Μαρία'), 'ο οδηγός ΔΕΝ βλέπει άλλους οδηγούς');
check(!dtext.includes('Υποδομή Στόλου'), 'ο οδηγός ΔΕΝ βλέπει την Υποδομή Στόλου');
check(!dtext.includes('Αποστολή WhatsApp'), 'ο οδηγός δεν έχει κουμπί WhatsApp');
check(dtext.includes('160,39') && !dtext.includes('260,39'), 'στατιστικά μόνο από τις δικές του βάρδιες');
const driverYellow = await yellowNotPressable(dpage);
check(driverYellow.length === 0, `οδηγός: κίτρινο μόνο σε ό,τι πατιέται${driverYellow.length ? ` ✘ ${driverYellow.join(' | ')}` : ''}`);

const dform = dpage.locator('#shift-form');
await fillShift(dform, { 'Αριθμός Ζ': '102', 'Αρ. Διαδρομών': '11', 'Μισθωμένα Χλμ': '70', 'Ελεύθερα Χλμ': '30', 'Αποφορολογημένα Έσοδα': '120', 'Καύσιμα': '35' });
await dform.getByRole('button', { name: /^Καταχώρηση/ }).click();
await dform.getByText('✓ Καταχωρήθηκε: Ζ 102').waitFor();
check(true, 'ο οδηγός καταχώρησε δική του βάρδια');
await openPanel(dpage, 'shifts');
check((await dpage.getByRole('button', { name: 'Διαγραφή' }).count()) === 1, 'ο οδηγός μπορεί να διορθώσει μόνο τη δική του πρόσφατη βάρδια');
check(
  (await dpage.getByRole('button', { name: 'Επεξεργασία', exact: true }).count()) === 1,
  'ο οδηγός βλέπει «Επεξεργασία» μόνο στη δική του πρόσφατη βάρδια',
);
await dpage.getByRole('button', { name: 'Επεξεργασία', exact: true }).click();
const dedit = dpage.locator('#shift-edit-form');
await dedit.getByText('Επεξεργασία Βάρδιας · Ζ 102').waitFor();
await dpage.screenshot({ path: `${OUT}/08b-driver-editing-mobile.png` });
await dedit.getByLabel('Καύσιμα').fill('38');
await dedit.getByRole('button', { name: 'Αποθήκευση διορθώσεων' }).click();
await dpage.getByText('✓ Αποθηκεύτηκαν οι διορθώσεις στη βάρδια Ζ 102.').waitFor();
check(true, 'ο οδηγός διόρθωσε τη δική του βάρδια (καύσιμα)');

await openPanel(dpage, 'expenses');
const dexpenses = nbsp0(await dpage.locator('#expenses').innerText());
check(dexpenses.includes('Λογιστής') && !dexpenses.includes('Φρένα'), 'ο οδηγός βλέπει μόνο τα έξοδα του δικού του αυτοκινήτου');
await dpage.getByRole('button', { name: 'Έξοδο οχήματος', exact: true }).click();
const dxform = dpage.locator('#expense-form');
await dxform.waitFor();
check((await dxform.getByRole('combobox', { name: 'Αυτοκίνητο' }).count()) === 0 && (await dxform.innerText()).includes('ΤΑΕ-1234 · Γιώργος Παπαδόπουλος'), 'ο οδηγός καταχωρεί έξοδο μόνο για το δικό του αυτοκίνητο');
await dxform.getByText('Άλλα έξοδα', { exact: true }).click();
await dxform.getByLabel('Ποσό με ΦΠΑ').fill('3,50');
await dxform.getByLabel('Περιγραφή').fill('Υγρό υαλοκαθαριστήρων');
await dxform.getByRole('button', { name: /^Καταχώρηση εξόδου/ }).click();
await dxform.getByText(/✓ Καταχωρήθηκε: Άλλα έξοδα 3,50.€ · ΤΑΕ-1234/).waitFor();
check(true, 'ο οδηγός καταχώρησε «Άλλα έξοδα 3,50 €» για το αυτοκίνητό του');
await dpage.screenshot({ path: `${OUT}/08c-driver-expense-mobile.png`, fullPage: true });
const dExpenseCards = dpage.locator('#expenses li');
check((await dExpenseCards.filter({ hasText: 'Υγρό υαλοκαθαριστήρων' }).getByRole('button', { name: 'Επεξεργασία' }).count()) === 1, 'ο οδηγός διορθώνει το δικό του έξοδο');
check((await dExpenseCards.filter({ hasText: 'Λογιστής' }).getByRole('button').count()) === 0, 'δεν αλλάζει έξοδο που καταχώρησε ο ιδιοκτήτης');
await dpage.getByRole('button', { name: 'Βάρδια', exact: true }).click();
await dform.waitFor();

console.log('7. Χωρίς σήμα → ουρά αποστολής → αυτόματη αποστολή');
await driverCtx.setOffline(true);
await fillShift(dform, { 'Αριθμός Ζ': '103', 'Αποφορολογημένα Έσοδα': '50' });
await dform.getByRole('button', { name: /^Καταχώρηση/ }).click();
await dform.getByText('Χωρίς σύνδεση').waitFor();
check(await dpage.getByText('1 βάρδια περιμένει').isVisible(), 'η βάρδια κρατήθηκε στη συσκευή');
await dpage.screenshot({ path: `${OUT}/07-driver-offline.png`, fullPage: true });
await driverCtx.setOffline(false);
await dpage.evaluate(() => window.dispatchEvent(new Event('online')));
await dpage.getByText('Στάλθηκαν 1 βάρδιες').waitFor({ timeout: 15000 });
check(!(await dpage.getByText('περιμένει αποστολή').isVisible()), 'η ουρά άδειασε μετά την επαναφορά σύνδεσης');
await dpage.getByText('Ζ 103').first().waitFor();
check(true, 'η Ζ 103 εμφανίζεται στο ιστορικό');
await dpage.screenshot({ path: `${OUT}/08-driver-mobile.png`, fullPage: true });
const dchart = dpage.getByTestId('analysis-card');
await openPanel(dpage, 'analysis');
await dchart.scrollIntoViewIfNeeded();
check((await dchart.getByRole('button', { name: 'Πίνακας' }).getAttribute('aria-pressed')) === 'true', 'οδηγός: ξεκινά με Πίνακα');
const dtable = nbsp(await dchart.locator('table').innerText());
check(['Ζ 101', 'Ζ 102', 'Ζ 103'].every((z) => dtable.includes(z)) && !dtable.includes('Μαρία') && !dtable.includes('Ζ 55'), 'οδηγός: ο πίνακας έχει μόνο τις δικές του βάρδιες');
await dchart.screenshot({ path: `${OUT}/08b-driver-table.png` });
await dchart.getByRole('button', { name: 'Γράφημα' }).click();
await dchart.locator('svg text').first().waitFor();
const dlabels = await dchart.locator('svg text').allTextContents();
check(['101', '102', '103'].every((z) => dlabels.includes(z)), `οδηγός: άξονας με τους αριθμούς Ζ (${dlabels.filter((t) => /^\d+$/.test(t)).join(', ')})`);
check((await dchart.getByRole('list', { name: 'Οδηγοί' }).count()) === 0, 'οδηγός: μία γραμμή, χωρίς υπόμνημα');
check((await dchart.innerText()).includes('Γιώργος Παπαδόπουλος'), 'οδηγός: το όνομά του στον υπότιτλο');
check((await dchart.locator('#analysis-body svg path[fill="none"]').count()) === 1, 'οδηγός: μία συνεχής γραμμή Ζ 101 → 103');
await dchart.screenshot({ path: `${OUT}/08c-driver-chart.png` });

// ---------------------------------------------------------------------
console.log('8. Λογαριασμός χωρίς αντιστοίχιση → αντιστοίχιση από τον Admin');
const mariaCtx = await newContext({ ...ctxOptions, viewport: { width: 390, height: 844 } });
const mariaPage = await mariaCtx.newPage();
watch(mariaPage, 'maria');
await register(mariaPage, { name: 'Μαρία Κ.', email: 'maria.k@example.com', password: 'MariaPass123' });
await mariaPage.goto(await confirmationLink('maria.k@example.com'));
await mariaPage.waitForURL(`${BASE}/`);
await mariaPage.getByText('δεν έχει αντιστοιχιστεί').waitFor();
check(!(await mariaPage.getByText('Είμαι ο ιδιοκτήτης').isVisible()), 'δεύτερος χρήστης δεν μπορεί να γίνει Admin');
await mariaPage.screenshot({ path: `${OUT}/09-unlinked-driver.png` });

await page.reload();
await fleet.getByText('Λογαριασμοί χωρίς αντιστοίχιση').waitFor();
await fleet.getByLabel('Οδηγός για maria.k@example.com').selectOption({ label: 'Μαρία Κωνσταντίνου · ΙΚΒ-5678' });
await fleet.getByRole('button', { name: 'Αντιστοίχιση', exact: true }).click();
await fleet.getByText('συνδέθηκε με τον/την Μαρία Κωνσταντίνου').waitFor();
await mariaPage.getByRole('button', { name: 'Ανανέωση' }).click();
await mariaPage.locator('#shift-form').waitFor();
await openAll(mariaPage);
const mtext = await mariaPage.locator('body').innerText();
check(mtext.includes('Ζ 55') && !mtext.includes('Ζ 101'), 'η Μαρία βλέπει μόνο τη δική της βάρδια (Ζ 55)');
check(mtext.includes('Φρένα') && !mtext.includes('Λογιστής') && !mtext.includes('Υγρό'), 'η Μαρία βλέπει μόνο το έξοδο του δικού της αυτοκινήτου');

// ---------------------------------------------------------------------
console.log('9. Μεταφορά δεδομένων παλιάς τοπικής έκδοσης');
await page.evaluate(() => {
  localStorage.setItem(
    'taxi_drivers',
    JSON.stringify([{ id: '1', name: 'Ιδιοκτήτης', plate: 'ΤΑΕ-1234', phone: '6900000000' }]),
  );
  localStorage.setItem(
    'taxi_shifts',
    JSON.stringify([
      { id: '5f0c7a3e-2b1d-4c9e-8f6a-1d2e3f4a5b6c', driverName: 'Ιδιοκτήτης', zNumber: '900', trips: 5, paidKm: 30, emptyKm: 10, netRevenue: 80, vat: 10.39, tips: 0, fuel: 20, expenses: 0, repairs: 0, date: '2026-09' },
      { id: '6f0c7a3e-2b1d-4c9e-8f6a-1d2e3f4a5b6c', driverName: 'Γιώργος Παπαδόπουλος', zNumber: '99', trips: 7, paidKm: 40, emptyKm: 20, netRevenue: 90, vat: 11.69, tips: 2, fuel: 0, expenses: 0, repairs: 0, date: '2026-08' },
    ]),
  );
});
await page.reload();
await page.getByText('Βρέθηκαν 2 βάρδιες').waitFor();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Μεταφορά στο Supabase' }).click();
await page.getByText('Μεταφέρθηκαν 2 βάρδιες').waitFor();
check(true, 'μεταφέρθηκαν 2 βάρδιες και δημιουργήθηκε ο οδηγός «Ιδιοκτήτης»');
check(await page.evaluate(() => localStorage.getItem('taxi_shifts') === null && !!localStorage.getItem('taxi_shifts_backup_imported')), 'κρατήθηκε αντίγραφο ασφαλείας στη συσκευή');

console.log('9β. Ανά μήνα (σύνολα της βάσης) και γράφημα έτους');
const ychart = page.getByTestId('analysis-card');
await ychart.getByRole('button', { name: 'Πίνακας' }).click();
await ychart.getByRole('button', { name: 'Ανά μήνα' }).click();
await ychart.getByRole('button', { name: 'Αύγουστος' }).waitFor();
await page.waitForFunction(() => !document.querySelector('[data-testid="analysis-card"] [aria-busy="true"]'));
const ym = nbsp(await ychart.locator('table').innerText());
check(/Αύγουστος\s+1 βάρδια\s+103,69 €\s+7\s+14,53 €/.test(ym), 'Ανά μήνα: ο Αύγουστος (άλλος μήνας) έρχεται από τα σύνολα της βάσης: 103,69 € · 7 · 14,53 €');
await ychart.getByRole('button', { name: 'Αύγουστος' }).click();
await ychart.getByRole('button', { name: 'Ανά βάρδια', pressed: true }).waitFor();
await page.waitForFunction(() => !document.querySelector('section[aria-busy="true"]'));
check((await page.locator('#filters').getByLabel('Μήνας').inputValue()) === '8', 'πατώντας «Αύγουστος» αλλάζει ο μήνας σε όλη τη σελίδα');
check((await ychart.locator('table').innerText()).includes('Ζ 99'), 'και ο πίνακας δείχνει τις βάρδιές του (Ζ 99)');
await page.locator('#filters').getByLabel('Μήνας').selectOption('all');
await ychart.getByRole('button', { name: 'Γράφημα' }).click();
await ychart.getByRole('heading', { name: 'Τζίρος ανά μήνα' }).waitFor();
await page.waitForFunction(() => !document.querySelector('section[aria-busy="true"]'));
// Τα στοιχεία του έτους έχουν έρθει όταν φαίνεται ο οδηγός του Αυγούστου.
await ychart.getByRole('list', { name: 'Οδηγοί' }).getByText('Ιδιοκτήτης', { exact: true }).waitFor();
const ylabels = await ychart.locator('svg text').allTextContents();
check(['Ιαν', 'Αυγ', 'Σεπ', 'Δεκ'].every((m) => ylabels.includes(m)), `άξονας Ιαν–Δεκ (${ylabels.filter((t) => !t.includes('€')).join(' ')})`);
const yLegend = await ychart.getByRole('list', { name: 'Οδηγοί' }).innerText();
check(yLegend.includes('Ιδιοκτήτης') && yLegend.includes('Γιώργος Παπαδόπουλος'), 'μία γραμμή για κάθε οδηγό του έτους');
check((await ychart.innerText()).includes('Μ.Ο. ανά οδηγό και μήνα'), 'Μ.Ο. ανά οδηγό και μήνα');
await ychart.scrollIntoViewIfNeeded();
await ychart.screenshot({ path: `${OUT}/10-chart-year.png` });
await ychart.getByRole('button', { name: 'Πίνακας' }).click();
await page.locator('#filters').getByLabel('Μήνας').selectOption('9');

// ---------------------------------------------------------------------
console.log('9γ. Εφαρμογές (Uber / FreeNow / Bolt): από το έγγραφο, έλεγχος με το ποσοστό, τιμολόγιο, διαδρομές δρόμου');
await page.locator('#filters').getByLabel('Οδηγός').selectOption({ label: 'Γιώργος Παπαδόπουλος · ΤΑΕ-1234' });
await idle(page);
await page.getByRole('button', { name: 'Εφαρμογή', exact: true }).click();
const pform = page.locator('#platform-form');
await pform.waitFor();
check(await pform.getByText('Καταχώρηση από Εφαρμογή').isVisible(), 'διακόπτης «Βάρδια | Έξοδο οχήματος | Εφαρμογή» → φόρμα εφαρμογής');
check((await pform.getByRole('radio', { name: 'Bolt' }).count()) === 1, 'τρεις εφαρμογές: Uber, FreeNow, Bolt');
check(
  nbsp0(await pform.innerText()).includes('Αντιγράψτε τα ποσά από το έγγραφο που στέλνει η εφαρμογή κάθε εβδομάδα'),
  'οδηγία: τα ποσά από το έγγραφο της εφαρμογής',
);

// Uber: πρώτα το ποσοστό (μία φορά)· ο ΦΠΑ είναι κλειδωμένος «χωρίς ΦΠΑ».
const rateBox = pform.getByRole('group', { name: 'Ποσοστό Uber' });
await rateBox.waitFor();
check(
  (await pform.getByLabel('Διαδρομές').count()) === 0 &&
    (await rateBox.innerText()).includes('σταθερό για την Uber') &&
    (await rateBox.innerText()).includes('Με αυτό ελέγχεται η προμήθεια κάθε εβδομάδας.') &&
    (await rateBox.getByRole('radio').count()) === 0,
  'Uber: πρώτα ορίζεται το ποσοστό (για έλεγχο)· ΦΠΑ σταθερά «χωρίς ΦΠΑ»',
);
await rateBox.getByLabel('Ποσοστό κράτησης (%)').fill('12');
await rateBox.getByRole('button', { name: 'Αποθήκευση ποσοστού' }).click();
await pform.getByText(/✓ Αποθηκεύτηκε: Uber 12% χωρίς ΦΠΑ για ΤΑΕ-1234 · Γιώργος Παπαδόπουλος/).waitFor();
check(nbsp0(await pform.innerText()).includes('Ποσοστό Uber: 12% χωρίς ΦΠΑ'), 'ποσοστό Uber 12% αποθηκεύτηκε και φαίνεται πάνω στη φόρμα');
check(
  (await pform.getByRole('button', { name: /Άλλο ποσό/ }).count()) === 0 &&
    (await pform.getByText('Κράτηση (αυτόματα)').count()) === 0,
  'χωρίς «Άλλο ποσό» και χωρίς αυτόματη κράτηση',
);

const weekSelect = pform.getByLabel('Εβδομάδα (Δευτέρα–Κυριακή)');
const weekOptions = await weekSelect.locator('option').allTextContents();
check(
  weekOptions.length === 5 && weekOptions[0] === '1–6 Σεπ (6 ημέρες)' && weekOptions[4] === '28–30 Σεπ (3 ημέρες)',
  `εβδομάδες Σεπτεμβρίου κομμένες στον μήνα: ${weekOptions.join(' | ')}`,
);
check((await weekSelect.inputValue()) === '2026-09-01', 'προτείνεται η πρώτη εβδομάδα που λείπει (1–6 Σεπ)');
const tripsInput = pform.getByLabel('Διαδρομές');
const revenueInput = pform.getByLabel('Συνολικά έσοδα');
const commissionInput = pform.getByLabel(/^Προμήθεια/);
const tipsInput = pform.getByLabel(/^Φιλοδωρήματα \/ Quest/);
const warning = pform.getByText(/Ελέγξτε την προμήθεια/);
await tripsInput.fill('3');
await revenueInput.fill('60');
await tipsInput.fill('5');
await pform.getByRole('button', { name: 'Καταχώρηση εβδομάδας · 1–6 Σεπ' }).click();
check(
  await pform.getByText('Γράψτε την προμήθεια όπως στο έγγραφο (ή 0).').isVisible(),
  'η προμήθεια του εγγράφου είναι υποχρεωτική',
);
await commissionInput.fill('70');
check(
  await pform.getByText('Η προμήθεια δεν μπορεί να είναι μεγαλύτερη από τα έσοδα.').isVisible(),
  'η προμήθεια δεν ξεπερνά τα έσοδα',
);
await commissionInput.fill('7,20');
check((await pform.locator('output').last().innerText()).includes('Χωρίς ΦΠΑ'), 'Uber: προμήθεια χωρίς ΦΠΑ');
check((await warning.count()) === 0, 'Uber 7,20 € = 12% × 60 €: χωρίς προειδοποίηση');
await pform.getByRole('button', { name: 'Καταχώρηση εβδομάδας · 1–6 Σεπ' }).click();
await pform
  .getByText(/✓ Καταχωρήθηκε: Uber · εβδομάδα 1–6 Σεπ · ΤΑΕ-1234 · Γιώργος Παπαδόπουλος · προμήθεια 7,20.€/)
  .waitFor();
check(true, 'εβδομάδα Uber 1–6 Σεπ: προμήθεια 7,20 € όπως στο έγγραφο');
check((await weekSelect.inputValue()) === '2026-09-07', 'μετά την καταχώρηση προτείνεται η επόμενη εβδομάδα (7–13 Σεπ)');
check(
  (await weekSelect.locator('option[value="2026-09-01"]').textContent()).includes('✓ καταχωρημένη') &&
    (await weekSelect.locator('option[value="2026-09-01"]').evaluate((option) => option.disabled)),
  'η καταχωρημένη εβδομάδα σημειώνεται ✓ και δεν ξαναδιαλέγεται',
);
check(
  (await revenueInput.inputValue()) === '' && (await commissionInput.inputValue()) === '',
  'μετά την καταχώρηση η φόρμα αδειάζει για την επόμενη εβδομάδα',
);

await tripsInput.fill('2');
await revenueInput.fill('40');
await commissionInput.fill('5');
check((await warning.count()) === 0, 'Uber 5,00 € με 12% × 40 € = 4,80 €: λίγη διαφορά, χωρίς προειδοποίηση');
await pform.getByRole('button', { name: 'Καταχώρηση εβδομάδας · 7–13 Σεπ' }).click();
await pform.getByText(/✓ Καταχωρήθηκε: Uber · εβδομάδα 7–13 Σεπ · ΤΑΕ-1234 · Γιώργος Παπαδόπουλος · προμήθεια 5,00.€/).waitFor();
check(true, 'εβδομάδα Uber 7–13 Σεπ: προμήθεια 5,00 €');

// FreeNow: 12% + ΦΠΑ 24% (προεπιλογή «Με ΦΠΑ»), όπως στο έγγραφο.
await pform.getByText('FreeNow', { exact: true }).click();
const fnBox = pform.getByRole('group', { name: 'Ποσοστό FreeNow' });
await fnBox.waitFor();
check(await fnBox.getByRole('radio', { name: 'Με ΦΠΑ 24%' }).isChecked(), 'FreeNow: προεπιλογή «Με ΦΠΑ 24%»');
await fnBox.getByLabel('Ποσοστό κράτησης (%)').fill('12');
await fnBox.getByRole('button', { name: 'Αποθήκευση ποσοστού' }).click();
await pform.getByText(/✓ Αποθηκεύτηκε: FreeNow 12% \+ ΦΠΑ 24%/).waitFor();
check((await weekSelect.inputValue()) === '2026-09-01', 'FreeNow: οι εβδομάδες μετράνε χωριστά (πάλι 1–6 Σεπ)');
const fnHints = nbsp0(await pform.innerText());
check(
  fnHints.includes('Η «Προμήθεια προς Freenow», χωρίς το μείον.') &&
    fnHints.includes('Οι «Λοιπές Επιστροφές / Επιβραβεύσεις». Χωρίς προμήθεια.'),
  'FreeNow: οι οδηγίες λένε ποια γραμμή του εγγράφου μπαίνει σε κάθε πεδίο',
);
await tripsInput.fill('4');
await revenueInput.fill('150');
await commissionInput.fill('-20,83');
check((await commissionInput.inputValue()) === '20,83', 'το μείον του εγγράφου φεύγει μόνο του (−20,83 → 20,83)');
check((await pform.locator('output').last().innerText()).includes('4,03'), 'ΦΠΑ μέσα στην προμήθεια: 20,83 € → 4,03 €');
await tipsInput.fill('10');
check((await warning.count()) === 0, '20,83 € (λίγο κάτω από 12% + ΦΠΑ × 150 € = 22,32 €): χωρίς προειδοποίηση');
await commissionInput.fill('139,17');
check(
  nbsp0(await pform.innerText()).includes(
    'Ελέγξτε την προμήθεια: με 12% + ΦΠΑ 24% θα ήταν περίπου 22,32 €. Μήπως γράψατε άλλη γραμμή του εγγράφου;',
  ),
  'άλλη γραμμή του εγγράφου κατά λάθος → προειδοποίηση (περίπου 22,32 €)',
);
await commissionInput.fill('20,83');
check((await warning.count()) === 0, 'σωστή προμήθεια → η προειδοποίηση φεύγει');
await pform.screenshot({ path: `${OUT}/11-platform-week-form.png` });
await pform.getByRole('button', { name: 'Καταχώρηση εβδομάδας · 1–6 Σεπ' }).click();
await pform.getByText(/✓ Καταχωρήθηκε: FreeNow · εβδομάδα 1–6 Σεπ .* προμήθεια 20,83.€/).waitFor();
check(true, 'εβδομάδα FreeNow 1–6 Σεπ: έσοδα 150 €, προμήθεια 20,83 €, quest 10 €');

// Bolt: ο ΦΠΑ δεν έχει προεπιλογή· πρέπει να τον διαλέξει.
await pform.getByText('Bolt', { exact: true }).click();
const boltBox = pform.getByRole('group', { name: 'Ποσοστό Bolt' });
await boltBox.waitFor();
check((await boltBox.getByRole('radio', { checked: true }).count()) === 0, 'Bolt: ο ΦΠΑ δεν έχει προεπιλογή');
await boltBox.getByLabel('Ποσοστό κράτησης (%)').fill('20');
await boltBox.getByRole('button', { name: 'Αποθήκευση ποσοστού' }).click();
check(
  await boltBox.getByText('Διαλέξτε αν το τιμολόγιο της εφαρμογής έχει ΦΠΑ.').isVisible(),
  'Bolt: χωρίς επιλογή ΦΠΑ δεν αποθηκεύεται (προστασία από λάθη)',
);
await boltBox.getByText('Χωρίς ΦΠΑ (ενδοκοινοτικό)', { exact: true }).click();
await boltBox.getByRole('button', { name: 'Αποθήκευση ποσοστού' }).click();
await pform.getByText(/✓ Αποθηκεύτηκε: Bolt 20% χωρίς ΦΠΑ/).waitFor();
check(
  nbsp0(await pform.innerText()).includes('Ό,τι δίνει η εφαρμογή χωρίς προμήθεια, έξω από τα έσοδα.'),
  'Bolt: γενική οδηγία για τα φιλοδωρήματα / quest',
);
await tripsInput.fill('1');
await revenueInput.fill('25');
await commissionInput.fill('5');
await pform.getByRole('button', { name: 'Καταχώρηση εβδομάδας · 1–6 Σεπ' }).click();
await pform.getByText(/✓ Καταχωρήθηκε: Bolt · εβδομάδα 1–6 Σεπ .* προμήθεια 5,00.€/).waitFor();
check(true, 'Bolt 20% χωρίς ΦΠΑ: εβδομάδα 1–6 Σεπ, προμήθεια 5,00 €');

// Αλλαγή ποσοστού FreeNow: ο έλεγχος χρησιμοποιεί το νέο.
await pform.getByText('FreeNow', { exact: true }).click();
await pform.getByRole('button', { name: 'Αλλαγή', exact: true }).click();
const fnChange = pform.getByRole('group', { name: 'Ποσοστό FreeNow' });
check(
  await fnChange.getByText('Η αλλαγή ισχύει για τις επόμενες καταχωρήσεις').isVisible(),
  'αλλαγή ποσοστού: ισχύει για τις επόμενες καταχωρήσεις',
);
await fnChange.getByLabel('Ποσοστό κράτησης (%)').fill('14');
await fnChange.getByRole('button', { name: 'Αποθήκευση ποσοστού' }).click();
await pform.getByText(/✓ Αποθηκεύτηκε: FreeNow 14% \+ ΦΠΑ 24%/).waitFor();
await revenueInput.fill('100');
await commissionInput.fill('30');
check(
  nbsp0(await pform.innerText()).includes('με 14% + ΦΠΑ 24% θα ήταν περίπου 17,36 €'),
  'ο έλεγχος χρησιμοποιεί το νέο ποσοστό (14% + ΦΠΑ × 100 € = 17,36 €)',
);

// Τιμολόγιο FreeNow: μετράει αντί για τις εβδομάδες.
await pform.getByText('Τιμολόγιο μήνα', { exact: true }).click();
const invoiceAmount = pform.getByLabel(/^Ποσό τιμολογίου με ΦΠΑ/);
check((await invoiceAmount.inputValue()) === '', 'η προμήθεια της εβδομάδας δεν περνά στο ποσό του τιμολογίου');
await invoiceAmount.fill('21');
await pform.getByLabel('Αριθμός τιμολογίου').fill('FN-0925');
const invoiceText = nbsp0(await pform.innerText());
check(
  invoiceText.includes('Κρατήσεις εβδομάδων (1)') && invoiceText.includes('20,83 €') && invoiceText.includes('+0,17 €'),
  'τιμολόγιο: σύγκριση με τις εβδομάδες (διαφορά +0,17 €)',
);
check((await pform.locator('output').last().innerText()).includes('4,06'), 'ΦΠΑ τιμολογίου: 21,00 € → 4,06 €');
await pform.screenshot({ path: `${OUT}/11-platform-invoice-form.png` });
await pform.getByRole('button', { name: 'Καταχώρηση τιμολογίου · Σεπτέμβριος 2026' }).click();
await pform
  .getByText(/✓ Καταχωρήθηκε: FreeNow · τιμολόγιο Σεπτέμβριος 2026 · ΤΑΕ-1234 · Γιώργος Παπαδόπουλος · 21,00.€/)
  .waitFor();
check(
  (await pform.getByText(/Υπάρχει ήδη τιμολόγιο FreeNow για Σεπτέμβριος 2026/).isVisible()) &&
    (await pform.getByRole('button', { name: /^Καταχώρηση τιμολογίου/ }).isDisabled()),
  'δεύτερο τιμολόγιο FreeNow για τον ίδιο μήνα δεν επιτρέπεται',
);
await idle(page);

const plist = page.locator('#platforms');
await openPanel(page, 'platforms');
const missingBadge = plist.getByText(/^λείπ(ει|ουν) \d+ εβδ\.$/);
check(await missingBadge.isVisible(), `σήμανση στον τίτλο: «${await missingBadge.innerText()}»`);
const uberCard = plist.getByRole('region', { name: 'Uber: εβδομάδες και τιμολόγιο' });
const uberText = nbsp0(await uberCard.innerText());
check(
  ['1–6 Σεπ ✓', '7–13 Σεπ ✓', '14–20 Σεπ · λείπει', '21–27 Σεπ · λείπει'].every((t) => uberText.includes(t)) &&
    !uberText.includes('28–30 Σεπ · λείπει'),
  'Uber: ✓ όσες μπήκαν, «λείπει» όσες τελείωσαν χωρίς καταχώρηση (η 28–30 είναι σε εξέλιξη)',
);
check(
  uberText.includes('Κράτηση 12,20 €') &&
    uberText.includes('Ποσοστό: 12% χωρίς ΦΠΑ') &&
    uberText.includes('5 διαδρομές · έσοδα 100,00 € · φιλοδ./quest 5,00 €'),
  'Uber: κράτηση 7,20 + 5,00 = 12,20 € · έσοδα 100 € · φιλοδ./quest 5 €',
);
const fnListText = nbsp0(await plist.getByRole('region', { name: 'FreeNow: εβδομάδες και τιμολόγιο' }).innerText());
check(
  fnListText.includes('Τιμολόγιο ✓ FN-0925: 21,00 €') &&
    fnListText.includes('διαφορά +0,17 €') &&
    fnListText.includes('Κράτηση 21,00 €') &&
    fnListText.includes('Ποσοστό: 14% + ΦΠΑ 24%') &&
    fnListText.includes('4 διαδρομές · έσοδα 150,00 € · φιλοδ./quest 10,00 €'),
  'FreeNow: μετράει το τιμολόγιο (21,00 €)· έσοδα 150 € και quest 10 € χωριστά',
);
const boltListText = nbsp0(await plist.getByRole('region', { name: 'Bolt: εβδομάδες και τιμολόγιο' }).innerText());
check(
  boltListText.includes('Κράτηση 5,00 €') && boltListText.includes('Ποσοστό: 20% χωρίς ΦΠΑ'),
  'Bolt: κράτηση 5,00 € · ποσοστό 20% χωρίς ΦΠΑ',
);
// Όροι (dt) και ποσά (dd) σε χωριστές γραμμές: ενώνονται με ένα κενό.
const listText = nbsp0(await plist.innerText()).replace(/\s+/g, ' ');
check(
  !listText.includes('ποσό της κίνησης') &&
    listText.includes('Έσοδα εφαρμογών 275,00 €') &&
    listText.includes('Φιλοδωρήματα / quest (χωρίς προμήθεια) 15,00 €') &&
    listText.includes('Κρατήσεις που μετράνε στα έξοδα 38,20 €'),
  'λίστα: έσοδα 275 €, φιλοδ./quest 15 € χωριστά, κρατήσεις 38,20 €',
);
const fnRow = nbsp0(await plist.locator('tr').filter({ hasText: 'FreeNow' }).filter({ hasText: 'Εβδομάδα 1–6 Σεπ' }).innerText());
check(
  ['150,00 €', '10,00 €', '20,83 €', '4,03 €'].every((t) => fnRow.includes(t)),
  `πίνακας: έσοδα, φιλοδ./quest, προμήθεια και ΦΠΑ της εβδομάδας FreeNow (${fnRow.replace(/\s+/g, ' ')})`,
);
await plist.screenshot({ path: `${OUT}/11b-platform-list.png` });

const stats = page.locator('section[aria-busy]');
const streetCard = page.locator('#street-apps');
const streetSummary = nbsp0(await streetCard.innerText()).replace(/\s+/g, ' ');
check(
  !(await panelOpen(page, 'street-apps')) && /δρόμος \d+ από \d+ διαδρομές · κρατήσεις 38,20 €/.test(streetSummary),
  `κλειστό «Δρόμος & Εφαρμογές»: «${streetSummary}»`,
);
await openPanel(page, 'street-apps');
const streetRows = await streetCard.locator('tbody tr').allInnerTexts();
const firstNumber = (text) => Number((nbsp0(text).match(/-?\d+/) ?? ['NaN'])[0]);
const street = streetRows.find((r) => r.startsWith('Δρόμος')) ?? '';
const zRow = streetRows.find((r) => r.startsWith('Σύνολο')) ?? '';
const zTrips = Number((zRow.match(/Σύνολο Ζ\s+(\d+)/) ?? [])[1]);
const appTrips = 3 + 2 + 4 + 1; // Uber 3 + 2, FreeNow 4, Bolt 1
check(
  zTrips > appTrips && firstNumber(street.replace('Δρόμος', '')) === zTrips - appTrips,
  `διαδρομές δρόμου = Ζ ${zTrips} − εφαρμογές ${appTrips} = ${zTrips - appTrips}`,
);
const fnStreetRow = nbsp0(streetRows.find((r) => r.startsWith('FreeNow')) ?? '');
check(
  fnStreetRow.includes('150,00 €') && !fnStreetRow.includes('160,00'),
  'Δρόμος & Εφαρμογές: τα έσοδα της FreeNow χωρίς τα quest (150 €, όχι 160 €) — τα quest δεν είναι στα Ζ',
);
const statsText = nbsp0(await stats.innerText());
check(
  statsText.includes('Κρατήσεις εφαρμογών 38,20 €'),
  'Συνολικά Έξοδα: + κρατήσεις εφαρμογών 38,20 € (Uber 12,20 + FreeNow 21,00 + Bolt 5,00)',
);
check(
  statsText.includes('Οι κρατήσεις Uber, Bolt (17,20 €) δεν έχουν ΦΠΑ και δεν συμψηφίζονται.'),
  'ΦΠΑ: οι κρατήσεις χωρίς ΦΠΑ (Uber, Bolt) δεν συμψηφίζονται',
);
check(statsText.includes(`δρόμος ${zTrips - appTrips}`), 'κάρτα «Διαδρομές»: πόσες από τον δρόμο');
await streetCard.screenshot({ path: `${OUT}/11c-street-apps.png` });

const pwa = page.getByRole('link', { name: /Αποστολή WhatsApp/ });
const pwaText = nbsp0(decodeURIComponent((await pwa.getAttribute('href')).split('?text=')[1] ?? ''));
check(
  pwaText.includes('κρατήσεις εφαρμογών 38,20 €') &&
    pwaText.includes(`Διαδρομές: ${zTrips} (δρόμος ${zTrips - appTrips}, εφαρμογές ${appTrips})`),
  'WhatsApp: κρατήσεις και διαδρομές δρόμου / εφαρμογών',
);

const [pdownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Εξαγωγή Excel/ }).click()]);
const pcsvPath = `${OUT}/export-apps.csv`;
await pdownload.saveAs(pcsvPath);
const pcsv = fs.readFileSync(pcsvPath, 'utf8');
check(
  pcsv.includes('ΕΦΑΡΜΟΓΕΣ (Uber / FreeNow / Bolt)') &&
    pcsv.includes('Διαδρομές;Συνολικά Έσοδα (€);Φιλοδωρήματα / Quest (€);Κράτηση / Προμήθεια (€);ΦΠΑ Κράτησης 24% (€)') &&
    pcsv.includes('Uber;Εβδομάδα 1–6 Σεπ;3;60,00;5,00;7,20;χωρίς ΦΠΑ;') &&
    pcsv.includes('Uber;Εβδομάδα 7–13 Σεπ;2;40,00;0,00;5,00;χωρίς ΦΠΑ;') &&
    pcsv.includes('FreeNow;Εβδομάδα 1–6 Σεπ;4;150,00;10,00;20,83;4,03;') &&
    pcsv.includes('FreeNow;Τιμολόγιο FN-0925;;;;21,00;4,06;') &&
    pcsv.includes('Bolt;Εβδομάδα 1–6 Σεπ;1;25,00;0,00;5,00;χωρίς ΦΠΑ;') &&
    pcsv.includes(`ΣΥΝΟΛΟ ΕΦΑΡΜΟΓΩΝ;;;κράτηση: τιμολόγιο ή εβδομάδες;${appTrips};275,00;15,00;38,20;4,06;`) &&
    pcsv.includes('Έσοδα Εφαρμογών (€);275,00') &&
    pcsv.includes('Κρατήσεις Εφαρμογών (€);38,20') &&
    pcsv.includes(`Διαδρομές Εφαρμογών;${appTrips}`),
  'CSV: ενότητα «Εφαρμογές» όπως το έγγραφο (έσοδα, φιλοδ./quest, προμήθεια, ΦΠΑ)· σύνολα και σύνοψη',
);

// Διόρθωση: ανοίγει με τα ποσά του εγγράφου.
await plist.getByRole('button', { name: 'Επεξεργασία: Uber Εβδομάδα 7–13 Σεπ' }).click();
const pedit = page.locator('#platform-edit-form');
await pedit.waitFor();
check(
  (await pedit.getByLabel('Εβδομάδα (Δευτέρα–Κυριακή)').inputValue()) === '2026-09-07',
  'διόρθωση: η φόρμα ανοίγει στην ίδια εβδομάδα',
);
check(
  (await pedit.getByLabel('Συνολικά έσοδα').inputValue()) === '40' &&
    (await pedit.getByLabel(/^Προμήθεια/).inputValue()) === '5',
  'διόρθωση: ανοίγει με τα ποσά που γράφτηκαν (έσοδα 40, προμήθεια 5)',
);
check(nbsp0(await pedit.innerText()).includes('Αυτή η καταχώρηση: 12% χωρίς ΦΠΑ'), 'διόρθωση: με το ποσοστό της καταχώρησης');
await pedit.getByLabel(/^Προμήθεια/).fill('4,80');
await pedit.getByRole('button', { name: 'Αποθήκευση διορθώσεων' }).click();
await page.getByText('✓ Αποθηκεύτηκαν οι διορθώσεις: Uber · εβδομάδα 7–13 Σεπ.').waitFor();
check(nbsp0(await uberCard.innerText()).includes('Κράτηση 12,00 €'), 'διόρθωση προμήθειας → Uber 7,20 + 4,80 = 12,00 €');
page.once('dialog', (d) => d.accept());
await plist.getByRole('button', { name: 'Διαγραφή: Uber Εβδομάδα 7–13 Σεπ' }).click();
await page.getByText('Η καταχώρηση «Uber · εβδομάδα 7–13 Σεπ» διαγράφηκε.').waitFor();
check(nbsp0(await uberCard.innerText()).includes('7–13 Σεπ · λείπει'), 'διαγραφή → η εβδομάδα 7–13 ξαναφαίνεται ότι λείπει');

// Οδηγός (κινητό): μόνο το δικό του αυτοκίνητο, με το ποσοστό που ορίστηκε.
await dpage.reload();
await dpage.locator('#shift-form').waitFor();
await dpage.getByRole('button', { name: 'Εφαρμογή', exact: true }).click();
const dpform = dpage.locator('#platform-form');
await dpform.waitFor();
await idle(dpage);
check(
  (await dpform.getByRole('combobox', { name: 'Αυτοκίνητο' }).count()) === 0 &&
    (await dpform.innerText()).includes('ΤΑΕ-1234 · Γιώργος Παπαδόπουλος'),
  'ο οδηγός καταχωρεί εφαρμογή μόνο για το δικό του αυτοκίνητο',
);
check(
  nbsp0(await dpform.innerText()).includes('Ποσοστό Uber: 12% χωρίς ΦΠΑ') &&
    (await dpform.getByRole('button', { name: 'Αλλαγή', exact: true }).count()) === 1,
  'ο οδηγός βλέπει το ποσοστό του αυτοκινήτου του και μπορεί να το αλλάξει',
);
check(
  (await dpform.getByLabel('Εβδομάδα (Δευτέρα–Κυριακή)').inputValue()) === '2026-09-07',
  'ο οδηγός βλέπει ποιες εβδομάδες έχουν μπει (προτείνεται η 7–13 Σεπ)',
);
await dpform.getByLabel('Διαδρομές').fill('2');
await dpform.getByLabel('Συνολικά έσοδα').fill('30');
await dpform.getByLabel(/^Προμήθεια/).fill('3,60');
await dpform.getByRole('button', { name: 'Καταχώρηση εβδομάδας · 7–13 Σεπ' }).click();
await dpform.getByText(/✓ Καταχωρήθηκε: Uber · εβδομάδα 7–13 Σεπ · ΤΑΕ-1234 .* προμήθεια 3,60.€/).waitFor();
check(true, 'ο οδηγός καταχώρησε την εβδομάδα Uber 7–13 Σεπ (έσοδα 30 €, προμήθεια 3,60 €)');
const dplist = dpage.locator('#platforms');
await openPanel(dpage, 'platforms');
check(
  (await dplist.locator('li').filter({ hasText: 'Εβδομάδα 7–13 Σεπ' }).getByRole('button', { name: 'Επεξεργασία' }).count()) === 1,
  'ο οδηγός διορθώνει τη δική του καταχώρηση',
);
check(
  (await dplist.locator('li').filter({ hasText: 'Τιμολόγιο FN-0925' }).getByRole('button').count()) === 0,
  'ο οδηγός δεν αλλάζει καταχώρηση του ιδιοκτήτη',
);
const dpw = await dpage.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);
check(dpw[0] === 390 && dpw[1] === 390, `κινητό: χωρίς οριζόντια κύλιση (${dpw})`);
await dpage.screenshot({ path: `${OUT}/12-driver-platform-mobile.png`, fullPage: true });
await dpage.getByRole('button', { name: 'Βάρδια', exact: true }).click();

console.log('9δ. Επιλογές με το ίδιο κίτρινο με τα κουμπιά· κίτρινο μόνο ό,τι πατιέται');
const ownerYellow = await yellowNotPressable(page);
check(ownerYellow.length === 0, `ιδιοκτήτης: κίτρινο μόνο σε ό,τι πατιέται${ownerYellow.length ? ` ✘ ${ownerYellow.join(' | ')}` : ''}`);
const netCash = page.locator('div', { has: page.getByText('Καθαρό Ταμείο (Τσέπη)', { exact: true }) }).last();
check(
  (await netCash.evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgb(250, 204, 21)',
  `«Καθαρό Ταμείο» όχι κίτρινο (${await netCash.evaluate((el) => getComputedStyle(el).backgroundColor)})`,
);
const colors = await page.evaluate(() => {
  const bg = (el) => getComputedStyle(el).backgroundColor;
  const primary = bg(document.querySelector('#platform-form button[type="submit"]'));
  const chosen = [
    ...document.querySelectorAll('main [aria-pressed="true"]'),
    ...[...document.querySelectorAll('main input[type="radio"]:checked')].map((input) => input.closest('label')),
  ];
  return { primary, chosen: chosen.map((el) => [el.textContent.trim().slice(0, 24), bg(el)]) };
});
const offColor = colors.chosen.filter(([, color]) => color !== colors.primary);
check(
  colors.chosen.length >= 5 && offColor.length === 0,
  `επιλεγμένα: ${colors.chosen.map(([text]) => text).join(' | ')} — όλα ${colors.primary}${offColor.length ? ` ✘ ${JSON.stringify(offColor)}` : ''}`,
);

await page.getByRole('button', { name: 'Βάρδια', exact: true }).click();
await page.locator('#filters').getByLabel('Οδηγός').selectOption('all');

// ---------------------------------------------------------------------
console.log('10. Μνήμη έτους/μήνα & αποσύνδεση');
await page.locator('#filters').getByLabel('Έτος').selectOption('2025');
await page.reload();
await page.locator('#filters').waitFor();
check((await page.locator('#filters').getByLabel('Έτος').inputValue()) === '2025', 'το επιλεγμένο έτος θυμάται μετά από ανανέωση');
await page.getByTestId('analysis-card').getByText('Δεν υπάρχουν βάρδιες για αυτή την περίοδο.').waitFor();
check(true, 'γράφημα χωρίς βάρδιες: μήνυμα αντί για κενό γράφημα');
check(await page.locator('#shift-form').getByText('όχι στον τρέχοντα').isVisible(), 'προειδοποίηση όταν η καταχώρηση δεν είναι στον τρέχοντα μήνα');
await page.locator('#shift-form').getByRole('button', { name: 'Τρέχων μήνας' }).click();
check((await page.locator('#filters').getByLabel('Έτος').inputValue()) === '2026', 'κουμπί «Τρέχων μήνας»');

await page.getByRole('button', { name: 'Αποσύνδεση' }).click();
await page.waitForURL(`${BASE}/login`);
check(true, 'αποσύνδεση → /login');

await browser.close();
console.log(failures ? `\n${failures} ΑΠΟΤΥΧΙΕΣ` : '\nΌλοι οι έλεγχοι πέρασαν.');
process.exit(failures ? 1 : 0);

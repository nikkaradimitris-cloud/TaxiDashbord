/**
 * Αρχείο Excel (.xlsx) χωρίς εξωτερική βιβλιοθήκη: ένα zip με τα XML της μορφής Office Open XML.
 * Αρκεί για απλούς πίνακες: κείμενο, αριθμοί, ποσά σε ευρώ, έντονη σταθερή πρώτη γραμμή, πλάτος
 * στηλών. Τα μέρη του είναι όσα γράφει και το ίδιο το Excel (κείμενα στον κοινό πίνακα
 * «sharedStrings», ιδιότητες εγγράφου, διαστάσεις καρτέλας): κάποιες εφαρμογές του κινητού δεν
 * διαβάζουν κείμενα γραμμένα μέσα στο κελί. Ανοίγει σε Excel, Google Sheets, Numbers, LibreOffice.
 */

export type Cell = string | number | null | undefined;

export interface SheetColumn {
  header: string;
  /** Πλάτος σε χαρακτήρες. */
  width?: number;
  /** Ποσό σε ευρώ: «1.234,56». */
  money?: boolean;
}

export interface Sheet {
  /** Έως 31 χαρακτήρες, χωρίς []:*?/\ */
  name: string;
  columns: SheetColumn[];
  rows: Cell[][];
  /** Η πρώτη γραμμή είναι επικεφαλίδα (έντονη, μένει σταθερή στην κύλιση). */
  header?: boolean;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const encoder = new TextEncoder();

// Χαρακτήρες που δεν επιτρέπονται σε XML (εκτός από tab και αλλαγή γραμμής).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → «A», 25 → «Z», 26 → «AA». */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Στυλ: 0 κανονικό, 1 επικεφαλίδα (έντονα, γκρι φόντο), 2 ποσό (#,##0.00).
const STYLES =
  XML_DECLARATION +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Κοινός πίνακας κειμένων: κάθε κείμενο γράφεται μία φορά και τα κελιά έχουν τη θέση του. */
interface SharedStrings {
  index: Map<string, number>;
  /** Πόσα κελιά έχουν κείμενο. */
  count: number;
}

function sharedString(strings: SharedStrings, text: string): number {
  strings.count++;
  let at = strings.index.get(text);
  if (at === undefined) {
    at = strings.index.size;
    strings.index.set(text, at);
  }
  return at;
}

function cellXml(ref: string, value: Cell, style: number, strings: SharedStrings): string {
  if (value === null || value === undefined || value === '') return '';
  const s = style ? ` s="${style}"` : '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
  }
  return `<c r="${ref}"${s} t="s"><v>${sharedString(strings, value)}</v></c>`;
}

function sheetXml(sheet: Sheet, strings: SharedStrings): string {
  const header = sheet.header ?? true;
  const cols = sheet.columns
    .map((column, i) => `<col min="${i + 1}" max="${i + 1}" width="${column.width ?? 14}" customWidth="1"/>`)
    .join('');
  const rows: string[] = [];
  const all = header ? [sheet.columns.map((column) => column.header), ...sheet.rows] : sheet.rows;
  let width = sheet.columns.length;
  all.forEach((row, r) => {
    width = Math.max(width, row.length);
    const isHeader = header && r === 0;
    const cells = row
      .map((value, c) => {
        const style = isHeader ? 1 : sheet.columns[c]?.money && typeof value === 'number' ? 2 : 0;
        return cellXml(`${columnName(c)}${r + 1}`, value, style, strings);
      })
      .join('');
    rows.push(`<row r="${r + 1}">${cells}</row>`);
  });
  // Η περιοχή της καρτέλας (π.χ. «A1:V7»), όπως τη γράφει το Excel.
  const dimension = all.length && width ? `A1:${columnName(width - 1)}${all.length}` : 'A1';
  const pane = header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  return (
    XML_DECLARATION +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="${dimension}"/>${pane}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}` +
    `<sheetData>${rows.join('')}</sheetData>` +
    '</worksheet>'
  );
}

function sharedStringsXml(strings: SharedStrings): string {
  const items = [...strings.index.keys()].map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`);
  return (
    XML_DECLARATION +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.count}" uniqueCount="${items.length}">` +
    `${items.join('')}</sst>`
  );
}

// Ιδιότητες εγγράφου (Αρχείο → Πληροφορίες στο Excel).
const CORE_PROPERTIES =
  XML_DECLARATION +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  '<dc:creator>Taxi Fleet Tracker</dc:creator></cp:coreProperties>';
const APP_PROPERTIES =
  XML_DECLARATION +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
  '<Application>Taxi Fleet Tracker</Application></Properties>';

const OFFICE_TYPE = 'application/vnd.openxmlformats-officedocument';
const RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Σύνδεσμοι rId1, rId2, … με τη σειρά που δίνονται. */
function relationshipsXml(links: { type: string; target: string }[]): string {
  return (
    XML_DECLARATION +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    links.map(({ type, target }, i) => `<Relationship Id="rId${i + 1}" Type="${type}" Target="${target}"/>`).join('') +
    '</Relationships>'
  );
}

export function buildXlsx(sheets: Sheet[]): Uint8Array<ArrayBuffer> {
  const strings: SharedStrings = { index: new Map(), count: 0 };
  // Πρώτα οι καρτέλες: μαζεύουν τα κείμενα του κοινού πίνακα.
  const worksheets = sheets.map((sheet, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    content: sheetXml(sheet, strings),
  }));
  const contentTypes: [part: string, type: string][] = [
    ['docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
    ['docProps/app.xml', `${OFFICE_TYPE}.extended-properties+xml`],
    ['xl/workbook.xml', `${OFFICE_TYPE}.spreadsheetml.sheet.main+xml`],
    ['xl/styles.xml', `${OFFICE_TYPE}.spreadsheetml.styles+xml`],
    ['xl/sharedStrings.xml', `${OFFICE_TYPE}.spreadsheetml.sharedStrings+xml`],
    ...worksheets.map(({ name }): [string, string] => [name, `${OFFICE_TYPE}.spreadsheetml.worksheet+xml`]),
  ];
  const files: { name: string; content: string }[] = [
    {
      name: '[Content_Types].xml',
      content:
        XML_DECLARATION +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        contentTypes.map(([part, type]) => `<Override PartName="/${part}" ContentType="${type}"/>`).join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content: relationshipsXml([
        { type: `${RELATIONSHIP}/officeDocument`, target: 'xl/workbook.xml' },
        {
          type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
          target: 'docProps/core.xml',
        },
        { type: `${RELATIONSHIP}/extended-properties`, target: 'docProps/app.xml' },
      ]),
    },
    { name: 'docProps/core.xml', content: CORE_PROPERTIES },
    { name: 'docProps/app.xml', content: APP_PROPERTIES },
    {
      name: 'xl/workbook.xml',
      content:
        XML_DECLARATION +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RELATIONSHIP}">` +
        '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      // Οι καρτέλες είναι οι rId1…rIdN, όπως στο workbook.xml.
      name: 'xl/_rels/workbook.xml.rels',
      content: relationshipsXml([
        ...worksheets.map((_, i) => ({ type: `${RELATIONSHIP}/worksheet`, target: `worksheets/sheet${i + 1}.xml` })),
        { type: `${RELATIONSHIP}/styles`, target: 'styles.xml' },
        { type: `${RELATIONSHIP}/sharedStrings`, target: 'sharedStrings.xml' },
      ]),
    },
    { name: 'xl/styles.xml', content: STYLES },
    { name: 'xl/sharedStrings.xml', content: sharedStringsXml(strings) },
    ...worksheets,
  ];
  return zipStore(files.map((file) => ({ name: file.name, data: encoder.encode(file.content) })));
}

// ---------------------------------------------------------------------
// Zip χωρίς συμπίεση (μέθοδος «store»): αρκεί για το Excel και είναι απλό.
// ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Σταθερή ημερομηνία αρχείων μέσα στο zip (1/1/2026): ίδιο αποτέλεσμα κάθε φορά.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // ονόματα σε UTF-8
    local.setUint16(8, 0, true); // χωρίς συμπίεση
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, file.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, DOS_TIME, true);
    central.setUint16(14, DOS_DATE, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + size;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

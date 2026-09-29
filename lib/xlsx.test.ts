import { crc32 as nodeCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildXlsx, columnName, crc32, escapeXml, zipStore } from './xlsx';

/** Διαβάζει ένα zip χωρίς συμπίεση (όπως αυτά που φτιάχνει το zipStore) από τον κατάλογό του. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const endAt = bytes.length - 22;
  expect(view.getUint32(endAt, true)).toBe(0x06054b50);
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    expect(view.getUint16(at + 10, true)).toBe(0); // χωρίς συμπίεση
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    at += 46 + nameLength;
  }
  return files;
}

/** Οι καρτέλες με τις τιμές τους (τα κείμενα από τον κοινό πίνακα), κενά κελιά ως null. */
function readSheets(files: Map<string, string>): { name: string; rows: (string | number | null)[][] }[] {
  const decode = (text: string) =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const columnIndex = (letters: string) => [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  const shared = [...files.get('xl/sharedStrings.xml')!.matchAll(/<si><t[^>]*>(.*?)<\/t><\/si>/g)].map((m) => decode(m[1]));
  const names = [...files.get('xl/workbook.xml')!.matchAll(/<sheet name="([^"]*)"/g)].map((m) => decode(m[1]));
  return names.map((name, i) => {
    const xml = files.get(`xl/worksheets/sheet${i + 1}.xml`)!;
    const [, lastColumn, lastRow] = xml.match(/<dimension ref="A1:([A-Z]+)(\d+)"\/>/)!;
    const rows = Array.from({ length: Number(lastRow) }, () =>
      Array<string | number | null>(columnIndex(lastColumn) + 1).fill(null),
    );
    for (const [, column, row, attributes, value] of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)><v>([^<]*)<\/v><\/c>/g)) {
      rows[Number(row) - 1][columnIndex(column)] = attributes.includes('t="s"') ? shared[Number(value)] : Number(value);
    }
    return { name, rows };
  });
}

describe('Excel (.xlsx) χωρίς βιβλιοθήκη', () => {
  it('CRC32 ίδιο με του Node', () => {
    for (const text of ['', 'a', 'Καθαρό ταμείο 301,40 €', 'x'.repeat(10_000)]) {
      const data = new TextEncoder().encode(text);
      expect(crc32(data)).toBe(nodeCrc32(data));
    }
  });

  it('ονόματα στηλών A…Z, AA…', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('κείμενο ασφαλές για XML', () => {
    expect(escapeXml('Α & Β <Γ> "Δ"\u0001\n')).toBe('Α &amp; Β &lt;Γ&gt; &quot;Δ&quot;\n');
  });

  it('zip που διαβάζεται ξανά (ελληνικά ονόματα αρχείων)', () => {
    const files = unzip(
      zipStore([
        { name: 'α.txt', data: new TextEncoder().encode('Γειά') },
        { name: 'b/c.xml', data: new TextEncoder().encode('<x/>') },
      ]),
    );
    expect([...files]).toEqual([
      ['α.txt', 'Γειά'],
      ['b/c.xml', '<x/>'],
    ]);
  });

  it('βιβλίο εργασίας με καρτέλες, κεφαλίδα, αριθμούς και ποσά', () => {
    const files = unzip(
      buildXlsx([
        { name: 'Πληροφορίες', header: false, columns: [{ header: '' }, { header: '' }], rows: [['Βάρδιες', 2]] },
        {
          name: 'Βάρδιες',
          columns: [{ header: 'Αριθμός Ζ', width: 10 }, { header: 'Καθαρά έσοδα €', money: true }, { header: 'Σημείωση' }],
          rows: [
            ['101', 160.39, 'Α & Β'],
            ['102', 0, null],
            ['103', 5, 'Α & Β'],
          ],
        },
      ]),
    );
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/sharedStrings.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    // Κάθε μέρος έχει τύπο και κάθε σύνδεσμος δείχνει σε μέρος που υπάρχει.
    const overrides = [...files.get('[Content_Types].xml')!.matchAll(/PartName="\/([^"]+)"/g)].map((match) => match[1]);
    expect(overrides.sort()).toEqual(
      [...files.keys()].filter((name) => name !== '[Content_Types].xml' && !name.endsWith('.rels')).sort(),
    );
    for (const [rels, folder] of [
      ['_rels/.rels', ''],
      ['xl/_rels/workbook.xml.rels', 'xl/'],
    ]) {
      for (const [, target] of files.get(rels)!.matchAll(/Target="([^"]+)"/g)) expect(files.has(folder + target)).toBe(true);
    }
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Πληροφορίες" sheetId="1" r:id="rId1"/>');
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Βάρδιες" sheetId="2" r:id="rId2"/>');
    expect(files.get('xl/_rels/workbook.xml.rels')).toContain('Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"');

    // Όλα τα κείμενα στον κοινό πίνακα, μία φορά το καθένα (όπως τα γράφει το Excel).
    for (const content of files.values()) expect(content).not.toContain('inlineStr');
    const sst = files.get('xl/sharedStrings.xml')!;
    expect(sst).toContain('count="9" uniqueCount="8"');
    expect(sst.match(/<t xml:space="preserve">Α &amp; Β<\/t>/g)).toHaveLength(1);

    const [info, shifts] = readSheets(files);
    expect(info).toEqual({ name: 'Πληροφορίες', rows: [['Βάρδιες', 2]] });
    // Ο αριθμός Ζ μένει κείμενο (π.χ. «007»)· τα ποσά είναι αριθμοί.
    expect(shifts).toEqual({
      name: 'Βάρδιες',
      rows: [
        ['Αριθμός Ζ', 'Καθαρά έσοδα €', 'Σημείωση'],
        ['101', 160.39, 'Α & Β'],
        ['102', 0, null],
        ['103', 5, 'Α & Β'],
      ],
    });

    const sheet = files.get('xl/worksheets/sheet2.xml')!;
    expect(sheet).toContain('<dimension ref="A1:C4"/>');
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toMatch(/<c r="A1" s="1" t="s"><v>\d+<\/v><\/c>/); // κεφαλίδα: έντονη
    expect(sheet).toContain('<c r="B2" s="2"><v>160.39</v></c>'); // ποσό σε ευρώ
    expect(sheet).toContain('<c r="B3" s="2"><v>0</v></c>');
    expect(sheet).not.toContain('r="C3"');
    expect(sheet.match(/<row /g)).toHaveLength(4);

    const infoSheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(infoSheet).toContain('<dimension ref="A1:B1"/>');
    expect(infoSheet).not.toContain('<pane');
    expect(infoSheet).toContain('<c r="B1"><v>2</v></c>');
  });
});

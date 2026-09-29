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
          ],
        },
      ]),
    );
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Πληροφορίες" sheetId="1" r:id="rId1"/>');
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Βάρδιες" sheetId="2" r:id="rId2"/>');
    expect(files.get('[Content_Types].xml')).toContain('/xl/worksheets/sheet2.xml');

    const sheet = files.get('xl/worksheets/sheet2.xml')!;
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Αριθμός Ζ</t></is></c>');
    // Ο αριθμός Ζ μένει κείμενο (π.χ. «007»)· τα ποσά είναι αριθμοί με μορφή ευρώ.
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">101</t></is></c>');
    expect(sheet).toContain('<c r="B2" s="2"><v>160.39</v></c>');
    expect(sheet).toContain('<c r="B3" s="2"><v>0</v></c>');
    expect(sheet).toContain('<t xml:space="preserve">Α &amp; Β</t>');
    expect(sheet).not.toContain('r="C3"');
    expect(sheet.match(/<row /g)).toHaveLength(3);

    const info = files.get('xl/worksheets/sheet1.xml')!;
    expect(info).not.toContain('<pane');
    expect(info).toContain('<c r="B1"><v>2</v></c>');
  });
});

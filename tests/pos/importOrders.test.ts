import { describe, it, expect } from 'vitest';
import { importOrders, detectMapping } from '../../src/pos/importOrders';

const H = 'Order Id,Opened,# of Guests,Tab Names,Table,Dining Area,Dining Options,Amount,Voided,Paid,Closed';
const csv = [
  H,
  '1,10/29/26 6:15 PM,2,Alice Smith,T5,Main,Dine In,"$1,234.50",false,10/29/26 7:45 PM,10/29/26 7:50 PM',
  '2,10/30/26 12:30 AM,4,Bob,T6,Bar,Dine In,$80.00,false,10/30/26 1:30 AM,',
  '3,10/29/26 7:00 PM,2,Carol,T7,Main,Dine In,$50,true,10/29/26 8:00 PM,',
  '4,10/29/26 7:00 PM,2,Dan,,Main,Take Out,$50,false,10/29/26 7:20 PM,',
  '5,10/29/26 7:00 PM,,Eve,T8,Main,Dine In,$50,false,10/29/26 8:00 PM,',
  '6,10/29/26 7:00 PM,2,Fay,T9,Main,Dine In,$50,false,,',
  '7,2026-11-05T18:00:30,3,Gus,T1,Main,Dine In,,false,2026-11-05 19:10,',
].join('\n');

describe('importOrders', () => {
  const r = importOrders(csv);
  it('counts and exclusions', () => {
    expect(r.report.rowsRead).toBe(7);
    expect(r.report.rowsUsed).toBe(3);
    expect(r.report.excluded).toEqual({ voided: 1, notDineIn: 1, missingGuests: 1, invalidTimestamp: 0, missingClose: 1, invalidDuration: 0, outlierDuration: 0 });
    expect(r.report.dateRange).toEqual(['2026-10-29', '2026-11-05']);
    expect(r.report.isSample).toBe(false);
  });
  it('parses rows', () => {
    expect(r.rows[0]).toMatchObject({ id: 'r0', businessDate: '2026-10-29', dow: 4, checkOpenMin: 1095, checkCloseMin: 1185, guests: 2, net: 1234.5, table: 'T5', area: 'Main' });
    expect(r.rows[1]).toMatchObject({ businessDate: '2026-10-29', dow: 4, checkOpenMin: 1470, checkCloseMin: 1530 });
    expect(r.rows[2]).toMatchObject({ businessDate: '2026-11-05', checkOpenMin: 1080, checkCloseMin: 1150, net: 0 });
  });
  it('never leaks other fields', () => {
    expect(JSON.stringify(r.rows)).not.toMatch(/Alice|Bob|Tab Names/i);
    const allowed = ['id', 'businessDate', 'dow', 'checkOpenMin', 'checkCloseMin', 'guests', 'table', 'area', 'net'];
    for (const row of r.rows) expect(Object.keys(row).every((k) => allowed.includes(k))).toBe(true);
  });
  it('warns on thin history', () => {
    expect(r.report.warnings.some(w => w.startsWith('Only 2 nights of history'))).toBe(true);
    expect(r.report.nightsByDow[4]).toBe(2);
  });
});

describe('detectMapping', () => {
  it('lists missing guests', () => {
    const noGuests = H.replace('# of Guests', 'Foo');
    const d = detectMapping(noGuests.split(','));
    expect(d.mapping).toBeNull();
    expect(d.missing).toEqual(['guests']);
    const res = importOrders(noGuests + '\n');
    expect(res.rows).toEqual([]);
    expect(res.report.warnings[0]).toMatch(/^Required columns not found: guests./);
  });
  it('prefers Paid over Closed', () => {
    expect(detectMapping(H.split(',')).mapping?.closed).toBe('Paid');
  });
});

describe('importOrders: dirty real-world exports', () => {
  const csv = '﻿Opened,# of Guests,Amount,Paid,Closed,Dining Options\r\n'
    + '2026-10-29 18:15:00,2,"$1,234.50",2026-10-29 19:05:00,,Dine In\r\n'          // ISO + seconds + currency with comma
    + '10-29-2026 6:20 p.m.,3,(12.00),10-29-2026 7:30 p.m.,,Dine In\r\n'           // dash date, p.m., negative in parens
    + '2026/10/29 18:30,4,abc,,2026/10/29 19:40,Dine In\r\n'                         // slash ISO, empty Paid -> Closed fallback, bad amount
    + '2026-10-29T18:40:00Z,2,20,,,Dine In\r\n'                                      // no close at all -> excluded, not imputed
    + 'yesterday,2,20,2026-10-29 19:00,,Dine In\r\n'                                 // unreadable open
    + '\r\n   \r\n\r\n';                                                              // trailing blank lines
  const r = importOrders(csv);

  it('strips the BOM so headers are detected', () => {
    expect(r.mapping?.opened).toBe('Opened');
    expect(r.headers[0]).toBe('Opened');
  });
  it('parses ISO, dash, slash and a.m./p.m. formats; ignores trailing blank lines', () => {
    expect(r.report.rowsRead).toBe(5);
    expect(r.rows.map(x => x.checkOpenMin)).toEqual([18 * 60 + 15, 18 * 60 + 20, 18 * 60 + 30]);
    expect(r.rows[2].checkCloseMin).toBe(19 * 60 + 40);
  });
  it('parses currency symbols, thousands separators and parenthesized negatives', () => {
    expect(r.rows.map(x => x.net)).toEqual([1234.5, -12, 0]);
  });
  it('excludes (never imputes) checks without a close time and explains every exclusion', () => {
    expect(r.report.excluded.missingClose).toBe(1);
    expect(r.report.excluded.invalidTimestamp).toBe(1);
    const w = r.report.warnings.join('\n');
    expect(w).toMatch(/no readable Paid\/Closed time.*not guessed/);
    expect(w).toMatch(/unreadable Opened time \(e\.g\. "yesterday"\)/);
    expect(w).toMatch(/1 amount\(s\) could not be read \(e\.g\. "abc"\)/);
  });
  it('gives actionable guidance when required columns are missing', () => {
    const bad = importOrders('Date,Total\n10/29/26,20\n');
    expect(bad.mapping).toBeNull();
    expect(bad.report.warnings[0]).toMatch(/Map them by hand.*Columns found: Date, Total/);
  });
});

describe('importOrders: final audit edge cases', async () => {
  const { reconstructHistory } = await import('../../src/model/reconstruct');
  const { harborCurrentLayout, DEFAULT_TABLE_USE } = await import('../../src/scenarios/presets');
  const csv = '﻿Order Id,Opened,# of Guests,Table,Dining Options,Amount,Voided,Paid,Closed\r\n'
    + '1,10/29/26 6:00 PM,2,T1,Dine In,$50.00,false,10/29/26 7:00 PM,\r\n'
    + '2,10/29/26 6:05 PM,0,T2,Dine In,$20.00,false,10/29/26 6:30 PM,\r\n'
    + '3,10/29/26 6:10 PM,2,T3,Dine In,-$15.00,false,10/29/26 6:50 PM,\r\n'
    + '4,10/29/26 6:10 PM,2,T4,Dine In,$-15.00,false,10/29/26 6:50 PM,\r\n'
    + '5,10/29/26 6:10 PM,2,T5,Dine In,(15.00),false,10/29/26 6:50 PM,\r\n'
    + '6,10/29/26 6:20 PM,4,T6,Dine In,$80.00,false,10/29/26 7:30 PM,\r\n'
    + '7,10/29/26 6:21 PM,2,T6,Dine In,$40.00,false,10/29/26 7:31 PM,\r\n'
    + '8,10/29/26 11:30 PM,2,T7,Dine In,$30.00,false,10/30/26 12:40 AM,\r\n'
    + '\r\n\r\n';
  const r = importOrders(csv);
  const w = r.report.warnings.join('\n');

  it('zero-cover rows are excluded with an accurate reason, not silently', () => {
    expect(r.report.excluded.missingGuests).toBe(1);
    expect(w).toMatch(/missing or zero guest count/);
  });
  it('all negative-amount spellings keep their sign and are disclosed, not dropped', () => {
    expect(r.rows.filter(x => ['r2', 'r3', 'r4'].includes(x.id)).map(x => x.net)).toEqual([-15, -15, -15]);
    expect(w).toMatch(/3 kept check\(s\) have negative amounts/);
  });
  it('split/overlapping checks on one table stay separate parties and are disclosed', () => {
    expect(r.rows.filter(x => x.table === 'T6')).toHaveLength(2);
    const h = reconstructHistory(r.rows, DEFAULT_TABLE_USE, harborCurrentLayout());
    expect(h.sameTableOverlaps).toBe(1);
    expect(h.warnings.join(' ')).toMatch(/kept as separate parties.*does not merge/);
  });
  it('a check closing after midnight keeps a positive duration on its business date', () => {
    const late = r.rows.find(x => x.id === 'r7')!;
    expect(late.businessDate).toBe('2026-10-29');
    expect([late.checkOpenMin, late.checkCloseMin]).toEqual([1410, 1480]);
  });
});

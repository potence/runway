import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importOrders } from '../../src/pos/importOrders';

// The files under public/demo are what the landing page offers for download; uploading them must just work.
const load = (name: string) => importOrders(readFileSync(`public/demo/${name}`, 'utf8'));

describe('downloadable demo CSVs (synthetic)', () => {
  it('full export: auto-maps, flags itself as sample, discloses split checks and refunds', () => {
    const { report, mapping } = load('harbor-table-synthetic-pos-export.csv');
    expect(mapping).not.toBeNull();
    expect(report.isSample).toBe(true);
    expect(report.rowsUsed).toBeGreaterThan(2300);
    expect(report.excluded.missingGuests).toBeGreaterThan(0); // zero-cover refund rows
  });
  it('saturdays: only Saturday nights', () => {
    const { report } = load('harbor-table-synthetic-saturdays.csv');
    expect(report.isSample).toBe(true);
    expect(report.nightsByDow).toEqual([0, 0, 0, 0, 0, 0, 16]);
  });
  it('messy export: parses BOM/CRLF/mixed timestamps/currency and warns about missing close times', () => {
    const { report, mapping } = load('harbor-table-synthetic-messy-export.csv');
    expect(mapping).not.toBeNull();
    expect(report.isSample).toBe(true);
    expect(report.excluded.invalidTimestamp).toBe(0);
    expect(report.excluded.missingClose).toBeGreaterThan(0);
    expect(report.warnings.some(w => /Paid|Closed/.test(w))).toBe(true);
    expect(report.rowsUsed).toBeGreaterThan(600);
  });
});

describe('12-table mix profile CSV (synthetic, illustrative parameters)', () => {
  const { rows, report, mapping } = load('table-mix-profile-synthetic.csv');
  it('uploads cleanly with auto-mapped columns and the sample flag', () => {
    expect(mapping).not.toBeNull();
    expect(report.isSample).toBe(true);
    expect(report.rowsUsed).toBe(report.rowsRead);
  });
  it('has the stated party mix and check length (within sampling noise)', () => {
    const share = (f: (g: number) => boolean) => rows.filter(r => f(r.guests)).length / rows.length;
    expect(share(g => g <= 2)).toBeGreaterThan(0.45);
    expect(share(g => g >= 5)).toBeLessThan(0.2);
    const meanDur = rows.reduce((s, r) => s + r.checkCloseMin - r.checkOpenMin, 0) / rows.length;
    expect(meanDur).toBeGreaterThan(60);
    expect(meanDur).toBeLessThan(75);
  });
});

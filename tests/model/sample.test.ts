import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importOrders } from '../../src/pos/importOrders';
import { reconstructHistory } from '../../src/model/reconstruct';
import { fitDemandModel } from '../../src/model/demand';
import * as P from '../../src/scenarios/presets';

const truth = JSON.parse(readFileSync('tests/fixtures/harbor-truth.json', 'utf8'));
const imp = importOrders(readFileSync('src/sample/harbor-table-orderdetails.csv', 'utf8'), undefined, { isSample: true });

describe('synthetic sample (Layer C: internal consistency only)', () => {
  it('imports, drops PII and takeout, flags sample', () => {
    expect(imp.report.isSample).toBe(true);
    expect(imp.report.excluded.notDineIn).toBe(truth.nights.length * 4);
    expect(Object.keys(imp.rows[0])).not.toContain('Tab Names');
  });
  it('recorded checks are censored: never exceed latent demand, and walkaways are absent from POS', () => {
    const byDate = new Map<string, number>();
    imp.rows.forEach(r => byDate.set(r.businessDate, (byDate.get(r.businessDate) ?? 0) + 1));
    for (const n of truth.nights) expect(byDate.get(n.date) ?? 0).toBeLessThanOrEqual(n.latentParties);
    const walk = truth.nights.reduce((s: number, n: { walkaways: number }) => s + n.walkaways, 0);
    expect(walk).toBeGreaterThan(0);
  });
  it('reconstruction flags capacity-limited nights; it does not estimate walkaways', () => {
    const h = reconstructHistory(imp.rows, P.DEFAULT_TABLE_USE, P.harborCurrentLayout(), P.DEFAULT_WINDOW);
    expect(h.nights.length).toBe(truth.nights.length);
    expect(h.capacityLimitedNights).toBeGreaterThan(0);
    expect(h.nightsAboveConfiguredSeats).toBe(0);
    expect(JSON.stringify(h)).not.toMatch(/walk|abandon|arriv/i);
  });
  it('bootstrap pool reproduces the seated party-size mix (sizes 1-6 only)', () => {
    const m = fitDemandModel(imp.rows, P.DEFAULT_WINDOW, P.DEFAULT_TABLE_USE);
    expect(m.supportNights).toBe(truth.nights.length);
    expect(Math.abs(m.timingShape.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-9);
    expect(Math.max(...m.checkPool.map(c => c.guests))).toBeLessThanOrEqual(6);
  });
});

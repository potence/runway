import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { RadarContext } from '../../src/domain/types';
import { importOrders } from '../../src/pos/importOrders';
import { buildRadar, toDemandScenario } from '../../src/radar/radar';
import * as P from '../../src/scenarios/presets';

const imp = importOrders(readFileSync('src/sample/harbor-table-orderdetails.csv', 'utf8'), undefined, { isSample: true });
const ctx: RadarContext = {
  holidays: [{ date: '2026-11-05', name: 'Test holiday' }],
  events: [{ date: '2026-11-07', name: 'Owner event', assumedMultiplier: 1.2 }],
  schoolBreaks: [],
  weather: [{ date: '2026-11-06', summary: 'Rain', highF: 60, precipPct: 80, source: 'fixture' }],
  weatherCoverage: { source: 'Weather fixture', status: 'fixture', note: 'fixture' },
  isFixture: true,
};
const { days, backtest } = buildRadar(imp.rows, ctx, '2026-11-04', P.DEFAULT_WINDOW, P.DEFAULT_TABLE_USE, true);

describe('Rush Radar-Lite', () => {
  it('forecasts 7 days; closed weekdays are Insufficient and cannot be simulated', () => {
    expect(days).toHaveLength(7);
    const mon = days.find(d => d.dow === 1)!;
    expect(mon.confidence).toBe('Insufficient');
    expect(toDemandScenario(mon, P.DEFAULT_WINDOW)).toBeNull();
  });
  it('uses empirical ranges, never High confidence; weather and holidays are flag-only at 1.00x', () => {
    for (const d of days) expect(['Insufficient', 'Low', 'Medium']).toContain(d.confidence);
    const thu = days.find(d => d.date === '2026-11-05')!;
    const fri = days.find(d => d.date === '2026-11-06')!;
    expect(thu.rangeKind).toBe('empirical_p10_p90');
    expect(thu.factors.every(f => f.evidence === 'FlagOnly' && f.multiplier === 1)).toBe(true);
    expect(fri.factors.find(f => f.factor === 'weather')!.multiplier).toBe(1);
  });
  it('applies only owner-entered Assumed multipliers', () => {
    const sat = days.find(d => d.date === '2026-11-07')!;
    const ev = sat.factors.find(f => f.factor === 'event')!;
    expect(ev.evidence).toBe('Assumed');
    const base = buildRadar(imp.rows, { ...ctx, events: [] }, '2026-11-04', P.DEFAULT_WINDOW, P.DEFAULT_TABLE_USE, true).days.find(d => d.date === '2026-11-07')!;
    expect(sat.parties!.mid).toBe(Math.round(base.parties!.mid * 1.2));
    expect(base.coverage.find(c => c.source === 'Owner-entered events')!.note).toBe('No events listed; coverage is incomplete.');
  });
  it('backtests against naive baselines using only prior nights', () => {
    expect(backtest).not.toBeNull();
    expect(backtest!.nights).toBeGreaterThan(0);
    const sc = toDemandScenario(days.find(d => d.date === '2026-11-06')!, P.DEFAULT_WINDOW)!;
    expect(sc.target).toBe('recorded_parties');
    expect(sc.window.dows).toEqual([5]);
  });
});

describe('outlook weather coverage', async () => {
  const { buildRadar, loadSample, importOrders, emptyContext, DEFAULT_WINDOW, DEFAULT_TABLE_USE } = await import('../../src/api');
  const { sampleWeatherFor } = await import('../../src/radar/sources/sampleWeather');
  const { rows } = importOrders(loadSample().csvText, undefined, { isSample: true });

  it('every one of the 7 days has a weather line, labeled sample when no live data covers it', () => {
    const out = buildRadar(rows, emptyContext(), '2026-11-04', DEFAULT_WINDOW, DEFAULT_TABLE_USE, true);
    expect(out.days).toHaveLength(7);
    for (const d of out.days) {
      const w = d.factors.find(f => f.factor === 'weather')!;
      expect(w.multiplier).toBe(1);
      expect(w.reason).toMatch(/sample forecast, not live/);
    }
  });
  it('keeps live entries and only fills gaps; sample weather is deterministic per date', () => {
    const ctx = { ...emptyContext(), weather: [{ date: '2026-11-05', summary: 'Sunny', highF: 70, precipPct: 0, source: 'nws' as const }],
      weatherCoverage: { source: 'National Weather Service', status: 'live' as const, note: 'Live.' } };
    const out = buildRadar(rows, ctx, '2026-11-04', DEFAULT_WINDOW, DEFAULT_TABLE_USE, true);
    const reasons = out.days.map(d => d.factors.find(f => f.factor === 'weather')!.reason);
    expect(reasons.filter(r => /live NWS/.test(r))).toHaveLength(1);
    expect(out.days[0].coverage.find(c => c.source === 'National Weather Service')!.note).toMatch(/6 day\(s\) outside the live forecast/);
    expect(sampleWeatherFor('2026-11-07')).toEqual(sampleWeatherFor('2026-11-07'));
  });
});

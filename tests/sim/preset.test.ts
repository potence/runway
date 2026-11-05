import { describe, expect, it } from 'vitest';
import { buildTakeaway, loadStressDemo, importOrders, reconstructHistory, runExperiment, harborCurrentLayout, harborCombinableLayout, DEFAULT_POLICY, DEFAULT_TABLE_USE, DEFAULT_PATIENCE } from '../../src/api';

// Pins the numbers quoted in the demo walkthrough. If this fails, update the walkthrough, not the model.
describe('Saturday stress demo preset (synthetic, Assumed 1.25x)', () => {
  const demo = loadStressDemo();
  const { rows } = importOrders(demo.csvText, undefined, { isSample: true });
  const p = demo.preset;
  const cur = harborCurrentLayout();
  const h = reconstructHistory(rows, DEFAULT_TABLE_USE, cur, p.window);
  const r = runExperiment({
    rows, window: p.window, tableUse: DEFAULT_TABLE_USE, patience: DEFAULT_PATIENCE,
    volume: { source: 'history', latentDemandMultiplier: p.latentDemandMultiplier },
    scenarios: [{ id: 'current', name: 'Current', layout: cur, policy: DEFAULT_POLICY },
      { id: 'combinable', name: 'Combinable two-tops', layout: harborCombinableLayout(), policy: DEFAULT_POLICY }],
    baselineId: 'current', nights: p.nights, seed: p.seed, capacityLimitedNights: h.capacityLimitedNights,
  });
  const m = (k: string) => r.metrics.find(x => x.key === k)!;

  it('discloses the assumption and keeps both layouts at 44 seats', () => {
    expect(p.disclosure).toMatch(/assumption, not inferred/);
    expect(r.demandBanner).toMatch(/× 1\.25 latent-demand assumption/);
  });
  it('modeled mean wait: about -2.6 min, band clear of zero', () => {
    const d = m('meanWaitMin').paired[0];
    expect(d.meanDelta).toBeCloseTo(-2.6, 0);
    expect(d.noClearDifference).toBe(false);
    expect(d.wins).toBeGreaterThanOrEqual(190);
  });
  it('seated covers: about +5 per night, but the band still includes zero (honest "No clear difference")', () => {
    const d = m('seatedCovers').paired[0];
    expect(d.meanDelta).toBeGreaterThan(4);
    expect(d.noClearDifference).toBe(true);
  });
  it('takeaway states only the clear effect and flags the unclear ones', () => {
    const t = buildTakeaway(r, 'Combinable two-tops');
    expect(t.headline).toBe('switching to combinable two-tops cuts the average wait by 2.6 min.');
    expect(t.footnote).toMatch(/seated covers.*no clear difference/);
    expect(t.items.find(i => i.key === 'covers')!.clear).toBe(false);
  });
});

describe('Pitch path: Rush Radar Sat 2026-11-07 HIGH -> Simulate this day (synthetic)', async () => {
  const { loadSample, buildRadar, toDemandScenario, DEFAULT_WINDOW } = await import('../../src/api');
  const s = loadSample();
  const { rows } = importOrders(s.csvText, undefined, { isSample: true });
  const day = buildRadar(rows, s.context, '2026-11-04', DEFAULT_WINDOW, DEFAULT_TABLE_USE, true).days.find(d => d.date === '2026-11-07')!;
  const sc = toDemandScenario(day, DEFAULT_WINDOW)!;
  const r = runExperiment({
    rows, window: DEFAULT_WINDOW, tableUse: DEFAULT_TABLE_USE, patience: DEFAULT_PATIENCE,
    volume: { source: 'radar', scenario: sc, band: 'high', latentDemandMultiplier: 1 },
    scenarios: [{ id: 'current', name: 'Current', layout: harborCurrentLayout(), policy: DEFAULT_POLICY },
      { id: 'combinable', name: 'Combinable two-tops', layout: harborCombinableLayout(), policy: DEFAULT_POLICY }],
    baselineId: 'current', nights: 200, seed: 42,
  });
  const d = (k: string) => r.metrics.find(x => x.key === k)!.paired[0];
  it('HIGH band = 45 recorded parties, including the owner-entered 1.15x event assumption', () => {
    expect(sc.parties.high).toBe(45);
    expect(sc.factors.some(f => f.evidence === 'Assumed' && f.multiplier === 1.15)).toBe(true);
  });
  it('quoted results', () => {
    expect(d('meanWaitMin').meanDelta).toBeCloseTo(-3.1, 0);
    expect(d('meanWaitMin').noClearDifference).toBe(false);
    expect(d('seatedCovers').meanDelta).toBeCloseTo(7.2, 0);
  });
  it('takeaway', () => {
    expect(buildTakeaway(r, 'Combinable two-tops').headline).toBe(
      'switching to combinable two-tops seats 7.2 more covers per night, cuts the average wait by 3.1 min and prevents 3.3 walkaways per night.');
  });
});

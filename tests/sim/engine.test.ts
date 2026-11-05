import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Layout, ModeledParty, Policy, ServiceWindow } from '../../src/domain/types';
import { simulateNight } from '../../src/sim/engine';
import { snapshotAt } from '../../src/sim/timeline';
import { mulberry32 } from '../../src/model/rng';
import { fitDemandModel, generateNights } from '../../src/model/demand';
import { importOrders } from '../../src/pos/importOrders';
import * as P from '../../src/scenarios/presets';

const W: ServiceWindow = { dows: [3], startMin: 0, endMin: 1000 };
const POL: Policy = { nesting: 'full', allowJoins: true, resetMin: 5, joinSetupMin: 3 };
const party = (id: string, t: number, size: number, use: number, patience = 1e9): ModeledParty =>
  ({ id, demandArriveMin: t, size, tableUseMin: use, patienceMin: patience, net: 10 * size });
const one = (cap: number): Layout => ({ id: 'L', name: 'L', tables: [{ id: 'T', name: 'T', capacity: cap, x: 0, y: 0, w: 1, h: 1, shape: 'rect' }], joins: [] });

describe('engine toy cases (hand-computed)', () => {
  it('patience starts at modeled demand arrival; reset delays reuse', () => {
    const r = simulateNight([party('A', 0, 2, 30), party('B', 10, 4, 20, 15), party('C', 20, 2, 10, 60)], one(4), POL, W, { scenarioId: 's', nightIndex: 0 });
    expect(r.outcomes).toEqual({ A: 'seated', B: 'abandoned', C: 'seated' });
    const seatC = r.events.find(e => e.type === 'seat' && e.partyId === 'C')!;
    expect(seatC.t).toBe(35);                       // A departs 30 + reset 5
    expect(r.metrics.meanWaitMin).toBeCloseTo(7.5); // (0 + 15) / 2
    expect(r.events.find(e => e.type === 'abandon')!.t).toBe(25);
  });
  it('joins only when no single table fits, adding join setup', () => {
    const L: Layout = { id: 'J', name: 'J', tables: ['a', 'b'].map(id => ({ id, name: id, capacity: 2, x: 0, y: 0, w: 1, h: 1, shape: 'rect' as const })), joins: [{ a: 'a', b: 'b', joinedCapacity: 4 }] };
    const r = simulateNight([party('P', 0, 4, 60)], L, POL, W, { scenarioId: 's', nightIndex: 0 });
    const dep = r.events.find(e => e.type === 'depart')!;
    expect(dep.t).toBe(63);
    expect(r.metrics.seatWastePerParty).toBe(0);
    expect(snapshotAt(r, L, 10).tables.every(x => x.state === 'occupied' && x.joinedWith?.length === 1)).toBe(true);
  });
  it('same-size fairness: later party of same size never overtakes; different size may', () => {
    const L: Layout = { id: 'M', name: 'M', tables: [{ id: 'big', name: 'big', capacity: 6, x: 0, y: 0, w: 1, h: 1, shape: 'rect' }, { id: 'small', name: 'small', capacity: 2, x: 0, y: 0, w: 1, h: 1, shape: 'rect' }], joins: [] };
    const ps = [party('X', 0, 6, 50), party('Y', 0, 2, 50), party('B6', 1, 6, 10), party('S2', 2, 2, 10)];
    const r = simulateNight(ps, L, { ...POL, resetMin: 0 }, W, { scenarioId: 's', nightIndex: 0 });
    const seat = (id: string) => r.events.find(e => e.type === 'seat' && e.partyId === id)!.t;
    expect(seat('B6')).toBe(50);
    expect(seat('S2')).toBe(50);
  });
  it('queued parties at window close end unseatedAtClose', () => {
    const r = simulateNight([party('A', 0, 2, 2000), party('B', 1, 2, 10)], one(2), POL, W, { scenarioId: 's', nightIndex: 0 });
    expect(r.outcomes.B).toBe('unseatedAtClose');
  });
});

describe('invariants and determinism on sample-driven modeled nights', () => {
  const imp = importOrders(readFileSync('src/sample/harbor-table-orderdetails.csv', 'utf8'));
  const model = fitDemandModel(imp.rows, P.DEFAULT_WINDOW, P.DEFAULT_TABLE_USE);
  const nights = generateNights(model, { source: 'history', latentDemandMultiplier: 1.3 }, P.DEFAULT_TABLE_USE, P.DEFAULT_PATIENCE, 40, 7);
  const layouts = [P.harborCurrentLayout(), P.harborCombinableLayout()];

  it('no double booking, capacity respected, terminal states, monotone timeline', () => {
    for (const L of layouts) for (const n of nights) {
      const r = simulateNight(n.parties, L, P.DEFAULT_POLICY, P.DEFAULT_WINDOW, { scenarioId: L.id, nightIndex: n.index });
      const busy = new Set<string>();
      const cap = (ids: string[]) => ids.length === 1 ? L.tables.find(x => x.id === ids[0])!.capacity : L.joins.find(j => ids.includes(j.a) && ids.includes(j.b))!.joinedCapacity;
      let last = -Infinity;
      for (const e of r.events) {
        expect(e.t).toBeGreaterThanOrEqual(last); last = e.t;
        if (e.type === 'seat') {
          e.tableIds.forEach(id => { expect(busy.has(id)).toBe(false); busy.add(id); });
          expect(n.parties.find(p => p.id === e.partyId)!.size).toBeLessThanOrEqual(cap(e.tableIds));
          expect(e.waitMin).toBeGreaterThanOrEqual(0);
        }
        if (e.type === 'tableReady') e.tableIds.forEach(id => busy.delete(id));
      }
      expect(Object.keys(r.outcomes).length).toBe(n.parties.length);
    }
  });
  it('identical inputs give identical outputs', () => {
    const again = generateNights(model, { source: 'history', latentDemandMultiplier: 1.3 }, P.DEFAULT_TABLE_USE, P.DEFAULT_PATIENCE, 40, 7);
    expect(JSON.stringify(again)).toBe(JSON.stringify(nights));
    const a = simulateNight(nights[3].parties, layouts[0], P.DEFAULT_POLICY, P.DEFAULT_WINDOW, { scenarioId: 'x', nightIndex: 3 });
    const b = simulateNight(nights[3].parties, layouts[0], P.DEFAULT_POLICY, P.DEFAULT_WINDOW, { scenarioId: 'x', nightIndex: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('Layer B: restricted Erlang C check (M/M/c, FCFS, infinite patience)', () => {
  it('mean modeled wait matches Erlang C within 10%', () => {
    // Establishes only that the queue core matches M/M/c under these idealized conditions.
    const c = 4, meanUse = 60, lambda = 3 / 60; // offered load a = 3, rho = 0.75
    const rng = mulberry32(12345);
    const exp = (m: number) => -m * Math.log(1 - rng());
    const parties: ModeledParty[] = [];
    let t = 0;
    for (let i = 0; i < 40000; i++) { t += exp(1 / lambda); parties.push(party(`p${i}`, t, 1, exp(meanUse))); }
    const L: Layout = { id: 'E', name: 'E', tables: Array.from({ length: c }, (_, i) => ({ id: `t${i}`, name: `t${i}`, capacity: 1, x: 0, y: 0, w: 1, h: 1, shape: 'rect' as const })), joins: [] };
    const r = simulateNight(parties, L, { nesting: 'full', allowJoins: false, resetMin: 0, joinSetupMin: 0 }, { dows: [0], startMin: 0, endMin: t + 1 }, { scenarioId: 'e', nightIndex: 0 });
    const a = lambda * meanUse;
    let sum = 0, term = 1;
    for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; sum += term; }
    const last = term * a / c;                          // a^c / c!
    const pc = (last * c / (c - a)) / (sum + last * c / (c - a));
    const wq = pc / (c / meanUse - lambda);
    expect(Math.abs(r.metrics.meanWaitMin - wq) / wq).toBeLessThan(0.1);
  });
});

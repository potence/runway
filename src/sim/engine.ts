import type { Layout, MetricKey, ModeledParty, PartyOutcome, Policy, RunResult, ServiceWindow, TimelineEvent } from '../domain/types';
import { quantile } from '../model/rng';

// Deterministic discrete-event engine. No randomness: all variation comes from the ModeledParty list.
// Queue clock starts at ModeledParty.demandArriveMin (a modeled value, never a POS timestamp).
// Seating rule: first-come-first-served within party size. A later party may be seated ahead of an
// earlier party of a different size if only it fits, but never ahead of an earlier party of the same size.

type Kind = 'depart' | 'tableReady' | 'arrive' | 'patience' | 'close';
const PRIORITY: Record<Kind, number> = { depart: 0, tableReady: 0, arrive: 1, patience: 2, close: 3 };
interface Ev { t: number; pri: number; seq: number; kind: Kind; partyId?: string; tableIds?: string[] }

function push(q: Ev[], e: Ev) {
  // binary insert by (t, pri, seq)
  let lo = 0, hi = q.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    const x = q[m];
    if (x.t < e.t || (x.t === e.t && (x.pri < e.pri || (x.pri === e.pri && x.seq < e.seq)))) lo = m + 1;
    else hi = m;
  }
  q.splice(lo, 0, e);
}

interface Assignment { tableIds: string[]; capacity: number; joined: boolean }

/** Pre-sorts tables and joins once per layout; each lookup is then a linear scan with the same tie-breaks. */
function makeSeatFinder(layout: Layout, policy: Policy) {
  const tables = [...layout.tables].sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id));
  const joins = policy.allowJoins
    ? [...layout.joins].sort((a, b) => a.joinedCapacity - b.joinedCapacity || (a.a + a.b).localeCompare(b.a + b.b))
    : [];
  return (size: number, free: Set<string>): Assignment | null => {
    let minClass = Infinity;
    for (const x of tables) {
      if (x.capacity < size) continue;
      if (minClass === Infinity) minClass = x.capacity;
      if (policy.nesting === 'none' && x.capacity !== minClass) break;
      if (free.has(x.id)) return { tableIds: [x.id], capacity: x.capacity, joined: false };
    }
    for (const j of joins)
      if (j.joinedCapacity >= size && free.has(j.a) && free.has(j.b)) return { tableIds: [j.a, j.b], capacity: j.joinedCapacity, joined: true };
    return null;
  };
}

export function simulateNight(
  parties: ModeledParty[], layout: Layout, policy: Policy, window: ServiceWindow,
  meta: { scenarioId: string; nightIndex: number },
): RunResult {
  const byId = new Map(parties.map(p => [p.id, p]));
  const q: Ev[] = [];
  let seq = 0;
  const add = (e: Omit<Ev, 'pri' | 'seq'>) => push(q, { ...e, pri: PRIORITY[e.kind], seq: seq++ });
  // Arrivals are scheduled one at a time so the event queue stays small.
  const arrivals = [...parties].sort((x, y) => x.demandArriveMin - y.demandArriveMin);
  let nextArrival = 0;
  const scheduleNextArrival = () => {
    const p = arrivals[nextArrival++];
    if (p) add({ t: p.demandArriveMin, kind: 'arrive', partyId: p.id });
  };
  scheduleNextArrival();
  add({ t: window.endMin, kind: 'close' });

  const findSeat = makeSeatFinder(layout, policy);
  const free = new Set(layout.tables.map(x => x.id));
  const queue: string[] = [];   // party ids in arrival order
  const outcomes: Record<string, PartyOutcome> = {};
  const events: TimelineEvent[] = [];
  const waits: number[] = [];
  const waste: number[] = [];
  let closed = false;
  let guestMinutes = 0;
  const seatedAt = new Map<string, number>();

  const trySeat = (t: number) => {
    if (closed) return;
    const blockedSizes = new Set<number>();
    for (let i = 0; i < queue.length; ) {
      const p = byId.get(queue[i])!;
      if (blockedSizes.has(p.size)) { i++; continue; }
      const a = findSeat(p.size, free);
      if (!a) { blockedSizes.add(p.size); i++; continue; }
      queue.splice(i, 1);
      a.tableIds.forEach(id => free.delete(id));
      const waitMin = t - p.demandArriveMin;
      waits.push(waitMin);
      waste.push(a.capacity - p.size);
      outcomes[p.id] = 'seated';
      seatedAt.set(p.id, t);
      events.push({ t, type: 'seat', partyId: p.id, tableIds: a.tableIds, waitMin });
      add({ t: t + p.tableUseMin + (a.joined ? policy.joinSetupMin : 0), kind: 'depart', partyId: p.id, tableIds: a.tableIds });
    }
  };

  while (q.length) {
    const e = q.shift()!;
    const p = e.partyId ? byId.get(e.partyId) : undefined;
    switch (e.kind) {
      case 'arrive':
        queue.push(p!.id);
        scheduleNextArrival();
        events.push({ t: e.t, type: 'arrive', partyId: p!.id, size: p!.size });
        add({ t: e.t + p!.patienceMin, kind: 'patience', partyId: p!.id });
        trySeat(e.t);
        break;
      case 'patience': {
        const i = queue.indexOf(p!.id);
        if (i >= 0 && !closed) {
          queue.splice(i, 1);
          outcomes[p!.id] = 'abandoned';
          events.push({ t: e.t, type: 'abandon', partyId: p!.id, waitedMin: e.t - p!.demandArriveMin });
        }
        break;
      }
      case 'depart':
        events.push({ t: e.t, type: 'depart', partyId: p!.id, tableIds: e.tableIds! });
        add({ t: e.t + policy.resetMin, kind: 'tableReady', tableIds: e.tableIds });
        break;
      case 'tableReady':
        e.tableIds!.forEach(id => free.add(id));
        events.push({ t: e.t, type: 'tableReady', tableIds: e.tableIds! });
        trySeat(e.t);
        break;
      case 'close':
        closed = true;
        for (const id of queue) {
          outcomes[id] = 'unseatedAtClose';
          events.push({ t: e.t, type: 'unseatedAtClose', partyId: id });
        }
        queue.length = 0;
        break;
    }
    if (e.kind === 'depart') {
      const start = seatedAt.get(p!.id)!;
      guestMinutes += p!.size * Math.max(0, Math.min(e.t, window.endMin) - Math.max(start, window.startMin));
    }
  }

  const seated = parties.filter(x => outcomes[x.id] === 'seated');
  const unserved = parties.filter(x => outcomes[x.id] !== 'seated');
  const seats = layout.tables.reduce((s, x) => s + x.capacity, 0);
  const metrics: Record<MetricKey, number> = {
    seatedParties: seated.length,
    seatedCovers: seated.reduce((s, x) => s + x.size, 0),
    meanWaitMin: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
    p90WaitMin: waits.length ? quantile(waits, 0.9) : 0,
    shareSeatedWithin10: waits.length ? waits.filter(w => w <= 10).length / waits.length : 0,
    abandonedParties: parties.filter(x => outcomes[x.id] === 'abandoned').length,
    unseatedAtCloseParties: parties.filter(x => outcomes[x.id] === 'unseatedAtClose').length,
    unservedCovers: unserved.reduce((s, x) => s + x.size, 0),
    seatUtilization: seats > 0 ? guestMinutes / (seats * (window.endMin - window.startMin)) : 0,
    seatWastePerParty: waste.length ? waste.reduce((a, b) => a + b, 0) / waste.length : 0,
    seatedRevenue: seated.reduce((s, x) => s + x.net, 0),
  };
  return { scenarioId: meta.scenarioId, nightIndex: meta.nightIndex, events, outcomes, metrics };
}

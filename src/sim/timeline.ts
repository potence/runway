import type { FloorSnapshot, Layout, RunResult } from '../domain/types';

/** Floor state at time t, folded from the engine's own event log (replay never re-simulates). */
export function snapshotAt(run: RunResult, layout: Layout, t: number): FloorSnapshot {
  const tables = new Map(layout.tables.map(x => [x.id, { tableId: x.id, state: 'free' as FloorSnapshot['tables'][number]['state'], partyId: undefined as string | undefined, partySize: undefined as number | undefined, joinedWith: undefined as string[] | undefined }]));
  const queue = new Map<string, { size: number; arriveT: number }>();
  const sizes = new Map<string, number>();
  let seatedSoFar = 0, abandonedSoFar = 0;
  const departAt = new Map<string, number>();
  for (const e of run.events) if (e.type === 'depart') departAt.set(e.partyId, e.t);
  for (const e of run.events) {
    if (e.t > t) break;
    switch (e.type) {
      case 'arrive': queue.set(e.partyId, { size: e.size, arriveT: e.t }); sizes.set(e.partyId, e.size); break;
      case 'seat':
        queue.delete(e.partyId); seatedSoFar++;
        e.tableIds.forEach(id => Object.assign(tables.get(id)!, {
          state: 'occupied', partyId: e.partyId, partySize: sizes.get(e.partyId), remainingMin: (departAt.get(e.partyId) ?? t) - t,
          joinedWith: e.tableIds.length > 1 ? e.tableIds.filter(x => x !== id) : undefined,
        }));
        break;
      case 'depart': e.tableIds.forEach(id => Object.assign(tables.get(id)!, { state: 'resetting', partyId: undefined, partySize: undefined, joinedWith: undefined, remainingMin: undefined })); break;
      case 'tableReady': e.tableIds.forEach(id => (tables.get(id)!.state = 'free')); break;
      case 'abandon': queue.delete(e.partyId); abandonedSoFar++; break;
      case 'unseatedAtClose': queue.delete(e.partyId); break;
    }
  }
  return {
    t,
    tables: [...tables.values()],
    queue: [...queue].map(([partyId, q]) => ({ partyId, size: q.size, waitedMin: t - q.arriveT })),
    seatedSoFar, abandonedSoFar,
  };
}

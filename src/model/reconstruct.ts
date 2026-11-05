import type { HistoryReconstruction, Layout, NightReconstruction, OrderRow, ServiceWindow, TableUseAssumptions } from '../domain/types';
import { FULLNESS_THRESHOLD, seatsOf } from '../scenarios/presets';
import { quantile } from './rng';

// Historical reconstruction ONLY: POS checks + Assumed offsets -> estimated table-use intervals and
// occupancy proxies. Produces no arrivals, waits, or walkaways, and never calls the simulator.
const BIN = 15;

export function groupByNight(rows: OrderRow[]): Map<string, OrderRow[]> {
  const m = new Map<string, OrderRow[]>();
  for (const r of rows) (m.get(r.businessDate) ?? m.set(r.businessDate, []).get(r.businessDate)!).push(r);
  return m;
}

export function reconstructHistory(
  allRows: OrderRow[], a: TableUseAssumptions, layout: Layout, window?: ServiceWindow,
): HistoryReconstruction {
  const rows = window ? allRows.filter(r => window.dows.includes(r.dow)) : allRows;
  const tables = layout.tables.length;
  const seats = seatsOf(layout);
  const warnings: string[] = [];
  if (!rows.length) warnings.push('No usable POS rows for the selected weekdays.');

  const starts = rows.map(r => r.checkOpenMin - a.openLagMin);
  const ends = rows.map(r => r.checkCloseMin + a.lingerMin);
  const lo = rows.length ? Math.floor(Math.min(...starts) / BIN) * BIN : 0;
  const hi = rows.length ? Math.ceil(Math.max(...ends) / BIN) * BIN : 0;
  const binStarts: number[] = [];
  for (let m = lo; m < hi; m += BIN) binStarts.push(m);
  const openSum = binStarts.map(() => 0);
  const useSum = binStarts.map(() => 0);

  const nights: NightReconstruction[] = [];
  let sameTableOverlaps = 0;
  for (const [date, rs] of groupByNight(rows)) {
    let peakOpen = 0, peakUses = 0;
    binStarts.forEach((m, i) => {
      let openG = 0, useG = 0, uses = 0;
      for (const r of rs) {
        if (r.checkOpenMin <= m && m < r.checkCloseMin) openG += r.guests;
        if (r.checkOpenMin - a.openLagMin <= m && m < r.checkCloseMin + a.lingerMin) { useG += r.guests; uses++; }
      }
      openSum[i] += openG; useSum[i] += useG;
      peakOpen = Math.max(peakOpen, openG); peakUses = Math.max(peakUses, uses);
    });
    const byTable = new Map<string, OrderRow[]>();
    for (const r of rs) if (r.table) (byTable.get(r.table) ?? byTable.set(r.table, []).get(r.table)!).push(r);
    for (const list of byTable.values()) {
      list.sort((x, y) => x.checkOpenMin - y.checkOpenMin);
      for (let i = 1; i < list.length; i++) if (list[i].checkOpenMin < list[i - 1].checkCloseMin) sameTableOverlaps++;
    }
    nights.push({
      businessDate: date, dow: rs[0].dow,
      recordedParties: rs.length, recordedCovers: rs.reduce((s, r) => s + r.guests, 0),
      peakOpenCheckGuests: peakOpen, peakConcurrentTableUses: peakUses,
      capacityLimited: tables > 0 && peakUses >= FULLNESS_THRESHOLD * tables,
    });
  }
  nights.sort((x, y) => x.businessDate.localeCompare(y.businessDate));
  const n = Math.max(nights.length, 1);

  const sizes = new Map<number, number>();
  rows.forEach(r => sizes.set(r.guests, (sizes.get(r.guests) ?? 0) + 1));
  const bucketOf = (g: number) => (g <= 2 ? '1-2' : g <= 4 ? '3-4' : '5+') as '1-2' | '3-4' | '5+';
  const durationByBucket = (['1-2', '3-4', '5+'] as const).map(bucket => {
    const d = rows.filter(r => bucketOf(r.guests) === bucket).map(r => r.checkCloseMin - r.checkOpenMin);
    return { bucket, n: d.length, p25: quantile(d, 0.25), median: quantile(d, 0.5), p75: quantile(d, 0.75) };
  });
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const totalGuests = rows.reduce((s, r) => s + r.guests, 0);
  const nightsAboveConfiguredSeats = nights.filter(x => x.peakOpenCheckGuests > seats).length;
  if (nightsAboveConfiguredSeats) warnings.push(`${nightsAboveConfiguredSeats} nights had more guests on open checks than the configured ${seats} seats. Check the layout or the export.`);
  if (sameTableOverlaps) warnings.push(`${sameTableOverlaps} checks overlap another check on the same table (split checks or table transfers). They are kept as separate parties, which may overcount parties and guests; Runway does not merge them because the export does not say which they are.`);

  return {
    binMin: 15,
    nights,
    profile: binStarts.map((minute, i) => ({ minute, meanOpenCheckGuests: openSum[i] / n, meanTableUseGuests: useSum[i] / n })),
    partySizeCounts: [...sizes].sort((x, y) => x[0] - y[0]).map(([size, parties]) => ({ size, parties })),
    durationByBucket,
    meanNetPerCover: totalNet > 0 && totalGuests > 0 ? totalNet / totalGuests : null,
    configuredTables: tables,
    configuredSeats: seats,
    capacityLimitedNights: nights.filter(x => x.capacityLimited).length,
    nightsAboveConfiguredSeats,
    sameTableOverlaps,
    warnings,
  };
}

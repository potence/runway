import type { DemandModel, ModeledNight, ModeledParty, OrderRow, PatienceAssumptions, ServiceWindow, TableUseAssumptions, VolumeSpec } from '../domain/types';
import { hashSeed, mulberry32, pick } from './rng';
import { groupByNight } from './reconstruct';

// Counterfactual demand model. Check-open timestamps inform only the TIMING SHAPE (via estimated
// table-use starts) and a bootstrap pool of observed checks. Volume comes from recorded nightly
// totals or a Radar band, times an Assumed latent-demand multiplier. Recorded seatings are censored
// by capacity, so this shape understates and delays peaks when guests waited.
const BIN = 15;

export function fitDemandModel(rows: OrderRow[], window: ServiceWindow, a: TableUseAssumptions): DemandModel {
  const nBins = Math.ceil((window.endMin - window.startMin) / BIN);
  const counts = new Array(nBins).fill(0);
  const inWindow = rows.filter(r => {
    const s = r.checkOpenMin - a.openLagMin;
    return window.dows.includes(r.dow) && s >= window.startMin && s < window.endMin;
  });
  for (const r of inWindow) counts[Math.floor((r.checkOpenMin - a.openLagMin - window.startMin) / BIN)]++;
  const total = inWindow.length;
  const nightly = [...groupByNight(inWindow).values()].map(rs => rs.length);
  return {
    window,
    binMin: 15,
    timingShape: counts.map(c => (total ? c / total : 1 / nBins)),
    checkPool: inWindow.map(r => ({ guests: r.guests, durationMin: r.checkCloseMin - r.checkOpenMin, net: r.net })),
    nightlyRecordedParties: nightly,
    supportNights: nightly.length,
  };
}

export function baseVolume(model: DemandModel, volume: VolumeSpec, rng: () => number): number {
  return volume.source === 'radar' ? volume.scenario.parties[volume.band] : pick(rng, model.nightlyRecordedParties);
}

export function generateNights(
  model: DemandModel, volume: VolumeSpec, a: TableUseAssumptions, patience: PatienceAssumptions, nights: number, seed: number,
): ModeledNight[] {
  if (!model.checkPool.length) throw new Error('No usable POS checks in the selected service window.');
  const cum: number[] = [];
  model.timingShape.reduce((s, x, i) => (cum[i] = s + x), 0);
  const out: ModeledNight[] = [];
  for (let n = 0; n < nights; n++) {
    const rng = mulberry32(hashSeed(seed, n));
    const N = Math.round(baseVolume(model, volume, rng) * volume.latentDemandMultiplier);
    const parties: Omit<ModeledParty, 'id'>[] = [];
    for (let k = 0; k < N; k++) {
      const u = rng() * cum[cum.length - 1];
      let bin = cum.findIndex(c => u < c);
      if (bin < 0) bin = cum.length - 1;
      const demandArriveMin = Math.min(model.window.startMin + (bin + rng()) * BIN, model.window.endMin - 0.01);
      const c = pick(rng, model.checkPool);
      parties.push({
        demandArriveMin,
        size: c.guests,
        tableUseMin: c.durationMin + a.openLagMin + a.lingerMin,
        patienceMin: c.guests >= patience.largeFrom ? patience.largePartyMin : patience.smallPartyMin,
        net: c.net,
      });
    }
    parties.sort((x, y) => x.demandArriveMin - y.demandArriveMin);
    out.push({ index: n, parties: parties.map((p, k) => ({ ...p, id: `n${n}-p${k}` })) });
  }
  return out;
}

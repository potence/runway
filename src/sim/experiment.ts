import type { AssumptionChip, ExperimentInput, ExperimentResult, MetricKey, MetricSummary, Provenance, RunResult } from '../domain/types';
import { fitDemandModel, generateNights } from '../model/demand';
import { mean, quantile } from '../model/rng';
import { simulateNight } from './engine';

const MODELED: Provenance = {
  kind: 'Modeled',
  basis: 'Simulated under the stated demand, timing, table-use and patience assumptions; not a historical measurement.',
};

export const METRIC_META: Record<MetricKey, { label: string; unit: string; higherIsBetter: boolean; basis?: string }> = {
  seatedParties: { label: 'Seated parties', unit: 'parties', higherIsBetter: true },
  seatedCovers: { label: 'Seated covers', unit: 'covers', higherIsBetter: true },
  meanWaitMin: { label: 'Modeled mean wait (seated parties)', unit: 'min', higherIsBetter: false },
  p90WaitMin: { label: 'Modeled 90th-percentile wait', unit: 'min', higherIsBetter: false },
  shareSeatedWithin10: { label: 'Share seated within 10 min', unit: 'share', higherIsBetter: true },
  abandonedParties: { label: 'Modeled abandonments under your patience assumption', unit: 'parties', higherIsBetter: false },
  unseatedAtCloseParties: { label: 'Modeled parties unseated at close', unit: 'parties', higherIsBetter: false },
  unservedCovers: { label: 'Modeled unserved covers', unit: 'covers', higherIsBetter: false },
  seatUtilization: { label: 'Modeled seat utilization (service window)', unit: 'share', higherIsBetter: true },
  seatWastePerParty: { label: 'Empty seats per seated party', unit: 'seats', higherIsBetter: false },
  seatedRevenue: {
    label: 'Modeled seated-check revenue per night', unit: '$', higherIsBetter: true,
    basis: 'Sum of recorded check amounts resampled for modeled seated parties; a night total, not timed revenue.',
  },
};

const fmtTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const assumed = (basis: string): Provenance => ({ kind: 'Assumed', basis });

export function runExperiment(input: ExperimentInput): ExperimentResult {
  const { volume, scenarios, baselineId, tableUse, patience } = input;
  const window = volume.source === 'radar' ? { ...input.window, dows: [volume.scenario.dow] } : input.window;
  const model = fitDemandModel(input.rows, window, tableUse);
  const nights = generateNights(model, volume, tableUse, patience, input.nights, input.seed);

  // Common random numbers: every scenario sees the identical modeled party list for a night.
  const metricsBy: Record<string, Record<MetricKey, number>[]> = {};
  scenarios.forEach(s => (metricsBy[s.id] = []));
  for (const night of nights)
    for (const s of scenarios)
      metricsBy[s.id].push(simulateNight(night.parties, s.layout, s.policy, window, { scenarioId: s.id, nightIndex: night.index }).metrics);

  const keys = Object.keys(METRIC_META) as MetricKey[];
  const metrics: MetricSummary[] = keys.map(key => {
    const meta = METRIC_META[key];
    const perScenario: MetricSummary['perScenario'] = {};
    for (const s of scenarios) {
      const v = metricsBy[s.id].map(m => m[key]);
      perScenario[s.id] = { mean: mean(v), p10: quantile(v, 0.1), p90: quantile(v, 0.9) };
    }
    const base = metricsBy[baselineId].map(m => m[key]);
    const paired = scenarios.filter(s => s.id !== baselineId).map(s => {
      const d = metricsBy[s.id].map((m, i) => m[key] - base[i]);
      const p10 = quantile(d, 0.1), p90 = quantile(d, 0.9);
      return {
        scenarioId: s.id, meanDelta: mean(d), p10, p90,
        wins: d.filter(x => (meta.higherIsBetter ? x > 0 : x < 0)).length,
        nights: d.length, noClearDifference: p10 <= 0 && p90 >= 0,
      };
    });
    return { key, label: meta.label, unit: meta.unit, higherIsBetter: meta.higherIsBetter,
      provenance: meta.basis ? { kind: 'Modeled', basis: meta.basis } : MODELED, perScenario, paired };
  });

  // Replay night: baseline night whose mean wait is closest to the median.
  const waits = metricsBy[baselineId].map(m => m.meanWaitMin);
  const med = quantile(waits, 0.5);
  const replayNightIndex = waits.reduce((best, w, i) => (Math.abs(w - med) < Math.abs(waits[best] - med) ? i : best), 0);
  const replayParties = nights[replayNightIndex].parties;
  const replay = scenarios.map(s => ({
    scenarioId: s.id,
    run: simulateNight(replayParties, s.layout, s.policy, window, { scenarioId: s.id, nightIndex: replayNightIndex }) as RunResult,
    parties: replayParties,
  }));

  const L = volume.latentDemandMultiplier;
  const modeledDemandMean = mean(nights.map(n => n.parties.length));
  const basisParties = volume.source === 'radar' ? volume.scenario.parties[volume.band] : quantile(model.nightlyRecordedParties, 0.5);
  const parts: string[] = [];
  if (volume.source === 'radar')
    parts.push(`Demand = ${basisParties} forecast recorded parties (Rush Radar ${volume.band}, ${volume.scenario.date}) × ${L.toFixed(2)} latent-demand assumption = ${Math.round(basisParties * L)} modeled demand arrivals per night.`);
  else
    parts.push(`Demand per modeled night = one historical night's recorded party count (resampled from ${model.supportNights} ${window.dows.map(d => DOW[d]).join('/')} nights, median ${basisParties}) × ${L.toFixed(2)} latent-demand assumption; mean ${modeledDemandMean.toFixed(0)} modeled demand arrivals.`);
  parts.push('Arrival timing follows the recorded-seating timing profile, which assumes walk-ins arrive when recorded seatings began; it understates and delays peaks when guests waited.');
  if (input.capacityLimitedNights)
    parts.push(`${input.capacityLimitedNights} history nights were capacity-limited, so recorded seatings may understate demand; 1.00× is likely a lower bound.`);

  const chips: AssumptionChip[] = [
    { key: 'latent', label: 'Latent-demand multiplier', value: `${L.toFixed(2)}×`, provenance: assumed('Owner-controlled; not inferred from POS data.') },
    { key: 'openLag', label: 'Table use starts before check-open', value: `${tableUse.openLagMin} min`, provenance: assumed('Design default; editable.') },
    { key: 'linger', label: 'Guests stay after check-close', value: `${tableUse.lingerMin} min`, provenance: assumed('Design default; editable.') },
    { key: 'patience', label: 'Patience', value: `${patience.smallPartyMin} min (parties < ${patience.largeFrom}), ${patience.largePartyMin} min (${patience.largeFrom}+)`, provenance: assumed('Design default; walkaways are not in POS data.') },
    ...scenarios.map(s => ({
      key: `policy-${s.id}`, label: `${s.name} policy`,
      value: `nesting ${s.policy.nesting}, joins ${s.policy.allowJoins ? 'on' : 'off'}, reset ${s.policy.resetMin} min, join setup ${s.policy.joinSetupMin} min`,
      provenance: assumed('Owner/default policy input.'),
    })),
    { key: 'window', label: 'Service window', value: `${window.dows.map(d => DOW[d]).join('/')} ${fmtTime(window.startMin)}–${fmtTime(window.endMin)}`, provenance: assumed('Owner/default input.') },
    { key: 'nights', label: 'Simulated nights / seed', value: `${input.nights} / ${input.seed}`, provenance: assumed('Simulation setting.') },
  ];
  const warnings: string[] = [];
  if (volume.source === 'history' && model.supportNights < 6) warnings.push(`Only ${model.supportNights} history nights in this window; night-to-night variation is poorly represented.`);

  return {
    assumptions: chips,
    demandBanner: parts.join(' '),
    demand: { recordedPartiesBasis: basisParties, latentDemandMultiplier: L, modeledDemandMean, source: volume.source },
    metrics, replayNightIndex, replay, warnings,
  };
}

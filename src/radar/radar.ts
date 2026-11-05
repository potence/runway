import type { BacktestResult, DayForecast, DemandScenario, FactorEffect, OrderRow, RadarContext, ServiceWindow, SourceCoverage, TableUseAssumptions } from '../domain/types';
import { quantile } from '../model/rng';

// Rush Radar-Lite. Target: RECORDED parties in the service window (seated checks), not total demand.
// Ranges are empirical historical ranges, not calibrated prediction intervals. Factors are Flag-only
// (1.00x) unless the owner enters an Assumed multiplier; no learned effects in the MVP.
const HALF_LIFE_DAYS = 56; // 8-week half-life (blueprint design choice)
const DAY = 86400000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * DAY);
const dowOf = (d: string) => new Date(toUtc(d)).getUTCDay();

function weightedQuantile(vals: { v: number; w: number }[], q: number): number {
  const s = [...vals].sort((a, b) => a.v - b.v);
  const total = s.reduce((t, x) => t + x.w, 0);
  let acc = 0;
  for (const x of s) { acc += x.w; if (acc >= q * total) return x.v; }
  return s[s.length - 1].v;
}

export function nightlyTotals(rows: OrderRow[], window: ServiceWindow, a: TableUseAssumptions) {
  const m = new Map<string, { date: string; dow: number; parties: number; covers: number }>();
  for (const r of rows) {
    const s = r.checkOpenMin - a.openLagMin;
    if (!window.dows.includes(r.dow) || s < window.startMin || s >= window.endMin) continue;
    const n = m.get(r.businessDate) ?? m.set(r.businessDate, { date: r.businessDate, dow: r.dow, parties: 0, covers: 0 }).get(r.businessDate)!;
    n.parties++; n.covers += r.guests;
  }
  return [...m.values()].sort((x, y) => x.date.localeCompare(y.date));
}

type Night = ReturnType<typeof nightlyTotals>[number];
const weighted = (prior: Night[], date: string) => prior.map(n => ({ v: n.parties, w: Math.pow(0.5, (toUtc(date) - toUtc(n.date)) / DAY / HALF_LIFE_DAYS) }));

export function backtest(nights: Night[]): BacktestResult | null {
  const errs = { p: [] as number[], last: [] as number[], med: [] as number[] };
  for (const n of nights) {
    const prior = nights.filter(x => x.dow === n.dow && x.date < n.date);
    if (prior.length < 4) continue;
    errs.p.push(Math.abs(weightedQuantile(weighted(prior, n.date), 0.5) - n.parties));
    errs.last.push(Math.abs(prior[prior.length - 1].parties - n.parties));
    errs.med.push(Math.abs(quantile(prior.map(x => x.parties), 0.5) - n.parties));
  }
  if (!errs.p.length) return null;
  const mae = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const r = { nights: errs.p.length, maeProposed: mae(errs.p), maeLastSameWeekday: mae(errs.last), maeSameWeekdayMedian: mae(errs.med) };
  return { ...r, beatsNaive: r.maeProposed <= r.maeLastSameWeekday && r.maeProposed <= r.maeSameWeekdayMedian };
}

function factorsFor(date: string, ctx: RadarContext): FactorEffect[] {
  const f: FactorEffect[] = [];
  for (const h of ctx.holidays.filter(x => x.date === date))
    f.push({ factor: 'holiday', label: h.name, evidence: 'FlagOnly', multiplier: 1, reason: 'Holiday shown as context; no effect learned from your history.' });
  for (const e of ctx.events.filter(x => x.date === date))
    f.push(e.assumedMultiplier != null
      ? { factor: 'event', label: e.name, evidence: 'Assumed', multiplier: e.assumedMultiplier, reason: `Owner-entered assumption of ${e.assumedMultiplier.toFixed(2)}×.` }
      : { factor: 'event', label: e.name, evidence: 'FlagOnly', multiplier: 1, reason: 'Event listed; no effect estimate.' });
  for (const s of ctx.schoolBreaks.filter(x => x.start <= date && date <= x.end))
    f.push({ factor: 'school', label: s.name, evidence: 'FlagOnly', multiplier: 1, reason: 'School break shown as context; no effect estimate.' });
  const w = ctx.weather.find(x => x.date === date);
  if (w) f.push({ factor: 'weather', label: `${w.summary}${w.highF != null ? `, high ${w.highF}°F` : ''}${w.precipPct != null ? `, ${w.precipPct}% precip.` : ''}`,
    evidence: 'FlagOnly', multiplier: 1, reason: `Weather (${w.source === 'nws' ? 'live NWS forecast' : 'sample forecast, not live'}) shown as context; no weather effect learned from your history, so 1.00×.` });
  return f;
}

function coverageFor(date: string, ctx: RadarContext): SourceCoverage[] {
  const hasEvents = ctx.events.some(x => x.date === date);
  return [
    ctx.weatherCoverage,
    { source: 'Bundled US holiday calendar', status: 'fixture', note: 'Federal and common dining dates only; local observances not included.' },
    { source: 'Owner-entered events', status: ctx.isFixture ? 'fixture' : 'ownerEntered', note: hasEvents ? 'Only events entered by the owner are listed.' : 'No events listed; coverage is incomplete.' },
    { source: 'Owner-entered school dates', status: ctx.isFixture ? 'fixture' : 'ownerEntered', note: 'Only school dates entered by the owner are listed.' },
  ];
}

export function buildRadar(rows: OrderRow[], ctx: RadarContext, today: string, window: ServiceWindow, a: TableUseAssumptions, isSample: boolean) {
  const nights = nightlyTotals(rows, window, a).filter(n => n.date < today);
  const bt = backtest(nights);
  const days: DayForecast[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const dow = dowOf(date);
    const prior = nights.filter(n => n.dow === dow);
    const factors = factorsFor(date, ctx);
    const coverage = coverageFor(date, ctx);
    const base = { date, dow, supportNights: prior.length, factors, coverage, isSample };
    if (prior.length < 4) {
      days.push({ ...base, confidence: 'Insufficient', confidenceReasons: [prior.length ? `Only ${prior.length} same-weekday nights in history (minimum 4).` : 'No recorded service on this weekday in the selected window.'] });
      continue;
    }
    const mult = factors.reduce((m, f) => m * f.multiplier, 1);
    const vals = prior.map(n => n.parties);
    const enough = prior.length >= 8;
    const raw = enough
      ? { low: weightedQuantile(weighted(prior, date), 0.1), mid: weightedQuantile(weighted(prior, date), 0.5), high: weightedQuantile(weighted(prior, date), 0.9) }
      : { low: Math.min(...vals), mid: quantile(vals, 0.5), high: Math.max(...vals) };
    const parties = { low: Math.round(raw.low * mult), mid: Math.round(raw.mid * mult), high: Math.round(raw.high * mult) };
    const cpp = prior.reduce((s, n) => s + n.covers, 0) / prior.reduce((s, n) => s + n.parties, 0);
    const reasons = [enough ? `Recency-weighted (8-week half-life) range from ${prior.length} same-weekday nights; empirical historical range, not a calibrated interval.` : `Observed min–max from only ${prior.length} same-weekday nights.`];
    if (bt && !bt.beatsNaive) reasons.push('Backtest: weighted baseline did not beat the naive baselines.');
    if (mult !== 1) reasons.push(`Owner-entered assumptions applied: ${mult.toFixed(2)}×.`);
    days.push({
      ...base, parties,
      covers: { low: Math.round(parties.low * cpp), mid: Math.round(parties.mid * cpp), high: Math.round(parties.high * cpp) },
      rangeKind: enough ? 'empirical_p10_p90' : 'observed_min_max',
      typicalParties: quantile(vals, 0.5),
      confidence: enough && bt?.beatsNaive ? 'Medium' : 'Low',
      confidenceReasons: reasons,
    });
  }
  return { days, backtest: bt };
}

export function toDemandScenario(day: DayForecast, window: ServiceWindow): DemandScenario | null {
  if (day.confidence === 'Insufficient' || !day.parties || !day.covers || !day.rangeKind) return null;
  return {
    date: day.date, dow: day.dow, window: { ...window, dows: [day.dow] }, target: 'recorded_parties',
    parties: day.parties, covers: day.covers, rangeKind: day.rangeKind, confidence: day.confidence,
    confidenceReasons: day.confidenceReasons, factors: day.factors, coverage: day.coverage,
    supportNights: day.supportNights, isSample: day.isSample,
  };
}

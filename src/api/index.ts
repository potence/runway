// The ONLY engine surface the UI may import. UI code imports functions from here and types from src/domain.
import type { DayForecast, OrderRow, RadarContext, ServiceWindow, TableUseAssumptions } from '../domain/types';
import { buildRadar as buildRadarImpl, toDemandScenario as toDemandScenarioImpl, addDays } from '../radar/radar';
import { US_HOLIDAYS } from '../radar/sources/holidays';
import { fetchNwsWeather } from '../radar/sources/nws';
import { fillWeatherGaps } from '../radar/sources/sampleWeather';
import { SATURDAY_STRESS_PRESET } from '../scenarios/presets';
import sampleCsv from '../sample/harbor-table-orderdetails.csv?raw';
import sampleContext from '../sample/harbor-table-context.json';
import { LANDING_CONTENT } from '../sample/landingContent';

export { importOrders, detectMapping } from '../pos/importOrders';
export { reconstructHistory } from '../model/reconstruct';
export { runExperiment, METRIC_META } from '../sim/experiment';
export { snapshotAt } from '../sim/timeline';
export { buildTakeaway, explainNoDifference } from '../sim/takeaway';
export { fetchNwsWeather } from '../radar/sources/nws';
export { addDays } from '../radar/radar';
export * from '../scenarios/presets';

/** Synthetic sample (Harbor Table). Always show the SAMPLE DATA (synthetic) ribbon when used. */
export function loadSample(): { csvText: string; context: RadarContext; location: { lat: number; lon: number; label: string } } {
  const c = sampleContext as unknown as { events: RadarContext['events']; schoolBreaks: RadarContext['schoolBreaks']; weather: RadarContext['weather']; location: { lat: number; lon: number; label: string } };
  return {
    csvText: sampleCsv,
    context: {
      holidays: US_HOLIDAYS, events: c.events, schoolBreaks: c.schoolBreaks, weather: c.weather,
      weatherCoverage: { source: 'Weather fixture', status: 'fixture', note: 'Synthetic fixture weather (demo only).' },
      isFixture: true,
    },
    location: c.location,
  };
}

/**
 * One-click pitch demo: the synthetic sample plus the Saturday stress preset (Assumed 1.25× latent demand).
 * Apply preset.window, preset.latentDemandMultiplier, preset.nights and preset.seed to the scenario settings,
 * keep the SAMPLE ribbon, and show preset.disclosure verbatim while it is active.
 */
export function loadStressDemo() {
  return { ...loadSample(), preset: SATURDAY_STRESS_PRESET };
}

/** Context for uploaded data: bundled holidays, owner-entered events/school dates, no weather until fetched. */
export function emptyContext(): RadarContext {
  return {
    holidays: US_HOLIDAYS, events: [], schoolBreaks: [], weather: [],
    weatherCoverage: { source: 'National Weather Service', status: 'notConfigured', note: 'No location set; weather not shown.' },
    isFixture: false,
  };
}

/** Try live NWS; on success replace fixture weather, on failure keep context and record 'unavailable'. */
export async function withLiveWeather(ctx: RadarContext, lat: number, lon: number): Promise<RadarContext> {
  const r = await fetchNwsWeather(lat, lon);
  return r.days.length ? { ...ctx, weather: r.days, weatherCoverage: r.coverage } : { ...ctx, weatherCoverage: r.coverage };
}

/** Every outlook day gets a weather line: live NWS where it covers the date, a labeled sample forecast elsewhere. */
export function buildRadar(rows: OrderRow[], ctx: RadarContext, today: string, window: ServiceWindow, tableUse: TableUseAssumptions, isSample: boolean) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const { weather, filled } = fillWeatherGaps(ctx.weather, dates);
  const cov = ctx.weatherCoverage;
  const note = !filled ? cov.note
    : cov.status === 'live' ? `${cov.note} ${filled} day(s) outside the live forecast show a sample forecast (not live).`
    : `${cov.note} Showing a sample forecast (not live); weather never changes the numbers.`;
  return buildRadarImpl(rows, { ...ctx, weather, weatherCoverage: { ...cov, note } }, today, window, tableUse, isSample);
}
export function toDemandScenario(day: DayForecast, window: ServiceWindow) {
  return toDemandScenarioImpl(day, window);
}
/** Radar start date: the later of the day after the last business date and today's local date. */
export const nextDay = (lastDate: string) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const after = addDays(lastDate, 1);
  return after > today ? after : today;
};

/** Static landing-page copy (lowercase, jargon-free). Render strings verbatim; do not add claims. */
export function getLandingContent() {
  return LANDING_CONTENT;
}
export { aiReviewAvailable, buildAiReviewInput, buildWeekFacts, generateAiReview, AI_DISCLAIMER, AI_WEEK_DISCLAIMER, type AiReviewInput, type AiTask, type WeekFacts } from './gemini';

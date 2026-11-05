import type { SourceCoverage, WeatherDay } from '../../domain/types';

// National Weather Service: /points/{lat},{lon} -> properties.forecast -> daytime periods.
// Browser sets its own User-Agent. On any failure we report 'unavailable'; never fabricate live data.
export async function fetchNwsWeather(lat: number, lon: number, signal?: AbortSignal): Promise<{ days: WeatherDay[]; coverage: SourceCoverage }> {
  try {
    const get = async (url: string) => {
      // 8 s per request so a slow NWS never leaves the demo hanging; one retry covers NWS's intermittent 5xx.
      const once = () => fetch(url, { headers: { Accept: 'application/geo+json' }, signal: signal ?? AbortSignal.timeout(8000) });
      let r = await once();
      if (r.status >= 500) r = await once();
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).pathname}`);
      return r.json();
    };
    const point = await get(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
    const fc = await get(point.properties.forecast);
    const periods = fc.properties.periods as any[];
    const toDay = (p: any, night: boolean): WeatherDay => ({
      date: String(p.startTime).slice(0, 10),
      summary: night ? `Tonight: ${p.shortForecast}, low ${p.temperature}°F` : String(p.shortForecast),
      highF: !night && typeof p.temperature === 'number' ? p.temperature : null,
      precipPct: p.probabilityOfPrecipitation?.value ?? null,
      source: 'nws',
    });
    const days: WeatherDay[] = periods.filter(p => p.isDaytime).map(p => toDay(p, false));
    // After sunset NWS starts with "Tonight"; that is today's real forecast, so keep it rather than leave today blank.
    const first = periods[0];
    if (first && !first.isDaytime && !days.some(d => d.date === String(first.startTime).slice(0, 10))) days.unshift(toDay(first, true));
    const where = point.properties.relativeLocation?.properties;
    return { days, coverage: { source: 'National Weather Service', status: 'live',
      note: `Live NWS forecast${where ? ` for ${where.city}, ${where.state}` : ''}, fetched ${new Date().toLocaleString()}. Context only.` } };
  } catch (e) {
    return { days: [], coverage: { source: 'National Weather Service', status: 'unavailable', note: `NWS forecast unavailable (${(e as Error).message}); no weather shown.` } };
  }
}

import type { WeatherDay } from '../../domain/types';
import { hashSeed, mulberry32 } from '../../model/rng';

// Labeled stand-in weather for outlook days that live NWS does not cover (or when NWS is down).
// Deterministic per date, generic temperate seasonal highs; NOT a forecast, never shown as live, and
// weather never changes any number (flag-only 1.00x).
const MONTH_HIGH_F = [52, 55, 60, 65, 72, 78, 82, 81, 77, 68, 59, 52];
const SKIES = ['Clear', 'Mostly sunny', 'Partly cloudy', 'Mostly cloudy', 'Light rain'];

export function sampleWeatherFor(date: string): WeatherDay {
  const r = mulberry32(hashSeed(Number(date.replace(/-/g, "")), 7));
  const sky = SKIES[Math.floor(r() * SKIES.length)];
  const highF = MONTH_HIGH_F[Number(date.slice(5, 7)) - 1] + Math.round((r() - 0.5) * 10);
  const precipPct = sky === 'Light rain' ? 40 + Math.round(r() * 30) : Math.round(r() * 15);
  return { date, summary: sky, highF, precipPct, source: 'sample' };
}

/** Returns weather covering every date: real entries kept as-is, gaps filled with labeled samples. */
export function fillWeatherGaps(weather: WeatherDay[], dates: string[]): { weather: WeatherDay[]; filled: number } {
  const have = new Set(weather.map(w => w.date));
  const gaps = dates.filter(d => !have.has(d)).map(sampleWeatherFor);
  return { weather: [...weather, ...gaps], filled: gaps.length };
}

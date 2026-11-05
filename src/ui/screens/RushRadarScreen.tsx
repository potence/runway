import { useEffect, useMemo, useState } from 'react';
import { buildRadar, buildWeekFacts, nextDay, toDemandScenario } from '../../api';
import { AiReview } from '../components/AiReview';
import type { DayForecast } from '../../domain/types';
import { useAppStore } from '../store/useAppStore';
import { DOW_SHORT } from '../utils/format';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const longDate = (d: DayForecast) => {
  const [, m, day] = d.date.split('-').map(Number);
  return `${DOW_SHORT[d.dow].toLowerCase()} ${MONTHS[m - 1]} ${day}`;
};

/** One sentence of context: weather (live or sample) plus any holiday/event flags and what they do to the numbers. */
function contextLine(day: DayForecast): string {
  const w = day.factors.find((f) => f.factor === 'weather');
  const parts: string[] = [];
  if (w) parts.push(`${w.reason.includes('live NWS') ? 'live weather' : 'sample weather (not live)'}: ${w.label.toLowerCase()}`);
  for (const f of day.factors.filter((x) => x.factor !== 'weather')) {
    const pct = Math.round((f.multiplier - 1) * 100);
    parts.push(`${f.label.toLowerCase()} (${f.evidence === 'Assumed' && pct !== 0 ? `assumed ${pct > 0 ? '+' : ''}${pct}% demand` : 'noted, no change to the numbers'})`);
  }
  if (parts.length < 2) parts.push('no holidays or events listed');
  return parts.join(' · ');
}

export function RushRadarScreen() {
  const importResult = useAppStore((s) => s.importResult);
  const radarContext = useAppStore((s) => s.radarContext);
  const window = useAppStore((s) => s.window);
  const tableUse = useAppStore((s) => s.tableUse);
  const location = useAppStore((s) => s.location);
  const weatherLoading = useAppStore((s) => s.weatherLoading);
  const fetchLiveNwsWeather = useAppStore((s) => s.fetchLiveNwsWeather);
  const selectRadarScenario = useAppStore((s) => s.selectRadarScenario);
  const addOwnerEvent = useAppStore((s) => s.addOwnerEvent);
  const removeOwnerEvent = useAppStore((s) => s.removeOwnerEvent);
  const setScreen = useAppStore((s) => s.setScreen);

  const [selectedBandByDate, setSelectedBandByDate] = useState<Record<string, 'low' | 'mid' | 'high'>>({});
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventMult, setNewEventMult] = useState('1.00');

  // Fetch live NWS once when the outlook opens, unless it is already live. Failure keeps whatever weather the
  // context had (fixture for the sample) and the card says so; nothing is invented for real dates.
  const weatherStatus = radarContext.weatherCoverage.status;
  const hasRows = Boolean(importResult?.rows.length);
  useEffect(() => {
    if (hasRows && weatherStatus !== 'live' && !useAppStore.getState().weatherLoading) void fetchLiveNwsWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRows]);

  const today = useMemo(() => {
    const lastDate = importResult?.report.dateRange?.[1];
    return lastDate ? nextDay(lastDate) : '2026-11-04';
  }, [importResult]);

  const radarOutput = useMemo(() => {
    if (!importResult || !importResult.rows.length) return null;
    return buildRadar(
      importResult.rows,
      radarContext,
      today,
      window,
      tableUse,
      importResult.report.isSample,
    );
  }, [importResult, radarContext, today, window, tableUse]);

  if (!importResult || !radarOutput) {
    return (
      <div className="panel">
        <p>load a pos dataset first to generate the 7-day demand outlook.</p>
        <button type="button" className="btn btn-primary" onClick={() => setScreen('start')}>
          go to import screen
        </button>
      </div>
    );
  }

  const { days: allDays, backtest } = radarOutput;
  // Days outside the studied service window (or with too little history) have no forecast; they are listed, not carded.
  const days = allDays.filter((d) => d.parties && d.covers);
  const skipped = allDays.filter((d) => !(d.parties && d.covers));
  const busiest = days.reduce<DayForecast | null>((best, d) => (!best || d.parties!.mid > best.parties!.mid ? d : best), null);

  const handleSimulateDay = (day: DayForecast) => {
    const band = selectedBandByDate[day.date] ?? 'mid';
    const scenario = toDemandScenario(day, window);
    if (!scenario) return;
    selectRadarScenario(scenario, band);
  };

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">anticipate busy nights with weather and events</h1>
          <p className="screen-subtitle">
            expected recorded parties for the next 7 days from <span className="mono">{today}</span>, from your own history.
            weather and events are context; they change the numbers only if you enter an assumed multiplier.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn"
            data-testid="live-nws-btn"
            disabled={weatherLoading}
            onClick={() => void fetchLiveNwsWeather()}
          >
            {weatherLoading ? 'fetching weather…' : weatherStatus === 'live' ? 'refresh weather' : `retry live weather (${location.label.toLowerCase()})`}
          </button>
          <button type="button" className="btn" onClick={() => setScreen('scenarios')}>
            scenarios &amp; assumptions
          </button>
        </div>
      </div>

      {busiest && (
        <div className="outlook-lead" data-testid="outlook-lead">
          <span>
            <strong style={{ color: 'var(--ink)' }}>{longDate(busiest)}</strong> is your busiest projected night: about {busiest.parties!.mid} parties, up to {busiest.parties!.high} on a busy version of it.
            test how your dining room handles it.
          </span>
          <button type="button" className="btn btn-primary btn-sm" data-testid="simulate-busiest"
            onClick={() => { const sc = toDemandScenario(busiest, window); if (sc) selectRadarScenario(sc, 'high'); }}>
            simulate this day ({busiest.parties!.high} parties) →
          </button>
        </div>
      )}
      <AiReview mode="week" week={buildWeekFacts(days)} />

      {skipped.length > 0 && (
        <p className="panel-meta" style={{ margin: '0 0 14px' }}>
          not shown: {skipped.map((d) => DOW_SHORT[d.dow].toLowerCase()).join(', ')} (outside the days you are studying, or too little history to forecast).
        </p>
      )}

      <section className="panel panel-raised" style={{ marginBottom: 18 }}>
        <div className="panel-header" style={{ marginBottom: 8 }}>
          <h2 className="panel-title">rolling-origin historical backtest</h2>
          {backtest && (
            <span className="mono" style={{ color: 'var(--muted)', textTransform: 'lowercase' }}>
              {backtest.beatsNaive
                ? 'recency-weighted baseline beats naive baselines'
                : 'baseline did not beat both naive baselines'}
            </span>
          )}
        </div>

        {backtest ? (
          <div className="grid-3" style={{ fontSize: 12.5, textTransform: 'lowercase' }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>recency-weighted median mae (8-wk half-life): </span>
              <strong className="mono" style={{ color: 'var(--ink)' }}>{backtest.maeProposed.toFixed(2)} parties</strong>{' '}
              <span style={{ color: 'var(--faint)' }}>({backtest.nights} evaluated nights)</span>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>naive last same-weekday mae: </span>
              <strong className="mono" style={{ color: 'var(--ink)' }}>{backtest.maeLastSameWeekday.toFixed(2)} parties</strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>unweighted same-weekday median mae: </span>
              <strong className="mono" style={{ color: 'var(--ink)' }}>{backtest.maeSameWeekdayMedian.toFixed(2)} parties</strong>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', textTransform: 'lowercase' }}>
            insufficient historical same-weekday depth (minimum 4 prior nights per weekday) to compute rolling-origin
            backtest mae.
          </div>
        )}
      </section>

      <div className={`weather-status is-${weatherLoading ? 'loading' : weatherStatus}`} data-testid="weather-status">
        <span className="weather-dot" aria-hidden="true" />
        <strong>{weatherLoading ? 'fetching live nws forecast…' : weatherStatus === 'live' ? 'live nws connected' : 'sample forecast active (not live)'}</strong>
        <span>{days[0]?.coverage.find((c) => c.source === radarContext.weatherCoverage.source)?.note ?? radarContext.weatherCoverage.note}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 22,
        }}
      >
        {days.map((day) => {
          const scenario = toDemandScenario(day, window);
          const band = selectedBandByDate[day.date] ?? 'mid';
          const rangeLabel =
            day.rangeKind === 'empirical_p10_p90'
              ? 'empirical historical range (p10 / p50 / p90)'
              : day.rangeKind === 'observed_min_max'
                ? 'observed min / median / max (4-7 nights)'
                : 'insufficient same-weekday history (<4 nights)';

          return (
            <section
              key={day.date}
              className="panel"
              data-testid={`radar-card-${day.date}`}
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}
            >
              <div>
                <div className="panel-header" style={{ marginBottom: 10 }}>
                  <div>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', textTransform: 'lowercase' }}>
                      {longDate(day)}
                    </span>
                  </div>
                </div>

                <div className="outlook-volume">
                  <strong>{day.parties!.mid}</strong> parties expected
                </div>
                <div className="outlook-sub">
                  likely range {day.parties!.low}–{day.parties!.high} parties (~{day.covers!.mid} guests)
                  {day.typicalParties !== undefined && <> · a typical {DOW_SHORT[day.dow].toLowerCase()} in your history: {day.typicalParties.toFixed(0)}</>}
                </div>
                <div className="outlook-context" data-testid={`weather-${day.date}`}>
                  {contextLine(day)}
                </div>
                <details className="card-details">
                  <summary>why this range</summary>
                  <ul style={{ margin: '6px 0 10px 0', paddingLeft: 16, fontSize: 11.5, color: 'var(--muted)' }}>
                    <li>{rangeLabel}; based on {day.supportNights} past {DOW_SHORT[day.dow].toLowerCase()} nights; confidence {day.confidence.toLowerCase()}.</li>
                    {day.confidenceReasons.map((r, i) => <li key={i}>{r}</li>)}
                    {day.coverage.map((c, i) => <li key={`c${i}`}>{c.source} ({c.status}): {c.note}</li>)}
                  </ul>
                </details>
              </div>

              <div
                style={{
                  paddingTop: 10,
                  borderTop: '1px solid var(--rule)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div className="segmented" aria-label={`demand band for ${day.date}`}>
                  {(['low', 'mid', 'high'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      disabled={!scenario}
                      className={`segmented-btn ${band === b ? 'active' : ''}`}
                      onClick={() =>
                        setSelectedBandByDate((prev) => ({ ...prev, [day.date]: b }))
                      }
                    >
                      {b}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!scenario}
                  data-testid={`simulate-day-${day.date}`}
                  onClick={() => handleSimulateDay(day)}
                >
                  simulate this day
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">owner-entered local events &amp; assumed multipliers</h2>
            <div className="panel-meta">
              add a known local concert, festival, or promotion. leave multiplier at 1.00x for flag-only context, or
              enter an explicit assumed multiplier.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <label className="field-label" htmlFor="ev-date-select" style={{ marginBottom: 4 }}>
              <span>forecast date</span>
            </label>
            <select
              id="ev-date-select"
              className="select"
              value={newEventDate || days[0]?.date || ''}
              onChange={(e) => setNewEventDate(e.target.value)}
            >
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date} ({DOW_SHORT[d.dow].toLowerCase()})
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field-label" htmlFor="ev-name-input" style={{ marginBottom: 4 }}>
              <span>event description</span>
            </label>
            <input
              id="ev-name-input"
              type="text"
              className="input"
              style={{ width: '100%' }}
              placeholder="e.g., harbor street market / arena game"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="ev-mult-input" style={{ marginBottom: 4 }}>
              <span>assumed multiplier</span>
            </label>
            <input
              id="ev-mult-input"
              type="number"
              step={0.05}
              min={0.5}
              max={2.0}
              className="input"
              style={{ width: 96 }}
              value={newEventMult}
              onChange={(e) => setNewEventMult(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!newEventName.trim()}
            onClick={() => {
              const targetDate = newEventDate || days[0]?.date;
              if (!targetDate || !newEventName.trim()) return;
              const parsed = parseFloat(newEventMult);
              const mult = Number.isFinite(parsed) && Math.abs(parsed - 1) > 0.001 ? parsed : undefined;
              addOwnerEvent(targetDate, newEventName.trim(), mult);
              setNewEventName('');
            }}
          >
            add event
          </button>
        </div>

        {radarContext.events.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>date</th>
                  <th>event name</th>
                  <th>evidence &amp; multiplier</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {radarContext.events.map((ev, idx) => (
                  <tr key={`${ev.date}-${ev.name}-${idx}`}>
                    <td className="mono">{ev.date}</td>
                    <td>{ev.name}</td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>
                      {ev.assumedMultiplier != null
                        ? `assumed · ${ev.assumedMultiplier.toFixed(2)}x`
                        : 'flag-only · 1.00x'}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => removeOwnerEvent(idx)}
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

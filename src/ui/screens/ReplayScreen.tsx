import { useEffect, useMemo, useState } from 'react';
import { snapshotAt } from '../../api';
import { NextStep } from '../components/NextStep';
import { useAppStore } from '../store/useAppStore';
import { formatMinutesToClock } from '../utils/format';

export function ReplayScreen() {
  const experimentResult = useAppStore((s) => s.experimentResult);
  const currentLayout = useAppStore((s) => s.currentLayout);
  const altLayout = useAppStore((s) => s.altLayout);
  const window = useAppStore((s) => s.window);
  const setScreen = useAppStore((s) => s.setScreen);

  const [scenarioId, setScenarioId] = useState<'current' | 'alternative'>('alternative');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 4 | 16>(4);
  const [clockMin, setClockMin] = useState<number>(window.startMin);

  const replayEntry = useMemo(() => {
    if (!experimentResult) return null;
    return (
      experimentResult.replay.find((r) => r.scenarioId === scenarioId) ??
      experimentResult.replay[0] ??
      null
    );
  }, [experimentResult, scenarioId]);

  const maxEventMin = useMemo(() => {
    if (!experimentResult) return window.endMin + 60;
    const allLast = experimentResult.replay.map((r) =>
      r.run.events.length ? r.run.events[r.run.events.length - 1].t : window.endMin,
    );
    return Math.max(window.endMin, ...allLast);
  }, [experimentResult, window.endMin]);

  useEffect(() => {
    setClockMin(window.startMin);
    setPlaying(false);
  }, [experimentResult, window.startMin]);

  useEffect(() => {
    if (!playing) return;
    const intervalMs = 150;
    const stepMin = speed === 1 ? 1 : speed === 4 ? 2 : 5;
    const timer = globalThis.setInterval(() => {
      setClockMin((prev) => {
        if (prev + stepMin >= maxEventMin) {
          setPlaying(false);
          return maxEventMin;
        }
        return prev + stepMin;
      });
    }, intervalMs);
    return () => globalThis.clearInterval(timer);
  }, [playing, speed, maxEventMin]);

  if (!experimentResult || !replayEntry) {
    return (
      <div className="panel">
        <p>run a simulation first to unlock minute-by-minute service replay.</p>
        <button type="button" className="btn btn-primary" onClick={() => setScreen('scenarios')}>
          go to scenarios
        </button>
      </div>
    );
  }

  const activeLayout = scenarioId === 'current' ? currentLayout : altLayout;
  const snap = snapshotAt(replayEntry.run, activeLayout, clockMin);
  const snapMap = new Map(snap.tables.map((t) => [t.tableId, t]));

  const otherScenarioId = scenarioId === 'current' ? 'alternative' : 'current';
  const otherEntry = experimentResult.replay.find((r) => r.scenarioId === otherScenarioId);
  const otherLayout = otherScenarioId === 'current' ? currentLayout : altLayout;
  const otherSnap = otherEntry ? snapshotAt(otherEntry.run, otherLayout, clockMin) : null;

  const recentEvents = replayEntry.run.events
    .filter((e) => e.t <= clockMin)
    .slice(-14)
    .reverse();

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">service replay</h1>
          <p className="screen-subtitle">
            one typical simulated night (#{experimentResult.replayNightIndex + 1}), minute by minute. both layouts get the same guests.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => setScreen('scenarios')}>
            edit assumptions
          </button>
        </div>
      </div>

      <div className="panel replay-controls">
        <div className="segmented" role="tablist" aria-label="replay scenario selector">
          <button
            type="button"
            role="tab"
            aria-selected={scenarioId === 'current'}
            className={`segmented-btn ${scenarioId === 'current' ? 'active' : ''}`}
            onClick={() => setScenarioId('current')}
          >
            a · {currentLayout.name}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scenarioId === 'alternative'}
            className={`segmented-btn ${scenarioId === 'alternative' ? 'active' : ''}`}
            onClick={() => setScenarioId('alternative')}
          >
            b · {altLayout.name}
          </button>
        </div>

        <div className="replay-transport">
          <button
            type="button"
            className="btn btn-primary btn-lg replay-play"
            data-testid="replay-play-btn"
            onClick={() => {
              if (clockMin >= maxEventMin) setClockMin(window.startMin);
              setPlaying((p) => !p);
            }}
          >
            {playing ? '⏸ pause' : '▶ play'}
          </button>

          <div className="segmented" aria-label="playback speed">
            {([1, 4, 16] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`segmented-btn ${speed === s ? 'active' : ''}`}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          <input
            type="range"
            min={window.startMin}
            max={maxEventMin}
            step={1}
            value={clockMin}
            onChange={(e) => {
              setPlaying(false);
              setClockMin(Number(e.target.value));
            }}
            className="replay-scrubber"
            aria-label="replay time scrubber"
          />

          <span className="mono replay-clock">
            {formatMinutesToClock(clockMin)}
          </span>
        </div>
      </div>

      <section className="replay-counters" aria-label="replay counters">
        <div className="replay-counter"><span className="replay-counter-value">{snap.queue.length}</span><span>waiting now</span></div>
        <div className="replay-counter"><span className="replay-counter-value">{snap.seatedSoFar}</span><span>seated so far</span></div>
        <div className="replay-counter"><span className="replay-counter-value">{snap.abandonedSoFar}</span><span>walked away so far</span></div>
        {otherSnap && (
          <div className="replay-counter replay-counter-muted">
            <span>{otherScenarioId === 'current' ? 'layout a' : 'layout b'} at this minute</span>
            <span className="mono">{otherSnap.queue.length} waiting · {otherSnap.seatedSoFar} seated · {otherSnap.abandonedSoFar} walked</span>
          </div>
        )}
      </section>

      <section className={`panel replay-queue ${snap.queue.length ? 'has-queue' : ''}`} aria-label="modeled demand arrivals waiting (modeled wait)" data-testid="host-stand">
        <span className="host-stand-label">host stand</span>
        <strong className="host-stand-count">
          {snap.queue.length === 0
            ? 'queue: empty'
            : `queue: ${snap.queue.length} ${snap.queue.length === 1 ? 'party' : 'parties'} waiting (${((g) => `${g} ${g === 1 ? 'guest' : 'guests'}`)(snap.queue.reduce((g, q) => g + q.size, 0))})`}
        </strong>
        {snap.queue.length > 0 && (
          snap.queue.map((q) => (
            <span key={q.partyId} className="queue-chip" title={q.partyId}>
              {q.size}p · {q.waitedMin.toFixed(0)}m
            </span>
          ))
        )}
      </section>

      <div className="grid-sidebar-right">
        <section className="panel" style={{ padding: 14 }}>
          <div className="panel-header" style={{ marginBottom: 10 }}>
            <h2 className="panel-title">{activeLayout.name} at {formatMinutesToClock(clockMin)}</h2>
            <div className="replay-legend">
              <span><i className="swatch swatch-free" />available</span>
              <span><i className="swatch swatch-occupied" />occupied</span>
              <span><i className="swatch swatch-resetting" />being cleared</span>
            </div>
          </div>

          <div className="floor-canvas-wrap">
            <svg viewBox="0 0 800 500" className="floor-svg" data-testid="replay-floor-svg">
              <defs>
                <pattern id="replayGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="rgba(255, 255, 255, 0.1)" />
                </pattern>
              </defs>
              <rect x="0" y="0" width="800" height="500" fill="url(#replayGrid)" />

              {activeLayout.joins.map((j, idx) => {
                const tA = activeLayout.tables.find((t) => t.id === j.a);
                const tB = activeLayout.tables.find((t) => t.id === j.b);
                if (!tA || !tB) return null;
                const sA = snapMap.get(tA.id);
                const isJoinedNow = sA?.joinedWith?.includes(tB.id) ?? false;
                return (
                  <line
                    key={`${j.a}-${j.b}-${idx}`}
                    x1={tA.x + tA.w / 2}
                    y1={tA.y + tA.h / 2}
                    x2={tB.x + tB.w / 2}
                    y2={tB.y + tB.h / 2}
                    stroke={isJoinedNow ? '#fbbf24' : '#475569'}
                    strokeWidth={isJoinedNow ? 3.5 : 1.5}
                    strokeDasharray={isJoinedNow ? undefined : '4 3'}
                  />
                );
              })}

              {activeLayout.tables.map((t) => {
                const st = snapMap.get(t.id);
                const state = st?.state ?? 'free';
                const cx = t.x + t.w / 2;
                const cy = t.y + t.h / 2;
                const sub = state === 'occupied' ? `${st?.partySize ?? ''} guests` : state === 'resetting' ? 'clearing' : `${t.capacity}-top`;
                const narrow = t.w < 60;
                const left = state === 'occupied' && st?.remainingMin != null ? `${Math.max(0, Math.round(st.remainingMin))}m left` : null;
                return (
                  <g key={t.id} className={`replay-table is-${state}`}>
                    <title>{`${t.name} · seats ${t.capacity} · ${state === 'occupied' ? `${st?.partyId} (${st?.partySize} guests)${st?.joinedWith ? ', joined' : ''}` : state}`}</title>
                    {t.shape === 'round' ? (
                      <circle cx={cx} cy={cy} r={Math.min(t.w, t.h) / 2} />
                    ) : (
                      <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={6} />
                    )}
                    <text x={cx} y={cy - (left ? 7 : 3)} textAnchor="middle" className="replay-table-name">
                      {t.name}
                    </text>
                    <text x={cx} y={cy + (left ? 6 : 12)} textAnchor="middle" className="replay-table-sub">
                      {narrow && state === 'occupied' ? `${st?.partySize}p` : narrow && state === 'resetting' ? 'clear' : narrow ? `${t.capacity}p` : sub}
                    </text>
                    {left && (
                      <text x={cx} y={cy + 18} textAnchor="middle" className="replay-table-left">
                        {narrow ? left.replace(' left', '') : left}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">event log</h2>
          </div>
          {recentEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'lowercase' }}>
              scrub forward or press play to observe modeled events.
            </div>
          ) : (
            <ul className="event-log">
              {recentEvents.map((ev, i) => (
                <li key={`${ev.t}-${ev.type}-${i}`} className="mono">
                  <strong style={{ color: 'var(--ink)' }}>{formatMinutesToClock(ev.t)}</strong> ·{' '}
                  {ev.type === 'arrive' && `modeled arrival ${ev.partyId} (${ev.size}p)`}
                  {ev.type === 'seat' &&
                    `seated ${ev.partyId} -> ${ev.tableIds.map((x) => x.toLowerCase()).join('+')} (modeled wait ${ev.waitMin.toFixed(0)}m)`}
                  {ev.type === 'depart' &&
                    `departed ${ev.partyId} from ${ev.tableIds.map((x) => x.toLowerCase()).join('+')}`}
                  {ev.type === 'tableReady' &&
                    `table ready ${ev.tableIds.map((x) => x.toLowerCase()).join('+')}`}
                  {ev.type === 'abandon' &&
                    `modeled abandon ${ev.partyId} after ${ev.waitedMin.toFixed(0)}m`}
                  {ev.type === 'unseatedAtClose' && `unseated at close: ${ev.partyId}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <NextStep label="proceed to compare layouts & takeaway →" testId="to-compare-btn" onClick={() => setScreen('compare')} />
    </div>
  );
}

import type { ReactNode } from 'react';
import { seatsOf } from '../../api';
import { useAppStore, type ScreenId } from '../store/useAppStore';
import { TourButton } from './GuidedTour';

const SPINE_ITEMS: { id: ScreenId; label: string; requiresData?: boolean; requiresSim?: boolean }[] = [
  { id: 'start', label: 'import pos data' },
  { id: 'review', label: 'data review', requiresData: true },
  { id: 'floorplan', label: 'table layouts', requiresData: true },
  { id: 'scenarios', label: 'scenarios & simulation', requiresData: true },
  { id: 'replay', label: 'service replay', requiresSim: true },
  { id: 'compare', label: 'compare layouts', requiresSim: true },
];

const FLOW: { label: string; screens: ScreenId[] }[] = [
  { label: 'import data', screens: ['start', 'review'] },
  { label: 'table layouts', screens: ['floorplan'] },
  { label: 'simulation & replay', screens: ['scenarios', 'replay'] },
  { label: 'executive results', screens: ['compare'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const activeScreen = useAppStore((s) => s.activeScreen);
  const setScreen = useAppStore((s) => s.setScreen);
  const setView = useAppStore((s) => s.setView);
  const runSimulation = useAppStore((s) => s.runSimulation);
  const importResult = useAppStore((s) => s.importResult);
  const experimentResult = useAppStore((s) => s.experimentResult);
  const currentLayout = useAppStore((s) => s.currentLayout);
  const altLayout = useAppStore((s) => s.altLayout);
  const volume = useAppStore((s) => s.volume);
  const setVolumeHistory = useAppStore((s) => s.setVolumeHistory);

  const hasData = Boolean(importResult && importResult.rows.length > 0 && importResult.mapping);
  const hasSim = Boolean(experimentResult);
  const isSample = Boolean(importResult?.report.isSample);

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="primary navigation">
        <div>
          <button type="button" className="back-link" data-testid="back-to-landing" onClick={() => setView('landing')}>
            ← back to landing
          </button>
          <TourButton className="btn btn-sm tour-side-btn" />
          <div className="brand-header">
            <div className="brand-mark-row">
              <span className="brand-symbol" aria-hidden="true">r</span>
              <span className="brand-title">runway</span>
            </div>
            <div className="brand-subtitle">
              {hasData
                ? isSample
                  ? 'synthetic demo data'
                  : 'custom pos workspace'
                : 'plan rush hour for your restaurant'}
            </div>
          </div>

          <div className="nav-section-label">test table layouts</div>
          <ul className="nav-list">
            {SPINE_ITEMS.map((item) => {
              const disabled = (item.requiresData || item.requiresSim) && !hasData;
              const isActive = activeScreen === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    id={`nav-${item.id}`}
                    className={`nav-btn ${isActive ? 'active' : ''}`}
                    disabled={disabled}
                    onClick={() => {
                      // results screens never dead-end: run the paired simulation first (~100 ms)
                      if (item.requiresSim && !hasSim) runSimulation();
                      setScreen(item.id);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.id === 'compare' && hasSim && (
                      <span className="nav-status-dot" title="simulation results ready" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="nav-section-label" style={{ marginTop: 14 }}>
            demand &amp; reference
          </div>
          <ul className="nav-list">
            <li>
              <button
                type="button"
                className={`nav-btn ${activeScreen === 'radar' ? 'active' : ''}`}
                disabled={!hasData}
                onClick={() => setScreen('radar')}
              >
                <span>7-day demand outlook</span>
                {volume.source === 'radar' && (
                  <span className="nav-status-dot" title="forecast scenario active" />
                )}
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-btn ${activeScreen === 'method' ? 'active' : ''}`}
                onClick={() => setScreen('method')}
              >
                <span>method &amp; limitations</span>
              </button>
            </li>
          </ul>
        </div>

        <div style={{ padding: '12px 8px 4px 8px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--muted)' }}>
          <div style={{ fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>active room</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>current</span>
            <span className="mono">{currentLayout.tables.length} tbl · {seatsOf(currentLayout)} seats</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>alternative</span>
            <span className="mono">{altLayout.tables.length} tbl · {seatsOf(altLayout)} seats</span>
          </div>
        </div>
      </aside>

      <div className="app-sheet-wrap">
        <main className="app-sheet">
          {isSample && (
            <div className="sample-ribbon" role="status" data-testid="sample-data-ribbon">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="sample-ribbon-badge">SAMPLE DATA (synthetic)</span>
                <span style={{ textTransform: 'lowercase' }}>
                  synthetic demo data, not real restaurant measurements.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setScreen('start')}
              >
                switch dataset
              </button>
            </div>
          )}

          {volume.source === 'radar' && (
            <div className="demand-banner" role="region" aria-label="active demand forecast scenario">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', textTransform: 'lowercase' }}>
                <strong style={{ color: 'var(--ink)' }}>active forecast input:</strong>
                <span>
                  {volume.scenario.date} ({volume.band} band: {volume.scenario.parties[volume.band]} forecast recorded parties / {volume.scenario.covers[volume.band]} covers)
                </span>
                <span>·</span>
                <span>{volume.latentDemandMultiplier.toFixed(2)}x latent-demand assumption</span>
              </div>
              <button type="button" className="btn btn-sm" onClick={setVolumeHistory}>
                reset to historical nights
              </button>
            </div>
          )}

          <ol className="flow-steps" aria-label="workflow progress">
            {FLOW.map((f, i) => {
              const on = f.screens.includes(activeScreen);
              const go = () => {
                if (i === 3 && !hasSim) runSimulation();
                setScreen(f.screens[0]);
              };
              return (
                <li key={f.label} className={on ? 'is-active' : ''} aria-current={on ? 'step' : undefined}>
                  <button type="button" disabled={i > 0 && !hasData} onClick={go}>
                    <span className="flow-num">{i + 1}</span>{f.label}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="sheet-content">{children}</div>
        </main>
      </div>
    </div>
  );
}

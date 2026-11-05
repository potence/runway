import { NextStep } from '../components/NextStep';
import { useAppStore } from '../store/useAppStore';
import { explainNoDifference } from '../../api';
import { ProvenanceFromObj } from '../components/ProvenanceBadge';
import { formatMetricValue, formatSignedDelta } from '../utils/format';
import { TakeawayCard } from '../components/TakeawayCard';
import { AiReview } from '../components/AiReview';

export function CompareScreen() {
  const experimentResult = useAppStore((s) => s.experimentResult);
  const activePresetDisclosure = useAppStore((s) => s.activePresetDisclosure);
  const currentLayout = useAppStore((s) => s.currentLayout);
  const altLayout = useAppStore((s) => s.altLayout);
  const nights = useAppStore((s) => s.nights);
  const seed = useAppStore((s) => s.seed);
  const setScreen = useAppStore((s) => s.setScreen);
  const volume = useAppStore((s) => s.volume);
  const testPeakRush = useAppStore((s) => s.testPeakRush);

  if (!experimentResult) {
    return (
      <div className="panel">
        <p>no simulation has been run yet.</p>
        <button type="button" className="btn btn-primary" onClick={() => setScreen('scenarios')}>
          go to scenarios
        </button>
      </div>
    );
  }

  const { demandBanner, assumptions, metrics, warnings, demand } = experimentResult;

  const coversMetric = metrics.find((m) => m.key === 'seatedCovers');
  const waitMetric = metrics.find((m) => m.key === 'meanWaitMin');
  const abandonMetric = metrics.find((m) => m.key === 'abandonedParties');

  const coversPaired = coversMetric?.paired[0];
  const waitPaired = waitMetric?.paired[0];
  const abandonPaired = abandonMetric?.paired[0];

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">compare layouts</h1>
          <p className="screen-subtitle">
            {currentLayout.name.toLowerCase()} vs {altLayout.name.toLowerCase()}, {nights} paired nights.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => setScreen('scenarios')}>
            edit assumptions
          </button>
        </div>
      </div>

      {activePresetDisclosure && (
        <div className="notice notice-neutral" data-testid="preset-disclosure-banner" style={{ marginBottom: 12 }}>
          {activePresetDisclosure}
        </div>
      )}

      <TakeawayCard result={experimentResult} altName={altLayout.name} seed={seed} />
      {(() => {
        const why = explainNoDifference(experimentResult);
        if (!why) return null;
        const atPeak = volume.source === 'history' && volume.latentDemandMultiplier >= 1.25;
        return (
          <section className="nodiff" data-testid="no-difference-explainer">
            <h2>why there is no clear difference</h2>
            <p>{why}</p>
            {atPeak ? (
              <p>even with demand assumed {volume.latentDemandMultiplier.toFixed(2)}× above what was seated, these two layouts perform about the same. try an alternative with more combinable two-tops, or raise the demand assumption on the scenarios screen.</p>
            ) : (
              <>
                <p>combinable tables pay off when the room is full, during a peak rush, not on a quiet night. to see where table bottlenecks appear, test both layouts on saturday dinners with demand assumed 25% above what was seated:</p>
                <button type="button" className="btn btn-primary" data-testid="test-peak-rush-btn" onClick={testPeakRush}>
                  ⚡ test under peak saturday rush (1.25× demand)
                </button>
              </>
            )}
          </section>
        );
      })()}

      <AiReview />

      <div className="basis-line" data-testid="verbatim-demand-banner">
        <strong>how demand was modeled:</strong> {demandBanner}
      </div>

      {warnings.map((w, i) => (
        <div key={i} className="notice">
          <strong>simulation warning:</strong> {w}
        </div>
      ))}

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">paired scenario metrics</h2>
            <div className="panel-meta">
              brackets show the spread across simulated nights, not a calibrated interval.
            </div>
          </div>
        </div>

        <div className="data-table-wrap">
          <table className="data-table" data-testid="compare-metrics-table">
            <thead>
              <tr>
                <th>metric</th>
                <th>provenance</th>
                <th className="num">
                  {currentLayout.name}
                  <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--faint)' }}>
                    mean (empirical 10th-90th across simulated nights)
                  </div>
                </th>
                <th className="num">
                  {altLayout.name}
                  <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--faint)' }}>
                    mean (empirical 10th-90th across simulated nights)
                  </div>
                </th>
                <th className="num">
                  paired delta (alt - base)
                  <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--faint)' }}>
                    mean (empirical 10th-90th)
                  </div>
                </th>
                <th className="num">wins / nights</th>
                <th>decision status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const base = m.perScenario['current'];
                const alt = m.perScenario['alternative'];
                const p = m.paired.find((x) => x.scenarioId === 'alternative') ?? m.paired[0];
                if (!base || !alt || !p) return null;

                const improved = m.higherIsBetter ? p.meanDelta > 0 : p.meanDelta < 0;
                const degraded = m.higherIsBetter ? p.meanDelta < 0 : p.meanDelta > 0;
                const deltaColor = p.noClearDifference
                  ? 'var(--muted)'
                  : improved
                    ? 'var(--positive)'
                    : degraded
                      ? 'var(--negative)'
                      : 'var(--ink)';

                return (
                  <tr key={m.key}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--ink)', textTransform: 'lowercase' }} title={m.provenance.basis}>{m.label}</div>
                    </td>
                    <td>
                      <ProvenanceFromObj provenance={m.provenance} />
                    </td>
                    <td className="num">
                      <div style={{ fontWeight: 600 }}>{formatMetricValue(base.mean, m.unit)}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        [{formatMetricValue(base.p10, m.unit)} - {formatMetricValue(base.p90, m.unit)}]
                      </div>
                    </td>
                    <td className="num">
                      <div style={{ fontWeight: 600 }}>{formatMetricValue(alt.mean, m.unit)}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        [{formatMetricValue(alt.p10, m.unit)} - {formatMetricValue(alt.p90, m.unit)}]
                      </div>
                    </td>
                    <td className="num" style={{ color: deltaColor, fontWeight: 600 }}>
                      <div>{formatSignedDelta(p.meanDelta, m.unit)}</div>
                      <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>
                        [{formatSignedDelta(p.p10, m.unit)} to {formatSignedDelta(p.p90, m.unit)}]
                      </div>
                    </td>
                    <td className="num mono">
                      {p.wins} / {p.nights}
                    </td>
                    <td className="mono" style={{ color: 'var(--muted)', textTransform: 'lowercase' }}>
                      {p.noClearDifference
                        ? 'no clear difference'
                        : improved
                          ? 'alternative leads'
                          : 'baseline leads'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">active simulation assumptions</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {assumptions.map((chip) => (
            <div
              key={chip.key}
              style={{
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--raised)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500, textTransform: 'lowercase' }}>{chip.label}</span>
                <ProvenanceFromObj provenance={chip.provenance} />
              </div>
              <div className="mono" style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--ink)' }}>
                {chip.value}
              </div>
            </div>
          ))}
        </div>
      </section>
      <NextStep label="see the 7-day demand outlook →" testId="to-radar-btn" onClick={() => setScreen('radar')} />
    </div>
  );
}

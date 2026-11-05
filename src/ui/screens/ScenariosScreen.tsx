import type { Policy } from '../../domain/types';
import { seatsOf } from '../../api';
import { NextStep } from '../components/NextStep';
import { useAppStore } from '../store/useAppStore';
import { DOW_SHORT, formatMinutesToClock } from '../utils/format';

function PolicyEditorCard({
  title,
  subtitle,
  policy,
  onChange,
}: {
  title: string;
  subtitle: string;
  policy: Policy;
  onChange: (patch: Partial<Policy>) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{title}</h2>
          <div className="panel-meta">{subtitle}</div>
        </div>
      </div>

      <div className="field-row">
        <label className="field-label">
          <span>table nesting policy</span>
        </label>
        <select
          className="select"
          value={policy.nesting}
          onChange={(e) => onChange({ nesting: e.target.value as 'full' | 'none' })}
        >
          <option value="full">full nesting (any table &gt;= party size, best fit first)</option>
          <option value="none">no oversize nesting (smallest fitting capacity tier only)</option>
        </select>
        <span className="field-hint">
          queue discipline is strict first-come-first-served within each party size.
        </span>
      </div>

      <div className="field-row">
        <label className="field-label">
          <span>allow combinable table joins</span>
        </label>
        <select
          className="select"
          value={policy.allowJoins ? 'yes' : 'no'}
          onChange={(e) => onChange({ allowJoins: e.target.value === 'yes' })}
        >
          <option value="yes">enabled (combine linked tables when no single table fits)</option>
          <option value="no">disabled (single tables only)</option>
        </select>
      </div>

      <div className="grid-2">
        <div className="field-row">
          <label className="field-label">
            <span>table reset / bussing (min)</span>
          </label>
          <input
            type="number"
            min={0}
            max={30}
            className="input"
            value={policy.resetMin}
            onChange={(e) => onChange({ resetMin: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>

        <div className="field-row">
          <label className="field-label">
            <span>join setup overhead (min)</span>
          </label>
          <input
            type="number"
            min={0}
            max={30}
            className="input"
            value={policy.joinSetupMin}
            onChange={(e) => onChange({ joinSetupMin: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>
    </section>
  );
}

export function ScenariosScreen() {
  const currentLayout = useAppStore((s) => s.currentLayout);
  const altLayout = useAppStore((s) => s.altLayout);
  const currentPolicy = useAppStore((s) => s.currentPolicy);
  const altPolicy = useAppStore((s) => s.altPolicy);
  const tableUse = useAppStore((s) => s.tableUse);
  const patience = useAppStore((s) => s.patience);
  const window = useAppStore((s) => s.window);
  const nights = useAppStore((s) => s.nights);
  const seed = useAppStore((s) => s.seed);
  const volume = useAppStore((s) => s.volume);
  const reconstruction = useAppStore((s) => s.reconstruction);
  const activePresetDisclosure = useAppStore((s) => s.activePresetDisclosure);
  const experimentResult = useAppStore((s) => s.experimentResult);

  const updateCurrentPolicy = useAppStore((s) => s.updateCurrentPolicy);
  const updateAltPolicy = useAppStore((s) => s.updateAltPolicy);
  const updateTableUse = useAppStore((s) => s.updateTableUse);
  const updatePatience = useAppStore((s) => s.updatePatience);
  const updateWindow = useAppStore((s) => s.updateWindow);
  const setNights = useAppStore((s) => s.setNights);
  const setSeed = useAppStore((s) => s.setSeed);
  const setLatentMultiplier = useAppStore((s) => s.setLatentMultiplier);
  const setVolumeHistory = useAppStore((s) => s.setVolumeHistory);
  const testPeakRush = useAppStore((s) => s.testPeakRush);
  const runSimulation = useAppStore((s) => s.runSimulation);
  const setScreen = useAppStore((s) => s.setScreen);

  const toggleDow = (d: number) => {
    const exists = window.dows.includes(d);
    const nextDows = exists
      ? window.dows.filter((x) => x !== d)
      : [...window.dows, d].sort((a, b) => a - b);
    if (nextDows.length === 0) return;
    updateWindow({ dows: nextDows });
  };

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">scenarios &amp; assumptions</h1>
          <p className="screen-subtitle">
            every setting below is an assumption you can change. both layouts face the same modeled guests.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => setScreen('floorplan')}>
            table layouts
          </button>
          <button type="button" className="btn" data-testid="peak-rush-btn" onClick={testPeakRush}>
            saturday rush (assumed 1.25×)
          </button>
          <button
            type="button"
            className="btn btn-primary"
            id="run-sim-btn"
            data-testid="run-simulation-btn"
            onClick={runSimulation}
          >
            run simulation ({nights} nights)
          </button>
        </div>
      </div>

      {activePresetDisclosure && (
        <div className="notice notice-neutral" data-testid="preset-disclosure-banner" style={{ marginBottom: 16 }}>
          {activePresetDisclosure}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <PolicyEditorCard
          title={`baseline: ${currentLayout.name}`}
          subtitle={`${currentLayout.tables.length} tables · ${seatsOf(currentLayout)} seats · ${currentLayout.joins.length} join links`}
          policy={currentPolicy}
          onChange={updateCurrentPolicy}
        />
        <PolicyEditorCard
          title={`alternative: ${altLayout.name}`}
          subtitle={`${altLayout.tables.length} tables · ${seatsOf(altLayout)} seats · ${altLayout.joins.length} join links`}
          policy={altPolicy}
          onChange={updateAltPolicy}
        />
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">demand volume &amp; table-use offsets</h2>
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor="latent-mult-input">
              <span>latent-demand multiplier (default 1.00x)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id="latent-mult-input"
                type="number"
                step={0.05}
                min={0.5}
                max={2.0}
                className="input"
                style={{ width: 110 }}
                value={volume.latentDemandMultiplier}
                onChange={(e) =>
                  setLatentMultiplier(Math.max(0.5, Math.min(2.5, Number(e.target.value) || 1.0)))
                }
              />
              {[1.0, 1.1, 1.25, 1.3].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`btn btn-sm ${
                    Math.abs(volume.latentDemandMultiplier - preset) < 0.001 ? 'btn-primary' : ''
                  }`}
                  onClick={() => setLatentMultiplier(preset)}
                >
                  {preset.toFixed(2)}x
                </button>
              ))}
            </div>
            <span className="field-hint">
              {reconstruction && reconstruction.capacityLimitedNights > 0
                ? `${reconstruction.capacityLimitedNights} historical nights reached 90%+ concurrent table use; recorded checks may understate demand, so >1.00x stress-tests unseen demand.`
                : 'scales recorded party counts to test higher or lower demand.'}
            </span>
          </div>

          <div className="field-row">
            <label className="field-label">
              <span>volume basis source</span>
            </label>
            {volume.source === 'radar' ? (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--raised)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12.5,
                  textTransform: 'lowercase',
                }}
              >
                <span>
                  7-day outlook <strong>{volume.scenario.date}</strong> ({volume.band}:{' '}
                  {volume.scenario.parties[volume.band]} recorded parties)
                </span>
                <button type="button" className="btn btn-sm" onClick={setVolumeHistory}>
                  use historical resampling
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', textTransform: 'lowercase' }}>
                historical night resampling across selected weekdays (or open 7-day demand outlook to simulate a
                specific forecast date).
              </div>
            )}
          </div>

          <div className="grid-2">
            <div className="field-row">
              <label className="field-label" htmlFor="open-lag-input">
                <span>pre-open table lag (min)</span>
              </label>
              <input
                id="open-lag-input"
                type="number"
                min={0}
                max={30}
                className="input"
                value={tableUse.openLagMin}
                onChange={(e) =>
                  updateTableUse({ openLagMin: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              <span className="field-hint">minutes table is occupied before pos check-open.</span>
            </div>

            <div className="field-row">
              <label className="field-label" htmlFor="linger-input">
                <span>post-close linger (min)</span>
              </label>
              <input
                id="linger-input"
                type="number"
                min={0}
                max={45}
                className="input"
                value={tableUse.lingerMin}
                onChange={(e) =>
                  updateTableUse({ lingerMin: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              <span className="field-hint">minutes guests remain after pos payment/close.</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">guest patience, service window &amp; seed</h2>
          </div>

          <div className="grid-3">
            <div className="field-row">
              <label className="field-label" htmlFor="pat-small-input">
                <span>small party patience (min)</span>
              </label>
              <input
                id="pat-small-input"
                type="number"
                min={5}
                max={120}
                className="input"
                value={patience.smallPartyMin}
                onChange={(e) =>
                  updatePatience({ smallPartyMin: Math.max(1, Number(e.target.value) || 20) })
                }
              />
            </div>

            <div className="field-row">
              <label className="field-label" htmlFor="pat-large-input">
                <span>large party patience (min)</span>
              </label>
              <input
                id="pat-large-input"
                type="number"
                min={5}
                max={120}
                className="input"
                value={patience.largePartyMin}
                onChange={(e) =>
                  updatePatience({ largePartyMin: Math.max(1, Number(e.target.value) || 30) })
                }
              />
            </div>

            <div className="field-row">
              <label className="field-label" htmlFor="pat-threshold-input">
                <span>large party threshold</span>
              </label>
              <input
                id="pat-threshold-input"
                type="number"
                min={2}
                max={10}
                className="input"
                value={patience.largeFrom}
                onChange={(e) =>
                  updatePatience({ largeFrom: Math.max(2, Number(e.target.value) || 5) })
                }
              />
            </div>
          </div>

          <div className="field-row">
            <label className="field-label">
              <span>service window weekdays</span>
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DOW_SHORT.map((label, d) => {
                const active = window.dows.includes(d);
                return (
                  <button
                    key={label}
                    type="button"
                    className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                    onClick={() => toggleDow(d)}
                  >
                    {label.toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid-2">
            <div className="field-row">
              <label className="field-label">
                <span>window hours ({formatMinutesToClock(window.startMin)}-{formatMinutesToClock(window.endMin)})</span>
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  min={10}
                  max={21}
                  className="input"
                  style={{ width: 72 }}
                  value={Math.floor(window.startMin / 60)}
                  onChange={(e) =>
                    updateWindow({ startMin: Math.max(6, Math.min(21, Number(e.target.value) || 17)) * 60 })
                  }
                />
                <span>:00 to</span>
                <input
                  type="number"
                  min={18}
                  max={24}
                  className="input"
                  style={{ width: 72 }}
                  value={Math.floor(window.endMin / 60)}
                  onChange={(e) =>
                    updateWindow({ endMin: Math.max(18, Math.min(24, Number(e.target.value) || 22)) * 60 })
                  }
                />
                <span>:00</span>
              </div>
            </div>

            <div className="field-row">
              <label className="field-label">
                <span>simulated nights &amp; rng seed</span>
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="number"
                  min={10}
                  max={500}
                  className="input"
                  style={{ width: 90 }}
                  aria-label="simulated nights"
                  value={nights}
                  onChange={(e) => setNights(Number(e.target.value) || 200)}
                />
                <input
                  type="number"
                  className="input"
                  style={{ width: 90 }}
                  aria-label="rng seed"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 42)}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
      <NextStep label="run simulation & watch replay →" testId="next-step-btn" onClick={() => { runSimulation(); setScreen('replay'); }} />
    </div>
  );
}

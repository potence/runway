import { useState } from 'react';
import type { ColumnMapping, ExclusionReason } from '../../domain/types';
import { NextStep } from '../components/NextStep';
import { AiReview } from '../components/AiReview';
import { useAppStore } from '../store/useAppStore';
import { DOW_SHORT, formatMinutesToClock } from '../utils/format';

const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  voided: 'voided checks',
  notDineIn: 'takeout / delivery / non-dine-in',
  missingGuests: 'missing or zero guest count',
  invalidTimestamp: 'invalid check-open timestamp',
  missingClose: 'missing check-close/paid timestamp',
  invalidDuration: 'non-positive check duration (<= 0 min)',
  outlierDuration: 'outlier check duration (> 300 min)',
};

export function DataReviewScreen() {
  const importResult = useAppStore((s) => s.importResult);
  const importNotice = useAppStore((s) => s.importNotice);
  const dismissImportNotice = useAppStore((s) => s.dismissImportNotice);
  const reconstruction = useAppStore((s) => s.reconstruction);
  const tableUse = useAppStore((s) => s.tableUse);
  const applyManualMapping = useAppStore((s) => s.applyManualMapping);
  const setScreen = useAppStore((s) => s.setScreen);
  const demoBanner = useAppStore((s) => s.demoBanner);
  const dismissDemoBanner = useAppStore((s) => s.dismissDemoBanner);
  const hasSim = useAppStore((s) => Boolean(s.experimentResult));
  const runSimulation = useAppStore((s) => s.runSimulation);

  const headers = importResult?.headers ?? [];
  const [draftMap, setDraftMap] = useState<ColumnMapping>({
    opened: importResult?.mapping?.opened ?? headers[0] ?? '',
    closed: importResult?.mapping?.closed ?? headers[1] ?? '',
    guests: importResult?.mapping?.guests ?? headers[2] ?? '',
    table: importResult?.mapping?.table ?? '',
    area: importResult?.mapping?.area ?? '',
    amount: importResult?.mapping?.amount ?? '',
    voided: importResult?.mapping?.voided ?? '',
    diningOption: importResult?.mapping?.diningOption ?? '',
  });

  if (!importResult) {
    return (
      <div className="panel">
        <p>no dataset loaded yet.</p>
        <button type="button" className="btn btn-primary" onClick={() => setScreen('start')}>
          go to import screen
        </button>
      </div>
    );
  }

  const { report, mapping } = importResult;

  if (mapping === null) {
    return (
      <div>
        <div className="screen-header">
          <div>
            <h1 className="screen-title">map csv columns</h1>
            <p className="screen-subtitle">
              automatic toast header detection could not find required columns ({importResult.missing.join(', ')}).
              select the matching columns from your csv headers below.
            </p>
          </div>
          <div className="header-actions">
            <button type="button" className="btn" onClick={() => setScreen('start')}>
              back to import
            </button>
          </div>
        </div>

        <section className="panel" style={{ maxWidth: 640 }}>
          <div className="panel-header">
            <h2 className="panel-title">column mapping configuration</h2>
          </div>

          {(
            [
              { key: 'opened', label: 'check open timestamp (required)', req: true },
              { key: 'closed', label: 'check paid / close timestamp (required)', req: true },
              { key: 'guests', label: 'guest count / covers (required)', req: true },
              { key: 'table', label: 'table identifier (optional)', req: false },
              { key: 'area', label: 'dining area (optional)', req: false },
              { key: 'amount', label: 'net check amount (optional)', req: false },
              { key: 'voided', label: 'voided flag (optional)', req: false },
              { key: 'diningOption', label: 'dining option / takeout filter (optional)', req: false },
            ] as const
          ).map((field) => (
            <div className="field-row" key={field.key}>
              <label className="field-label" htmlFor={`map-${field.key}`}>
                <span>{field.label}</span>
              </label>
              <select
                id={`map-${field.key}`}
                className="select"
                value={draftMap[field.key] ?? ''}
                onChange={(e) =>
                  setDraftMap((prev) => ({
                    ...prev,
                    [field.key]: e.target.value || undefined,
                  }))
                }
              >
                <option value="">{field.req ? 'select column' : 'none'}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draftMap.opened || !draftMap.closed || !draftMap.guests}
              onClick={() =>
                applyManualMapping({
                  opened: draftMap.opened,
                  closed: draftMap.closed,
                  guests: draftMap.guests,
                  table: draftMap.table || undefined,
                  area: draftMap.area || undefined,
                  amount: draftMap.amount || undefined,
                  voided: draftMap.voided || undefined,
                  diningOption: draftMap.diningOption || undefined,
                })
              }
            >
              apply mapping
            </button>
          </div>
        </section>
      </div>
    );
  }

  const totalExcluded = report.rowsRead - report.rowsUsed;
  const totalParties = reconstruction?.partySizeCounts.reduce((s, x) => s + x.parties, 0) ?? 1;
  const maxProfileGuests = Math.max(
    1,
    reconstruction?.configuredSeats ?? 1,
    ...(reconstruction?.profile.map((p) => Math.max(p.meanOpenCheckGuests, p.meanTableUseGuests)) ?? [1]),
  );

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">data review &amp; historical reconstruction</h1>
          <p className="screen-subtitle">
            what your pos history says about your busy nights. a check opening is when an order started, not when guests
            walked in, so past wait times are not visible here.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => setScreen('start')}>
            change csv
          </button>
        </div>
      </div>

      {demoBanner && (
        <div className="demo-banner fade-in" role="status" data-testid="demo-banner">
          <span>{demoBanner}</span>
          <div className="demo-banner-actions">
            <button type="button" className="btn btn-primary btn-sm" data-testid="demo-jump-compare"
              onClick={() => { if (!hasSim) runSimulation(); setScreen('compare'); dismissDemoBanner(); }}>
              compare layouts →
            </button>
            <button type="button" className="link-btn" onClick={dismissDemoBanner} aria-label="dismiss">×</button>
          </div>
        </div>
      )}

      {importNotice && (
        <div className="notice notice-positive import-toast fade-in" role="status" data-testid="import-notice">
          <span>{importNotice}</span>
          <button type="button" className="link-btn" onClick={dismissImportNotice} aria-label="dismiss">×</button>
        </div>
      )}

      {[...report.warnings, ...(reconstruction?.warnings ?? [])].map((w, i) => (
        <div key={i} className="notice">
          <strong>data consistency note:</strong> {w}
        </div>
      ))}

      <AiReview mode="data" />

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-label-row">
            <span>usable dine-in checks</span>
          </div>
          <div className="kpi-help">dine-in checks in the whole file with an open time, close time and guest count. voided, takeout/delivery and broken rows are set aside (see the cleaning ledger below).</div>
          <div className="kpi-value lead">
            {report.rowsUsed.toLocaleString()}
            <span className="kpi-unit">/ {report.rowsRead.toLocaleString()} read</span>
          </div>
          <div className="kpi-sub">
            {totalExcluded.toLocaleString()} rows excluded ({((totalExcluded / Math.max(1, report.rowsRead)) * 100).toFixed(1)}%)
          </div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-label-row">
            <span>active nights</span>
          </div>
          <div className="kpi-help">dinner services analyzed: only the days and hours you are studying.</div>
          <div className="kpi-value">
            {reconstruction?.nights.length ?? 0}
            <span className="kpi-unit">nights</span>
          </div>
          <div className="kpi-sub">
            {`of ${report.nightsByDow.reduce((a, b) => a + b, 0)} nights in the file`}
            {report.dateRange ? ` · ${report.dateRange[0]} to ${report.dateRange[1]}` : ''}
          </div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-label-row">
            <span>capacity-limited nights</span>
          </div>
          <div className="kpi-help">nights when 90% or more of your tables were in use at once at the peak. walk-ins likely could not be seated, so recorded checks understate real demand.</div>
          <div className="kpi-value">
            {reconstruction?.capacityLimitedNights ?? 0}
            <span className="kpi-unit">of {reconstruction?.nights.length ?? 0} nights</span>
          </div>
          <div className="kpi-sub">
            recorded checks may understate demand during peak periods
          </div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-label-row">
            <span>observed covers</span>
          </div>
          <div className="kpi-help">total guests seated in these nights, as recorded by your pos.</div>
          <div className="kpi-value">
            {(reconstruction?.nights.reduce((sum, n) => sum + n.recordedCovers, 0) ?? 0).toLocaleString()}
            <span className="kpi-unit">guests</span>
          </div>
          <div className="kpi-sub">
            {reconstruction?.meanNetPerCover != null ? `$${reconstruction.meanNetPerCover.toFixed(2)} average spend per guest` : 'no check amounts in this file'}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">row cleaning ledger</h2>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>exclusion reason</th>
                  <th className="num">rows dropped</th>
                  <th className="num">share of raw</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(EXCLUSION_LABELS) as ExclusionReason[]).map((key) => {
                  const count = report.excluded[key] ?? 0;
                  return (
                    <tr key={key}>
                      <td>{EXCLUSION_LABELS[key]}</td>
                      <td className="num">{count.toLocaleString()}</td>
                      <td className="num">
                        {((count / Math.max(1, report.rowsRead)) * 100).toFixed(1)}%
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
            <h2 className="panel-title">recorded nights by weekday &amp; mapped columns</h2>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              distinct business dates per weekday across dataset:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {DOW_SHORT.map((day, d) => {
                const count = report.nightsByDow[d] ?? 0;
                return (
                  <div
                    key={day}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '6px 8px',
                      background: count > 0 ? 'var(--surface)' : 'var(--raised)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'lowercase' }}>{day}</div>
                    <div className="num" style={{ textAlign: 'center', fontWeight: 600, fontSize: 15 }}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            detected pos column bindings:
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <tbody>
                <tr>
                  <td>check open / close</td>
                  <td className="mono num">
                    {mapping.opened} / {mapping.closed}
                  </td>
                </tr>
                <tr>
                  <td>guests / table / area</td>
                  <td className="mono num">
                    {mapping.guests} · {mapping.table ?? '-'} · {mapping.area ?? '-'}
                  </td>
                </tr>
                <tr>
                  <td>amount / voided / option</td>
                  <td className="mono num">
                    {mapping.amount ?? '-'} · {mapping.voided ?? '-'} · {mapping.diningOption ?? '-'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {reconstruction && (
        <div className="grid-2" style={{ marginBottom: 18 }}>
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">observed party-size distribution</h2>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>party size</th>
                    <th>proportion</th>
                    <th className="num">recorded parties</th>
                    <th className="num">share</th>
                  </tr>
                </thead>
                <tbody>
                  {reconstruction.partySizeCounts.map((row) => {
                    const share = (row.parties / Math.max(1, totalParties)) * 100;
                    return (
                      <tr key={row.size}>
                        <td className="mono">{row.size} guests</td>
                        <td style={{ width: '42%' }}>
                          <div
                            style={{
                              height: 6,
                              background: 'var(--raised)',
                              borderRadius: 2,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, share)}%`,
                                height: '100%',
                                background: 'var(--ink)',
                              }}
                            />
                          </div>
                        </td>
                        <td className="num">{row.parties.toLocaleString()}</td>
                        <td className="num">{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">check duration by party-size bucket</h2>
            </div>
            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: 'var(--muted)' }}>
              raw pos check duration (<code className="mono">checkclosemin - checkopenmin</code>). physical table use
              adds assumed open-lag ({tableUse.openLagMin} min) and post-close linger ({tableUse.lingerMin} min).
            </p>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>party bucket</th>
                    <th className="num">checks (n)</th>
                    <th className="num">p25 (min)</th>
                    <th className="num">median (min)</th>
                    <th className="num">p75 (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {reconstruction.durationByBucket.map((b) => (
                    <tr key={b.bucket}>
                      <td className="mono">{b.bucket} guests</td>
                      <td className="num">{b.n.toLocaleString()}</td>
                      <td className="num">{b.p25.toFixed(0)}m</td>
                      <td className="num" style={{ fontWeight: 600 }}>{b.median.toFixed(0)}m</td>
                      <td className="num">{b.p75.toFixed(0)}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {reconstruction && reconstruction.profile.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                pos-derived occupancy proxy (not verified occupancy)
              </h2>
              <div className="panel-meta">
                mean concurrent guests on open checks vs. estimated table-use intervals ({tableUse.openLagMin}m open-lag +{' '}
                {tableUse.lingerMin}m linger) across {reconstruction.nights.length} nights.
                {' '}configured seats: <strong>{reconstruction.configuredSeats}</strong>.
              </div>
            </div>
          </div>

          <svg
            viewBox="0 0 800 190"
            style={{ width: '100%', height: 'auto', display: 'block', borderBottom: '1px solid var(--rule)' }}
            role="img"
            aria-label="pos-derived occupancy proxy across 15-minute bins"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = 155 - frac * 130;
              const val = Math.round(frac * maxProfileGuests);
              return (
                <g key={frac}>
                  <line x1={48} y1={y} x2={780} y2={y} stroke="rgba(255, 255, 255, 0.07)" strokeWidth={1} />
                  <text x={40} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
                    {val}
                  </text>
                </g>
              );
            })}

            {reconstruction.configuredSeats <= maxProfileGuests && (
              <g>
                <line
                  x1={48}
                  y1={155 - (reconstruction.configuredSeats / maxProfileGuests) * 130}
                  x2={780}
                  y2={155 - (reconstruction.configuredSeats / maxProfileGuests) * 130}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <text
                  x={776}
                  y={150 - (reconstruction.configuredSeats / maxProfileGuests) * 130}
                  textAnchor="end"
                  fontSize={10}
                  fill="#94a3b8"
                >
                  configured capacity ({reconstruction.configuredSeats} seats)
                </text>
              </g>
            )}

            {reconstruction.profile.map((pt, idx) => {
              const totalBins = reconstruction.profile.length;
              const bandW = 720 / Math.max(1, totalBins);
              const x = 52 + idx * bandW;
              const hOpen = (pt.meanOpenCheckGuests / maxProfileGuests) * 130;
              const hUse = (pt.meanTableUseGuests / maxProfileGuests) * 130;
              const showLabel = idx % Math.max(1, Math.floor(totalBins / 8)) === 0;
              return (
                <g key={pt.minute}>
                  <rect
                    x={x}
                    y={155 - hUse}
                    width={Math.max(2, bandW * 0.75)}
                    height={Math.max(0, hUse)}
                    fill="rgba(255, 255, 255, 0.22)"
                  >
                    <title>
                      {`${formatMinutesToClock(pt.minute)}: ${pt.meanTableUseGuests.toFixed(1)} est. table-use guests, ${pt.meanOpenCheckGuests.toFixed(1)} open-check guests`}
                    </title>
                  </rect>
                  <rect
                    x={x}
                    y={155 - hOpen}
                    width={Math.max(2, bandW * 0.5)}
                    height={Math.max(0, hOpen)}
                    fill="#ffffff"
                  />
                  {showLabel && (
                    <text x={x + bandW * 0.35} y={174} textAnchor="middle" fontSize={10} fill="#94a3b8">
                      {formatMinutesToClock(pt.minute)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: 'var(--muted)',
              textTransform: 'lowercase',
            }}
          >
            {reconstruction.capacityLimitedNights} of {reconstruction.nights.length} nights reached 90%+ concurrent table use. recorded checks may understate demand during capacity-limited periods.
          </div>
        </section>
      )}
      <NextStep label="proceed to table layouts →" testId="to-floorplan-btn" onClick={() => setScreen('floorplan')} />
    </div>
  );
}

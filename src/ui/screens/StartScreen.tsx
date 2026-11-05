import { useState } from 'react';
import { CsvDropZone, CsvUploadButton, SampleDownloads } from '../components/CsvUpload';
import { useAppStore } from '../store/useAppStore';

const PROFILE_CSV = 'demo/table-mix-profile-synthetic.csv';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** '2026-08-03' -> 'aug 3' */
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : iso;
};

export function StartScreen() {
  const loadSyntheticSample = useAppStore((s) => s.loadSyntheticSample);
  const loadSaturdayStressDemo = useAppStore((s) => s.loadSaturdayStressDemo);
  const setScreen = useAppStore((s) => s.setScreen);
  const importResult = useAppStore((s) => s.importResult);
  const rawCsvText = useAppStore((s) => s.rawCsvText);
  const datasetName = useAppStore((s) => s.datasetName);
  const uploadCsvText = useAppStore((s) => s.uploadCsvText);
  const [chipError, setChipError] = useState<string | null>(null);
  const active = importResult && importResult.rows.length > 0 ? importResult : null;

  // Hands the exact CSV in memory back to the user so they can edit it and re-upload.
  const downloadActive = () => {
    if (!rawCsvText) return;
    const url = URL.createObjectURL(new Blob([rawCsvText], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = (datasetName ?? 'runway-dataset').replace(/\.csv$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadProfile = async () => {
    setChipError(null);
    try {
      const res = await fetch(PROFILE_CSV);
      if (!res.ok) throw new Error(String(res.status));
      uploadCsvText(await res.text(), 'table-mix-profile-synthetic.csv');
    } catch {
      setChipError('could not load the profile file.');
    }
  };

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">import pos data</h1>
          <p className="screen-subtitle">upload a check-level export with open time, close time and guest count. it stays in this browser.</p>
        </div>
      </div>

      {active && (
        <section className="active-dataset fade-in" data-testid="active-dataset">
          <div className="active-dataset-head">
            <span className="status-dot" aria-hidden="true" />
            <span className="active-dataset-kicker">active dataset</span>
            {active.report.isSample && <span className="active-dataset-tag">synthetic</span>}
          </div>
          <h2 className="active-dataset-name" data-testid="loaded-summary">
            ✓ {active.report.rowsUsed.toLocaleString('en-US')} checks loaded from {(datasetName ?? 'uploaded csv').replace(/\.csv$/i, '')}
            {active.report.dateRange && ` (${shortDate(active.report.dateRange[0])} – ${shortDate(active.report.dateRange[1])})`}
          </h2>
          <div className="active-dataset-stats">
            <span><strong>{active.report.nightsByDow.reduce((a, b) => a + b, 0)}</strong> nights</span>
            <span>{active.report.warnings.length ? `${active.report.warnings.length} import note(s)` : 'no import issues'}</span>
          </div>
          <div className="active-dataset-actions">
            <button type="button" className="btn btn-primary" data-testid="continue-to-layouts" onClick={() => setScreen('floorplan')}>
              configure floor plan →
            </button>
            <button type="button" className="btn" data-testid="download-active-csv" onClick={downloadActive}>
              download this dataset as csv
            </button>
            <CsvUploadButton label="upload different / modified csv" className="btn" testId="replace-csv-btn" />
          </div>
          <p className="panel-meta" style={{ marginTop: 10 }}>download it, change numbers in excel or a text editor, and upload it again: every screen recalculates from the new file.</p>
        </section>
      )}

      <section className="panel" style={{ marginBottom: 24 }}>
        <CsvDropZone />
        <div className="chip-row">
          <span className="panel-meta">or try a synthetic sample:</span>
          <button type="button" className="chip" data-testid="load-sample-btn" onClick={loadSyntheticSample}>standard 44-seat</button>
          <button type="button" className="chip" data-testid="load-stress-demo-btn" onClick={() => loadSaturdayStressDemo()}>saturday stress demo</button>
          <button type="button" className="chip" data-testid="load-profile-btn" onClick={loadProfile}>12-table mix profile</button>
          {chipError && <span className="inline-error" role="alert">{chipError}</span>}
        </div>
        <p className="panel-meta" style={{ margin: '10px 0 0' }}>toast orderdetails.csv works as-is; other exports can be mapped by hand.</p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">download sample pos data</h2>
          <span className="panel-meta">synthetic files for testing the uploader</span>
        </div>
        <SampleDownloads />
      </section>
    </div>
  );
}

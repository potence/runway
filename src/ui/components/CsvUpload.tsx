import { useRef, useState } from 'react';
import { getLandingContent } from '../../api';
import { useAppStore } from '../store/useAppStore';

/** Reads a picked or dropped file in the browser and hands the text to the importer. */
function useCsvReader() {
  const uploadCsvText = useAppStore((s) => s.uploadCsvText);
  const [error, setError] = useState<string | null>(null);
  const read = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) setError('that csv file is empty.');
      else uploadCsvText(text, file.name);
    };
    reader.onerror = () => setError('could not read that file.');
    reader.readAsText(file);
  };
  return { read, error };
}

/** Hidden file input + button. */
export function CsvUploadButton({ label = 'upload pos csv', className = 'btn btn-lg', testId = 'upload-csv-btn' }: { label?: string; className?: string; testId?: string }) {
  const { read, error } = useCsvReader();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className={className} data-testid={testId} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      {error && <span className="inline-error" role="alert">{error}</span>}
    </>
  );
}

/** Large drag-and-drop target; clicking it opens the file picker. */
export function CsvDropZone() {
  const { read, error } = useCsvReader();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop-zone ${over ? 'is-over' : ''}`}
      data-testid="csv-drop-zone"
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files?.[0]); }}
    >
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="drop-zone-title">drag your toast, square, or pos csv here</div>
      <div className="drop-zone-sub">or click to choose a file · it stays in this browser</div>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

/** Links to the synthetic demo CSVs in public/demo. */
export function SampleDownloads() {
  const { downloads } = getLandingContent();
  return (
    <ul className="download-list">
      {downloads.map((d) => (
        <li key={d.href}>
          <a className="download-row" href={d.href} download>
            <span className="download-label">{d.label}</span>
            <span className="download-detail">{d.detail}</span>
            <span className="download-arrow" aria-hidden="true">↓</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

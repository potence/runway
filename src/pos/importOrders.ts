import Papa from 'papaparse';
import type { ColumnMapping, ExclusionReason, ImportResult, OrderRow } from '../domain/types';

const DAY = 86400000;
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EXCLUSION_KEYS: ExclusionReason[] = ['voided', 'notDineIn', 'missingGuests', 'invalidTimestamp', 'missingClose', 'invalidDuration', 'outlierDuration'];

/** Calendar day as UTC ms plus minutes of day; no time zones involved. */
function parseTs(s: string | undefined): { day: number; min: number } | null {
  const t = (s ?? '').trim();
  let y: number, mo: number, d: number, h: number, mi: number, ap: string | undefined;
  // US month-first (slash or dash), optional seconds/fraction, optional AM/PM ("PM", "p.m.").
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})[ T,]+(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([ap])?\.?m?\.?$/i.exec(t);
  if (m) {
    mo = +m[1]; d = +m[2]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; h = +m[4]; mi = +m[5]; ap = m[6];
  } else if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([ap])?\.?m?\.?\s*(?:Z|[+-]\d{2}:?\d{2})?$/i.exec(t))) {
    // ISO 8601; a trailing Z/offset is ignored: POS exports are read as restaurant wall-clock time.
    y = +m[1]; mo = +m[2]; d = +m[3]; h = +m[4]; mi = +m[5]; ap = m[6];
  } else return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0); }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const day = Date.UTC(y, mo - 1, d);
  if (new Date(day).getUTCDate() !== d) return null; // rejects e.g. 2/31
  return { day, min: h * 60 + mi };
}

/** "$1,234.50" -> 1234.5; "(12.00)", "-$12" or "$-12" -> -12; NaN if no digits. */
function parseMoney(s: string): number {
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.includes('-');
  const digits = s.replace(/[^0-9.]/g, '');
  const v = digits ? parseFloat(digits) : NaN;
  return neg ? -v : v;
}

export function detectMapping(headers: string[]): { mapping: ColumnMapping | null; missing: (keyof ColumnMapping)[] } {
  const find = (...names: string[]) => {
    for (const n of names) { const h = headers.find((x) => x.trim().toLowerCase() === n.toLowerCase()); if (h !== undefined) return h; }
    return undefined;
  };
  const opened = find('Opened');
  const closed = find('Paid', 'Closed');
  const guests = find('# of Guests', 'Guests', 'Covers');
  const missing: (keyof ColumnMapping)[] = [];
  if (!opened) missing.push('opened');
  if (!closed) missing.push('closed');
  if (!guests) missing.push('guests');
  if (!opened || !closed || !guests) return { mapping: null, missing };
  return {
    mapping: {
      opened, closed, guests,
      table: find('Table'), area: find('Dining Area'),
      amount: find('Amount', 'Net Amount', 'Net Sales'),
      voided: find('Voided'), diningOption: find('Dining Options'),
    },
    missing,
  };
}

export function importOrders(csvText: string, mapping?: ColumnMapping, opts?: { isSample?: boolean }): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^\ufeff/, ''), {
    header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.replace(/^\ufeff/, '').trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const data = parsed.data;
  const det = mapping ? { mapping, missing: [] as (keyof ColumnMapping)[] } : detectMapping(headers);
  const excluded = Object.fromEntries(EXCLUSION_KEYS.map((k) => [k, 0])) as Record<ExclusionReason, number>;
  const report: ImportResult['report'] = {
    rowsRead: data.length, rowsUsed: 0, excluded, dateRange: null,
    nightsByDow: [0, 0, 0, 0, 0, 0, 0], warnings: [],
    // A file that declares itself synthetic (Data Source column) keeps the SAMPLE ribbon even when uploaded.
    isSample: (opts?.isSample ?? false) || (headers.includes('Data Source') && /synthetic/i.test(data[0]?.['Data Source'] ?? '')),
  };
  const mp = det.mapping;
  if (!mp) {
    report.warnings.push(`Required columns not found: ${det.missing.join(', ')}. Map them by hand below, or export Toast OrderDetails.csv (needs Opened, Paid or Closed, and # of Guests). Columns found: ${headers.join(', ') || 'none'}.`);
    return { rows: [], report, mapping: null, headers, missing: det.missing };
  }
  const closedFallback = headers.find((h) => h.trim().toLowerCase() === 'closed' && h !== mp.closed);
  const rows: OrderRow[] = [];
  const examples: Partial<Record<ExclusionReason | 'amount', string>> = {};
  let badAmounts = 0, negativeAmounts = 0;
  data.forEach((rec, i) => {
    const get = (c?: string) => (c ? (rec[c] ?? '').trim() : '');
    const skip = (k: ExclusionReason, example?: string) => { excluded[k]++; if (example && !examples[k]) examples[k] = example; };
    if (/^(true|yes|1|y)$/i.test(get(mp.voided))) return skip('voided');
    if (/take|to go|togo|deliver|pickup|online|curbside/i.test(get(mp.diningOption))) return skip('notDineIn');
    const gs = get(mp.guests);
    const guests = /^\d+/.test(gs) ? parseInt(gs, 10) : NaN;
    if (!(guests > 0)) return skip('missingGuests');
    const o = parseTs(get(mp.opened));
    if (!o) return skip('invalidTimestamp', get(mp.opened));
    const c = parseTs(get(mp.closed)) ?? (closedFallback ? parseTs(get(closedFallback)) : null); // Paid ?? Closed
    if (!c) return skip('missingClose');
    const bizMs = o.day - (o.min < 240 ? DAY : 0);
    const openMin = o.min + (o.min < 240 ? 1440 : 0);
    const closeMin = c.min + Math.round((c.day - bizMs) / DAY) * 1440;
    const dur = closeMin - openMin;
    if (dur <= 0) return skip('invalidDuration');
    if (dur > 300) return skip('outlierDuration');
    const net = parseMoney(get(mp.amount));
    if (mp.amount && get(mp.amount) && !Number.isFinite(net)) { badAmounts++; examples.amount ??= get(mp.amount); }
    if (net < 0) negativeAmounts++;
    const row: OrderRow = {
      id: `r${i}`, businessDate: new Date(bizMs).toISOString().slice(0, 10), dow: new Date(bizMs).getUTCDay(),
      checkOpenMin: openMin, checkCloseMin: closeMin, guests, net: Number.isFinite(net) ? net : 0,
    };
    const table = get(mp.table), area = get(mp.area);
    if (table) row.table = table;
    if (area) row.area = area;
    rows.push(row);
  });
  rows.sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.checkOpenMin - b.checkOpenMin);
  report.rowsUsed = rows.length;
  if (rows.length) report.dateRange = [rows[0].businessDate, rows[rows.length - 1].businessDate];
  const nights = new Set(rows.map((r) => r.businessDate));
  for (const d of nights) report.nightsByDow[new Date(d + 'T00:00:00Z').getUTCDay()]++;
  const w = report.warnings;
  const n = excluded;
  if (parsed.errors.length) w.push(`${parsed.errors.length} malformed CSV line(s) (first: row ${(parsed.errors[0].row ?? 0) + 2}, ${parsed.errors[0].message}). Check for unquoted commas in fields.`);
  if (n.invalidTimestamp) w.push(`${n.invalidTimestamp} check(s) had an unreadable Opened time (e.g. "${examples.invalidTimestamp}") and were excluded. Supported: 10/29/26 6:15 PM, 10/29/2026 18:15, 2026-10-29 18:15:00.`);
  if (n.missingClose) w.push(`${n.missingClose} check(s) had no readable Paid/Closed time and were excluded. Check durations are not guessed; re-export with Paid or Closed filled in.`);
  if (n.missingGuests) w.push(`${n.missingGuests} check(s) had a missing or zero guest count (e.g. bar-only or untracked covers) and were excluded, because party size is unknown and is not guessed.`);
  if (n.invalidDuration || n.outlierDuration) w.push(`${n.invalidDuration + n.outlierDuration} check(s) closed before opening or stayed open over 5 hours and were excluded (likely forgotten or reopened checks).`);
  if (!mp.amount) w.push('No amount column found; revenue figures will show $0.');
  else if (badAmounts) w.push(`${badAmounts} amount(s) could not be read (e.g. "${examples.amount}") and count as $0 in revenue figures.`);
  if (negativeAmounts) w.push(`${negativeAmounts} kept check(s) have negative amounts (refunds or comps, which the export does not distinguish); they are included as-is in revenue figures.`);
  if (!rows.length && data.length) w.push('No usable dine-in checks remained after cleaning. Check the column mapping and the Dining Options values.');
  if (rows.length && nights.size < 28) report.warnings.push(`Only ${nights.size} nights of history; the 7-day outlook needs at least 4 nights per weekday and comparisons are less stable.`);
  report.nightsByDow.forEach((n, d) => { if (n >= 1 && n <= 3) report.warnings.push(`${DOW_NAMES[d]}: fewer than 4 nights of history`); });
  return { rows, report, mapping: mp, headers, missing: [] };
}

// Writes downloadable demo CSVs to public/demo/ from the synthetic Harbor Table sample.
// Every file carries a "Data Source" column = "SAMPLE DATA (synthetic)" so the importer keeps the SAMPLE
// ribbon after a real upload. Run: npx tsx scripts/make-demo-csvs.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import { mulberry32 } from '../src/model/rng';

type Row = Record<string, string>;
const SRC = 'src/sample/harbor-table-orderdetails.csv';
const OUT = 'public/demo';
const TAG = 'SAMPLE DATA (synthetic)';

const parsed = Papa.parse<Row>(readFileSync(SRC, 'utf8'), { header: true, skipEmptyLines: true });
const fields = [...parsed.meta.fields!, 'Data Source'];
const base: Row[] = parsed.data.map(r => ({ ...r, 'Data Source': TAG }));
const dowOf = (opened: string) => { const [m, d, y] = opened.split(' ')[0].split('/').map(Number); return new Date(Date.UTC(2000 + y, m - 1, d)).getUTCDay(); };
const dateOf = (opened: string) => opened.split(' ')[0];
const write = (name: string, rows: Row[], eol = '\n', bom = false) => {
  const csv = Papa.unparse({ fields, data: rows.map(r => fields.map(f => r[f] ?? '')) }, { newline: eol });
  writeFileSync(`${OUT}/${name}`, (bom ? '\ufeff' : '') + csv + eol);
  console.log(`${OUT}/${name}: ${rows.length} rows`);
};
mkdirSync(OUT, { recursive: true });
const rand = mulberry32(2026);
let nextId = 900000;

// 1. Full 80-night export, plus split checks (second check on the same table at the same time)
//    and refunds/comps (negative amounts), the way real exports contain them.
const full: Row[] = [];
for (const r of base) {
  full.push(r);
  const dineIn = r['Dining Options'] === 'Dine In' && r.Voided === 'false';
  if (dineIn && Number(r['# of Guests']) >= 4 && rand() < 0.02) {
    const half = (Number(r.Amount) / 2).toFixed(2);
    r.Amount = half;
    full.push({ ...r, 'Order Id': String(nextId++), '# of Guests': '1', 'Tab Names': `${r['Tab Names']} (split)`, Amount: half });
  } else if (dineIn && rand() < 0.004) {
    full.push({ ...r, 'Order Id': String(nextId++), '# of Guests': '0', 'Tab Names': 'Refund', Amount: `-${(5 + rand() * 30).toFixed(2)}` });
  }
}
write('harbor-table-synthetic-pos-export.csv', full);

// 2. Saturday nights only: the busiest, most capacity-limited service in the sample.
write('harbor-table-synthetic-saturdays.csv', base.filter(r => dowOf(r.Opened) === 6));

// 3. Messy export for showing import warnings: last 5 weeks, BOM + CRLF, mixed timestamp formats,
//    currency strings, blank lines, and a few checks with no Paid/Closed time (excluded, never guessed).
const dates = [...new Set(base.map(r => dateOf(r.Opened)))];
const keep = new Set(dates.slice(-25));
const iso = (s: string) => {
  const [d, t, ap] = s.split(' '); const [m, dd, y] = d.split('/').map(Number); let [h, mi] = t.split(':').map(Number);
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
  return `20${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00`;
};
const messy: Row[] = [];
base.filter(r => keep.has(dateOf(r.Opened))).forEach((r0, i) => {
  const r: Row = { ...r0, Amount: `$${Number(r0.Amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` };
  if (i % 7 === 3) { r.Opened = iso(r.Opened); r.Paid = r.Paid && iso(r.Paid); r.Closed = r.Closed && iso(r.Closed); }
  if (i % 97 === 11) { r.Paid = ''; r.Closed = ''; }
  messy.push(r);
  if (i % 211 === 5) messy.push(Object.fromEntries(fields.map(f => [f, ''])));
});
write('harbor-table-synthetic-messy-export.csv', messy, '\r\n', true);

// 4. 12-table profile: four 2-tops, six 4-tops, two 6-tops (44 seats). Parameters come from the owner's brief
//    (52/32/16% party mix, lognormal ~67-min checks, busier Fri/Sat); they are illustrative, NOT taken from a study.
//    Independent host loop (FCFS, best-fit table, 20-min patience); only seated parties are written, so busy
//    nights are censored like a real POS. The unrecorded share is printed, never forced to a target.
{
  const rng = mulberry32(4401);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const tables = [...[1, 2, 3, 4].map(i => ({ id: `T${i}`, cap: 2 })), ...[5, 6, 7, 8, 9, 10].map(i => ({ id: `T${i}`, cap: 4 })), { id: 'T11', cap: 6 }, { id: 'T12', cap: 6 }];
  const latentByDow: Record<number, number> = { 3: 28, 4: 32, 5: 46, 6: 50, 0: 34 };
  const size = () => { const u = rng(); return u < 0.52 ? (rng() < 0.15 ? 1 : 2) : u < 0.84 ? (rng() < 0.5 ? 3 : 4) : (rng() < 0.5 ? 5 : 6); };
  const arrivalMin = () => { const peak = rng() < 0.6 ? 19 * 60 : 18 * 60; return Math.round(Math.min(21 * 60 + 30, Math.max(17 * 60, peak + normal() * 40))); };
  const clock = (date: string, m: number) => { const [y, mo, d] = date.split('-').map(Number); const h = Math.floor(m / 60) % 24, mi = m % 60;
    return `${mo}/${d}/${String(y).slice(2)} ${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const rows: Row[] = [];
  let latent = 0, seatedN = 0, id = 700000;
  for (let day = Date.UTC(2026, 7, 26); day <= Date.UTC(2026, 10, 3); day += 86400000) {
    const dt = new Date(day), dow = dt.getUTCDay();
    if (!(dow in latentByDow)) continue;
    const date = dt.toISOString().slice(0, 10);
    const n = Math.max(0, Math.round(latentByDow[dow] * (1 + 0.12 * normal())));
    latent += n;
    const parties = Array.from({ length: n }, () => ({ t: arrivalMin(), g: size() })).sort((a, b) => a.t - b.t);
    const freeAt = new Map(tables.map(t => [t.id, 0]));
    for (const p of parties) {
      // earliest moment within patience when a best-fit table is free (tables taken in arrival order = FCFS)
      let best: { id: string; at: number; cap: number } | null = null;
      for (const t of tables) {
        if (t.cap < p.g) continue;
        const at = Math.max(p.t, freeAt.get(t.id)!);
        if (at - p.t > 20) continue;
        if (!best || at < best.at || (at === best.at && t.cap < best.cap)) best = { id: t.id, at, cap: t.cap };
      }
      if (!best) continue; // walked away: never reaches the POS
      const dur = Math.max(25, Math.round(Math.exp(Math.log(67) - 0.045 + 0.3 * normal())));
      const open = best.at + 2, paid = open + dur;
      freeAt.set(best.id, paid + 5 + 5); // close + linger + reset
      seatedN++;
      rows.push({ 'Order Id': String(id++), Opened: clock(date, open), '# of Guests': String(p.g), 'Tab Names': '', Table: best.id,
        'Dining Area': 'Main', 'Dining Options': 'Dine In', Amount: (p.g * Math.exp(Math.log(32) + 0.25 * normal())).toFixed(2),
        Voided: 'false', Paid: clock(date, paid), Closed: clock(date, paid + 1), 'Duration (Opened to Paid)': String(dur), 'Data Source': TAG });
    }
  }
  write('table-mix-profile-synthetic.csv', rows);
  console.log(`  12-table profile: ${latent} latent parties, ${seatedN} seated, ${(100 * (1 - seatedN / latent)).toFixed(1)}% never recorded`);
}

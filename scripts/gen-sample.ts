// Synthetic sample generator for "Harbor Table" (fictional). Run: npm run gen:sample
// Uses DIFFERENT machinery from the fitter (bimodal arrival curve, lognormal dwell, own host loop,
// patience walkaways) so tests are not circular. The POS-like CSV contains ONLY seated parties
// (censored); latent demand and walkaways go to tests/fixtures/harbor-truth.json for tests only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { mulberry32 } from '../src/model/rng';

const rng = mulberry32(20261104);
const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const TABLES = [
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].map(id => ({ id, cap: 4 })),
  ...['D1', 'D2', 'D3'].map(id => ({ id, cap: 2 })),
  { id: 'S1', cap: 6 },
];
const BASE: Record<number, number> = { 3: 30, 4: 34, 5: 48, 6: 53, 0: 36 }; // latent parties by dow
const SIZE_P: [number, number][] = [[1, 0.08], [2, 0.46], [3, 0.14], [4, 0.19], [5, 0.06], [6, 0.07]];
const PLANTED: Record<string, { mult: number; why: string }> = {
  '2026-09-05': { mult: 1.25, why: 'demo event (planted test effect)' },
  '2026-10-17': { mult: 1.25, why: 'demo event (planted test effect)' },
  '2026-10-31': { mult: 0.85, why: 'Halloween (planted test effect)' },
};

const drawSize = () => { let u = rng(); for (const [s, p] of SIZE_P) { if ((u -= p) < 0) return s; } return 2; };
const arrivalMin = () => {
  for (;;) {
    const m = rng() < 0.45 ? 18.5 * 60 + 35 * normal() : 19.75 * 60 + 40 * normal();
    if (m >= 17 * 60 && m < 22 * 60) return m;
  }
};
const dwell = (size: number) => (size <= 2 ? 62 : size <= 4 ? 78 : 98) * Math.exp(0.25 * normal());
const clock = (date: string, min: number) => {
  const ms = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + Math.floor(min) * 60000;
  const d = new Date(ms);
  const h = d.getUTCHours(), mm = d.getUTCMinutes();
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)} ${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const header = ['Order Id', 'Opened', '# of Guests', 'Tab Names', 'Table', 'Dining Area', 'Dining Options', 'Amount', 'Voided', 'Paid', 'Closed', 'Duration (Opened to Paid)'];
const lines = [header.join(',')];
const truth: { date: string; dow: number; latentParties: number; seatedParties: number; walkaways: number; plantedMult: number }[] = [];
let orderId = 100000;

const end = Date.UTC(2026, 10, 3);          // last history date: Tue 2026-11-03
for (let ms = end - 16 * 7 * DAY + DAY; ms <= end; ms += DAY) {
  const date = iso(ms);
  const dow = new Date(ms).getUTCDay();
  if (!(dow in BASE)) continue;
  const planted = PLANTED[date]?.mult ?? 1;
  const n = Math.max(5, Math.round(BASE[dow] * planted * Math.exp(0.12 * normal())));
  const parties = Array.from({ length: n }, () => ({ t: arrivalMin(), size: drawSize() })).sort((a, b) => a.t - b.t);

  // Host loop (truth): strict arrival order, best-fit free table, walk away if wait > patience.
  const freeAt = new Map(TABLES.map(x => [x.id, 0]));
  let seated = 0, walk = 0;
  for (const p of parties) {
    const fits = TABLES.filter(x => x.cap >= p.size).sort((a, b) => a.cap - b.cap);
    let best = fits[0], bestT = Infinity;
    for (const x of fits) { const t = Math.max(p.t, freeAt.get(x.id)!); if (t < bestT - 1e-9) { best = x; bestT = t; } }
    const patience = 25 * Math.exp(0.35 * normal());
    if (bestT - p.t > patience) { walk++; continue; }
    const d = dwell(p.size);
    freeAt.set(best.id, bestT + d + 4); // true reset 4 min
    seated++;
    const open = bestT + 1 + rng() * 4;                 // true open lag 1-5 min
    const paid = Math.max(open + 15, bestT + d - (2 + rng() * 8)); // true linger 2-10 min
    const amount = (p.size * (28 + rng() * 18)).toFixed(2);
    lines.push([orderId++, clock(date, open), p.size, `Guest ${orderId % 97}`, best.id, 'Main', 'Dine In', amount, rng() < 0.01 ? 'true' : 'false', clock(date, paid), clock(date, paid + 1), Math.round(paid - open)].join(','));
  }
  for (let k = 0; k < 4; k++) {
    const o = 17 * 60 + rng() * 300;
    lines.push([orderId++, clock(date, o), 1, '', '', 'Takeout', 'Take Out', (20 + rng() * 30).toFixed(2), 'false', clock(date, o + 12), clock(date, o + 12), 12].join(','));
  }
  truth.push({ date, dow, latentParties: n, seatedParties: seated, walkaways: walk, plantedMult: planted });
}

mkdirSync('src/sample', { recursive: true });
mkdirSync('tests/fixtures', { recursive: true });
writeFileSync('src/sample/harbor-table-orderdetails.csv', lines.join('\n') + '\n');
writeFileSync('tests/fixtures/harbor-truth.json', JSON.stringify({
  note: 'SYNTHETIC test truth. Never load into the product as observations.',
  trueOpenLagMin: [1, 5], trueLingerMin: [2, 10], trueResetMin: 4, sizeP: SIZE_P, nights: truth,
}, null, 2));
writeFileSync('src/sample/harbor-table-context.json', JSON.stringify({
  note: 'SYNTHETIC demo context fixture for Harbor Table (fictional). Not real events or weather.',
  location: { lat: 37.5483, lon: -121.9886, label: 'Fremont, CA (demo location)' },
  events: [
    { date: '2026-11-06', name: 'Demo: high-school football home game (fixture)' },
    { date: '2026-11-07', name: 'Demo: Harbor Jazz Night (fixture, owner-entered assumption)', assumedMultiplier: 1.15 },
  ],
  schoolBreaks: [{ start: '2026-11-23', end: '2026-11-27', name: 'Demo: Thanksgiving break (fixture)' }],
  weather: ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((date, i) => ({
    date, summary: i === 3 ? 'Rain (fixture)' : 'Partly sunny (fixture)', highF: [68, 70, 66, 61, 63, 67, 69][i], precipPct: i === 3 ? 70 : 10, source: 'fixture',
  })),
}, null, 2));
const tot = truth.reduce((a, x) => ({ l: a.l + x.latentParties, s: a.s + x.seatedParties, w: a.w + x.walkaways }), { l: 0, s: 0, w: 0 });
console.log(`nights=${truth.length} latent=${tot.l} seated=${tot.s} walkaways=${tot.w} csvLines=${lines.length - 1}`);

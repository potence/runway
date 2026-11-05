import type { DemoPreset, Layout, PatienceAssumptions, Policy, ServiceWindow, TableDef, TableUseAssumptions } from '../domain/types';

// All values below are Assumed design choices (owner-editable), not values learned from POS data.
export const DEFAULT_TABLE_USE: TableUseAssumptions = { openLagMin: 2, lingerMin: 5 };
export const DEFAULT_PATIENCE: PatienceAssumptions = { smallPartyMin: 20, largePartyMin: 30, largeFrom: 5 };
export const DEFAULT_POLICY: Policy = { nesting: 'full', allowJoins: true, resetMin: 5, joinSetupMin: 3 };
export const DEFAULT_WINDOW: ServiceWindow = { dows: [3, 4, 5, 6, 0], startMin: 17 * 60, endMin: 22 * 60 };
export const DEFAULT_NIGHTS = 200;
export const DEFAULT_SEED = 42;
export const FULLNESS_THRESHOLD = 0.9; // concurrent estimated table uses / configured tables

const t = (id: string, capacity: number, x: number, y: number, shape: TableDef['shape'] = 'rect'): TableDef => {
  const w = capacity <= 2 ? 50 : capacity <= 4 ? 70 : capacity <= 6 ? 100 : 130;
  return { id, name: id.toUpperCase(), capacity, x, y, w, h: capacity <= 2 ? 50 : 70, shape };
};

/** Harbor Table (synthetic): 8 four-tops, 3 two-tops, 1 six-top = 44 seats. Canvas 800x500. */
export function harborCurrentLayout(): Layout {
  const tables: TableDef[] = [
    ...[0, 1, 2, 3].map(i => t(`f${i + 1}`, 4, 60 + i * 140, 60)),
    ...[0, 1, 2, 3].map(i => t(`f${i + 5}`, 4, 60 + i * 140, 200)),
    ...[0, 1, 2].map(i => t(`d${i + 1}`, 2, 80 + i * 140, 360, 'round')),
    t('s1', 6, 560, 350),
  ];
  return { id: 'current', name: 'Current layout', tables: tables.map((x, i) => ({ ...x, name: `T${i + 1}` })), joins: [] };
}

/** Alternative (synthetic): four four-tops replaced by eight joinable two-tops; still 44 seats. */
export function harborCombinableLayout(): Layout {
  const base = harborCurrentLayout();
  const keep = base.tables.filter(x => !['f5', 'f6', 'f7', 'f8'].includes(x.id));
  const pairs: TableDef[] = [];
  const joins = [];
  for (let i = 0; i < 4; i++) {
    const a = t(`c${2 * i + 1}`, 2, 60 + i * 140, 200);
    const b = t(`c${2 * i + 2}`, 2, 60 + i * 140 + 55, 200);
    pairs.push(a, b);
    joins.push({ a: a.id, b: b.id, joinedCapacity: 4 });
  }
  // Display names only (T1..); ids and therefore every simulated number are unchanged.
  return { id: 'combinable', name: 'Combinable two-tops', tables: [...keep, ...pairs].map((x, i) => ({ ...x, name: `T${i + 1}` })), joins };
}

/** Saturday stress test on the synthetic sample. The result is whatever the engine computes; nothing is tuned to favor a layout. */
export const SATURDAY_STRESS_PRESET: DemoPreset = {
  id: 'harbor-saturday-stress',
  name: 'Harbor Table: Saturday rush stress test (synthetic)',
  description: 'Saturday 17:00–22:00 only, resampling the 16 recorded Saturday nights, with an Assumed 1.25× latent-demand multiplier to test the room against demand above what was seated.',
  window: { dows: [6], startMin: 17 * 60, endMin: 22 * 60 },
  latentDemandMultiplier: 1.25,
  nights: DEFAULT_NIGHTS,
  seed: DEFAULT_SEED,
  disclosure: 'Stress test: 1.25× latent demand is an assumption, not inferred from data. Harbor Table is a synthetic restaurant. Results are modeled, not measured.',
};

export const seatsOf =(l: Layout) => l.tables.reduce((s, x) => s + x.capacity, 0);

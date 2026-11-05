// Runway shared contract. UI imports types from here and functions only from src/api.
// Time convention: all times are wall-clock minutes from 00:00 of the business date (may exceed 1440).
// Two pipelines never exchange values: historical reconstruction (POS checks + Assumed offsets)
// and counterfactual simulation (Modeled demand). No POS timestamp is ever a queue arrival.

// ---------- Provenance ----------
/** Observed = POS field; Derived = Observed + Assumed offsets; Modeled = engine output; Assumed = owner/default input. */
export type ProvenanceKind = 'Observed' | 'Derived' | 'Modeled' | 'Assumed';
export interface Provenance { kind: ProvenanceKind; basis: string }

// ---------- POS import ----------
export type ExclusionReason =
  | 'voided' | 'notDineIn' | 'missingGuests' | 'invalidTimestamp' | 'missingClose' | 'invalidDuration' | 'outlierDuration';

/** Observed POS check after cleaning. checkOpen/checkClose are POS events, NOT customer arrival/departure. */
export interface OrderRow {
  id: string;
  businessDate: string;   // YYYY-MM-DD; checks opened before 04:00 belong to the previous business date
  dow: number;            // 0=Sun..6=Sat of businessDate
  checkOpenMin: number;
  checkCloseMin: number;  // Paid if present, else Closed
  guests: number;
  table?: string;
  area?: string;
  net: number;            // 0 when the export has no amount column
}

/** Header names in the source CSV for each field. Required: opened, closed (paid or closed), guests. */
export interface ColumnMapping {
  opened: string;
  closed: string;
  guests: string;
  table?: string;
  area?: string;
  amount?: string;
  voided?: string;
  diningOption?: string;
}

export interface ImportReport {
  rowsRead: number;
  rowsUsed: number;
  excluded: Record<ExclusionReason, number>;
  dateRange: [string, string] | null;
  nightsByDow: number[];  // length 7, distinct business dates per weekday
  warnings: string[];
  isSample: boolean;
}

export interface ImportResult {
  rows: OrderRow[];
  report: ImportReport;
  mapping: ColumnMapping | null;  // null when required columns could not be detected
  headers: string[];              // for the manual mapping UI
  missing: (keyof ColumnMapping)[];
}

// ---------- Assumptions (all Assumed, owner-editable) ----------
export interface TableUseAssumptions {
  openLagMin: number;  // minutes between table-use start and POS check-open
  lingerMin: number;   // minutes guests stay after POS check-close
}
export interface PatienceAssumptions {
  smallPartyMin: number;  // parties smaller than largeFrom; Infinity = never abandon
  largePartyMin: number;
  largeFrom: number;
}

// ---------- Layout and policy ----------
export interface TableDef {
  id: string; name: string; capacity: number;
  x: number; y: number; w: number; h: number; shape: 'rect' | 'round';
}
/** Two tables that may be combined; joinedCapacity may be less than the sum (lost seats). */
export interface JoinLink { a: string; b: string; joinedCapacity: number }
export interface Layout { id: string; name: string; tables: TableDef[]; joins: JoinLink[] }

export interface Policy {
  nesting: 'full' | 'none';   // full: any table that fits; none: smallest capacity that fits only
  allowJoins: boolean;        // joins used only when no single table fits
  resetMin: number;           // table reset after departure (Assumed)
  joinSetupMin: number;       // added to table use when a join is used (Assumed)
}
export interface Scenario { id: string; name: string; layout: Layout; policy: Policy }

/** Modeled demand arrivals are generated only inside [startMin, endMin). */
export interface ServiceWindow { dows: number[]; startMin: number; endMin: number }

// ---------- Historical reconstruction (never feeds the simulator) ----------
export interface NightReconstruction {
  businessDate: string; dow: number;
  recordedParties: number; recordedCovers: number;
  peakOpenCheckGuests: number;      // Observed proxy
  peakConcurrentTableUses: number;  // Derived (Observed + Assumed offsets)
  capacityLimited: boolean;         // peakConcurrentTableUses >= 0.9 x configured tables (design choice)
}
export interface HistoryReconstruction {
  binMin: 15;
  nights: NightReconstruction[];
  /** Mean across nights per bin. */
  profile: { minute: number; meanOpenCheckGuests: number; meanTableUseGuests: number }[];
  partySizeCounts: { size: number; parties: number }[];
  durationByBucket: { bucket: '1-2' | '3-4' | '5+'; n: number; p25: number; median: number; p75: number }[];
  meanNetPerCover: number | null;
  configuredTables: number;
  configuredSeats: number;
  capacityLimitedNights: number;
  nightsAboveConfiguredSeats: number;  // proxy peak > seats: config/data consistency warning
  sameTableOverlaps: number;           // checks overlapping on one table (split/transfer ambiguity)
  warnings: string[];
}

// ---------- Counterfactual demand and simulation ----------
export interface DemandModel {
  window: ServiceWindow;
  binMin: 15;
  timingShape: number[];  // sums to 1 over window bins; shape of estimated table-use starts (recorded-seating timing profile)
  checkPool: { guests: number; durationMin: number; net: number }[];
  nightlyRecordedParties: number[];
  supportNights: number;
}

export type VolumeSpec =
  | { source: 'history'; latentDemandMultiplier: number }
  | { source: 'radar'; scenario: DemandScenario; band: 'low' | 'mid' | 'high'; latentDemandMultiplier: number };

/** Counterfactual party. demandArriveMin is generated by the model, never copied from a POS row. */
export interface ModeledParty {
  id: string;
  demandArriveMin: number;  // Modeled; joins the queue and starts the patience clock
  size: number;
  tableUseMin: number;      // bootstrapped check duration + openLag + linger
  patienceMin: number;      // Assumed
  net: number;
}
export interface ModeledNight { index: number; parties: ModeledParty[] }

export type PartyOutcome = 'seated' | 'abandoned' | 'unseatedAtClose';
export type TimelineEvent =
  | { t: number; type: 'arrive'; partyId: string; size: number }
  | { t: number; type: 'seat'; partyId: string; tableIds: string[]; waitMin: number }
  | { t: number; type: 'depart'; partyId: string; tableIds: string[] }
  | { t: number; type: 'tableReady'; tableIds: string[] }
  | { t: number; type: 'abandon'; partyId: string; waitedMin: number }
  | { t: number; type: 'unseatedAtClose'; partyId: string };

export type MetricKey =
  | 'seatedParties' | 'seatedCovers'
  | 'meanWaitMin' | 'p90WaitMin' | 'shareSeatedWithin10'
  | 'abandonedParties' | 'unseatedAtCloseParties' | 'unservedCovers'
  | 'seatUtilization' | 'seatWastePerParty' | 'seatedRevenue';

export interface RunResult {
  scenarioId: string;
  nightIndex: number;
  events: TimelineEvent[];  // sorted by t
  outcomes: Record<string, PartyOutcome>;
  metrics: Record<MetricKey, number>;
}

export interface MetricSummary {
  key: MetricKey; label: string; unit: string; provenance: Provenance;
  higherIsBetter: boolean;
  /** mean and empirical 10th-90th percentile across simulated nights (not a confidence interval) */
  perScenario: Record<string, { mean: number; p10: number; p90: number }>;
  /** per-night paired differences (scenario - baseline) using identical modeled parties */
  paired: { scenarioId: string; meanDelta: number; p10: number; p90: number; wins: number; nights: number; noClearDifference: boolean }[];
}

export interface AssumptionChip { key: string; label: string; value: string; provenance: Provenance }

export interface ExperimentInput {
  rows: OrderRow[];
  window: ServiceWindow;
  tableUse: TableUseAssumptions;
  patience: PatienceAssumptions;
  volume: VolumeSpec;
  scenarios: Scenario[];
  baselineId: string;
  nights: number;
  seed: number;
  capacityLimitedNights?: number;  // from reconstructHistory, for the demand banner only
}

export interface ExperimentResult {
  assumptions: AssumptionChip[];
  demandBanner: string;  // render verbatim
  demand: { recordedPartiesBasis: number; latentDemandMultiplier: number; modeledDemandMean: number; source: VolumeSpec['source'] };
  metrics: MetricSummary[];
  replayNightIndex: number;
  replay: { scenarioId: string; run: RunResult; parties: ModeledParty[] }[];
  warnings: string[];
}

/** Plain-language summary of a paired run. Built deterministically from MetricSummary; never extrapolated. */
export interface Takeaway {
  headline: string;
  items: { key: 'covers' | 'wait' | 'walkaways'; label: string; value: string; clear: boolean; detail: string }[];
  footnote: string;
}

export interface FloorSnapshot {
  t: number;
  tables: { tableId: string; state: 'free' | 'occupied' | 'resetting'; partyId?: string; partySize?: number; joinedWith?: string[]; remainingMin?: number }[];  // remainingMin: modeled minutes until the party leaves
  queue: { partyId: string; size: number; waitedMin: number }[];  // modeled wait so far
  seatedSoFar: number;
  abandonedSoFar: number;
}

/** One-click demo configuration over the synthetic sample. Every setting is Assumed and must be shown. */
export interface DemoPreset {
  id: string;
  name: string;
  description: string;
  window: ServiceWindow;
  latentDemandMultiplier: number;  // Assumed stress test, never inferred
  nights: number;
  seed: number;
  disclosure: string;              // render verbatim wherever the preset is active
}

// ---------- Landing page copy (static, owner-reviewed; render verbatim) ----------
export interface LandingCitation {
  authors: string; year: number; title: string; publisher: string;
  relevance: string;               // one honest sentence on what it does and does not support
  url?: string;                    // only where verified
}
export interface LandingContent {
  hero: { tagline: string; headline: string; subhead: string };
  pillars: { id: 'demand' | 'layouts' | 'results'; title: string; summary: string }[];
  research: LandingCitation[];
  guarantees: string[];
  presets: { id: 'sample' | 'stress'; label: string; detail: string; loader: 'loadSample' | 'loadStressDemo' }[];
  downloads: { href: string; label: string; detail: string }[];   // files under public/demo, all synthetic
}

// ---------- Rush Radar ----------
export type FactorEvidence = 'Learned' | 'Assumed' | 'FlagOnly';
export interface FactorEffect {
  factor: 'weather' | 'holiday' | 'event' | 'school' | 'promotion';
  label: string;
  evidence: FactorEvidence;
  multiplier: number;  // 1.00 unless Learned or Assumed
  reason: string;
}
export interface SourceCoverage {
  source: string;  // e.g. 'National Weather Service', 'Bundled US holiday calendar'
  status: 'live' | 'fixture' | 'ownerEntered' | 'unavailable' | 'notConfigured';
  note: string;    // e.g. 'No events listed; coverage is incomplete.'
}
export interface WeatherDay { date: string; summary: string; highF: number | null; precipPct: number | null; source: 'nws' | 'fixture' | 'sample' }  // sample = labeled stand-in, never live

export interface RadarContext {
  holidays: { date: string; name: string }[];
  events: { date: string; name: string; assumedMultiplier?: number }[];
  schoolBreaks: { start: string; end: string; name: string }[];
  weather: WeatherDay[];
  weatherCoverage: SourceCoverage;
  isFixture: boolean;
}

export interface DayForecast {
  date: string; dow: number;
  confidence: 'Insufficient' | 'Low' | 'Medium';
  confidenceReasons: string[];
  supportNights: number;
  /** recorded parties/covers (not total demand); absent when Insufficient */
  parties?: { low: number; mid: number; high: number };
  covers?: { low: number; mid: number; high: number };
  rangeKind?: 'empirical_p10_p90' | 'observed_min_max';
  typicalParties?: number;  // unweighted same-weekday median
  factors: FactorEffect[];
  coverage: SourceCoverage[];
  isSample: boolean;
}

export interface BacktestResult {
  nights: number;
  maeProposed: number;
  maeLastSameWeekday: number;
  maeSameWeekdayMedian: number;
  beatsNaive: boolean;
}

export interface DemandScenario {
  date: string; dow: number; window: ServiceWindow;
  target: 'recorded_parties';
  parties: { low: number; mid: number; high: number };
  covers: { low: number; mid: number; high: number };
  rangeKind: 'empirical_p10_p90' | 'observed_min_max';
  confidence: 'Low' | 'Medium';
  confidenceReasons: string[];
  factors: FactorEffect[];
  coverage: SourceCoverage[];
  supportNights: number;
  isSample: boolean;
}

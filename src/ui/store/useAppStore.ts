import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import type {
  ColumnMapping,
  DemandScenario,
  ExperimentResult,
  HistoryReconstruction,
  ImportResult,
  Layout,
  PatienceAssumptions,
  Policy,
  RadarContext,
  Scenario,
  ServiceWindow,
  TableDef,
  TableUseAssumptions,
  VolumeSpec,
} from '../../domain/types';
import {
  DEFAULT_NIGHTS,
  DEFAULT_PATIENCE,
  DEFAULT_POLICY,
  DEFAULT_SEED,
  DEFAULT_TABLE_USE,
  DEFAULT_WINDOW,
  emptyContext,
  harborCombinableLayout,
  harborCurrentLayout,
  importOrders,
  loadSample,
  loadStressDemo,
  reconstructHistory,
  runExperiment,
  withLiveWeather,
  SATURDAY_STRESS_PRESET,
  buildAiReviewInput,
  generateAiReview,
  type AiTask,
} from '../../api';

/** One Gemini result. `key` is the import or simulation it describes; a stale key means the text no longer applies. */
export interface AiSlot { text: string | null; loading: boolean; error: string | null; key: unknown }
const EMPTY_SLOT: AiSlot = { text: null, loading: false, error: null, key: null };

export type ScreenId =
  | 'start'
  | 'review'
  | 'floorplan'
  | 'scenarios'
  | 'compare'
  | 'replay'
  | 'radar'
  | 'method';

export type CompareTarget = 'suggested' | 'custom';
const CUSTOM_NAME = 'Custom layout';
const freshLayouts = () => {
  const suggestedLayout = harborCombinableLayout();
  return {
    currentLayout: harborCurrentLayout(),
    suggestedLayout,
    customLayout: cloneLayout(suggestedLayout, 'custom', CUSTOM_NAME),
    altLayout: suggestedLayout,
    compareTarget: 'suggested' as CompareTarget,
  };
};

export interface AppState {
  view: 'landing' | 'app';
  tourStep: number | null;
  startTour: () => void;
  setTourStep: (step: number | null) => void;
  activeScreen: ScreenId;
  rawCsvText: string | null;
  datasetName: string | null;
  importNotice: string | null;
  isSample: boolean;
  activePresetDisclosure: string | null;
  demoBanner: string | null;
  aiSlots: Record<AiTask['kind'], AiSlot>;
  importResult: ImportResult | null;
  radarContext: RadarContext;
  location: { lat: number; lon: number; label: string };
  weatherLoading: boolean;

  // Floor Plan & Scenarios
  currentLayout: Layout;
  /** The alternative being simulated: always either suggestedLayout (B) or customLayout (C). */
  altLayout: Layout;
  suggestedLayout: Layout;
  customLayout: Layout;
  compareTarget: CompareTarget;
  currentPolicy: Policy;
  altPolicy: Policy;

  // Shared Assumptions (All Assumed)
  tableUse: TableUseAssumptions;
  patience: PatienceAssumptions;
  window: ServiceWindow;
  nights: number;
  seed: number;
  volume: VolumeSpec;

  // Derived & Simulated Outputs from Engine API
  reconstruction: HistoryReconstruction | null;
  experimentResult: ExperimentResult | null;

  // Actions
  setScreen: (screen: ScreenId) => void;
  setView: (view: 'landing' | 'app') => void;
  openWorkbench: (screen?: ScreenId) => void;
  loadSyntheticSample: () => void;
  loadSaturdayStressDemo: (screen?: ScreenId) => void;
  dismissDemoBanner: () => void;
  testPeakRush: () => void;
  requestAi: (task: AiTask) => Promise<void>;
  uploadCsvText: (csvText: string, fileName?: string) => void;
  dismissImportNotice: () => void;
  applyManualMapping: (mapping: ColumnMapping) => void;
  updateCurrentLayout: (layout: Layout) => void;
  setCompareTarget: (target: CompareTarget) => void;
  updateCustomLayout: (layout: Layout) => void;
  startCustomFrom: (source: 'current' | 'suggested') => void;
  updateCurrentPolicy: (patch: Partial<Policy>) => void;
  updateAltPolicy: (patch: Partial<Policy>) => void;
  updateTableUse: (patch: Partial<TableUseAssumptions>) => void;
  updatePatience: (patch: Partial<PatienceAssumptions>) => void;
  updateWindow: (patch: Partial<ServiceWindow>) => void;
  setNights: (nights: number) => void;
  setSeed: (seed: number) => void;
  setLatentMultiplier: (mult: number) => void;
  setVolumeHistory: () => void;
  selectRadarScenario: (scenario: DemandScenario, band: 'low' | 'mid' | 'high') => void;
  runSimulation: () => void;
  fetchLiveNwsWeather: () => Promise<void>;
  addOwnerEvent: (date: string, name: string, assumedMultiplier?: number) => void;
  removeOwnerEvent: (index: number) => void;
  addSchoolBreak: (start: string, end: string, name: string) => void;
  removeSchoolBreak: (index: number) => void;
}

const cloneLayout = (l: Layout, id: string, name: string): Layout => ({
  id,
  name,
  tables: l.tables.map((t: TableDef) => ({ ...t })),
  joins: l.joins.map((j) => ({ ...j })),
});

export const appStore = createStore<AppState>((set, get) => ({
  view: 'landing',
  tourStep: null,
  startTour: () => set({ tourStep: 0 }),
  setTourStep: (tourStep) => set({ tourStep }),
  activeScreen: 'start',
  rawCsvText: null,
  datasetName: null,
  importNotice: null,
  isSample: false,
  activePresetDisclosure: null,
  demoBanner: null,
  aiSlots: { review: EMPTY_SLOT, ask: EMPTY_SLOT, data: EMPTY_SLOT, week: EMPTY_SLOT },
  importResult: null,
  radarContext: emptyContext(),
  location: { lat: 37.8044, lon: -122.2712, label: 'Oakland / East Bay, CA' },
  weatherLoading: false,

  ...freshLayouts(),
  currentPolicy: { ...DEFAULT_POLICY, allowJoins: false },
  altPolicy: { ...DEFAULT_POLICY, allowJoins: true },

  tableUse: { ...DEFAULT_TABLE_USE },
  patience: { ...DEFAULT_PATIENCE },
  window: { ...DEFAULT_WINDOW, dows: [...DEFAULT_WINDOW.dows] },
  nights: DEFAULT_NIGHTS,
  seed: DEFAULT_SEED,
  volume: { source: 'history', latentDemandMultiplier: 1.0 },

  reconstruction: null,
  experimentResult: null,

  setScreen: (activeScreen) => set({ activeScreen }),
  setView: (view) => set({ view }),
  openWorkbench: (screen) => set((s) => ({ view: 'app', activeScreen: screen ?? (s.importResult ? s.activeScreen : 'start') })),

  loadSyntheticSample: () => {
    const sample = loadSample();
    const layouts = freshLayouts();
    const { currentLayout } = layouts;
    const nextWindow: ServiceWindow = { ...DEFAULT_WINDOW, dows: [...DEFAULT_WINDOW.dows] };
    const importResult = importOrders(sample.csvText, undefined, { isSample: true });
    const { tableUse } = get();
    const reconstruction = reconstructHistory(importResult.rows, tableUse, currentLayout, nextWindow);
    set({
      rawCsvText: sample.csvText,
      datasetName: 'harbor table synthetic sample',
      importNotice: null,
      demoBanner: null,
      isSample: true,
      activePresetDisclosure: null,
      importResult,
      radarContext: sample.context,
      location: sample.location,
      ...layouts,
      window: nextWindow,
      nights: DEFAULT_NIGHTS,
      seed: DEFAULT_SEED,
      reconstruction,
      experimentResult: null,
      volume: { source: 'history', latentDemandMultiplier: 1.0 },
      activeScreen: 'review',
      view: 'app',
    });
  },

  dismissDemoBanner: () => set({ demoBanner: null }),

  // Keeps the owner's layouts and policies; only the nights studied and the demand assumption change.
  testPeakRush: () => {
    const p = SATURDAY_STRESS_PRESET;
    get().updateWindow({ dows: [...p.window.dows], startMin: p.window.startMin, endMin: p.window.endMin });
    set({
      volume: { source: 'history', latentDemandMultiplier: p.latentDemandMultiplier },
      activePresetDisclosure: `peak rush test: saturday dinners only, with an assumed ${p.latentDemandMultiplier.toFixed(2)}× latent demand (an assumption, not inferred from data). results are modeled, not measured.`,
    });
    get().runSimulation();
  },

  requestAi: async (task) => {
    const s = get();
    if (!s.importResult) return;
    const kind = task.kind;
    // the week memo is keyed by its facts (a string), so a changed outlook hides an old memo
    const key = kind === 'week' ? JSON.stringify(task.week) : kind === 'data' ? s.importResult : s.experimentResult;
    const put = (slot: AiSlot) => set((st) => ({ aiSlots: { ...st.aiSlots, [kind]: slot } }));
    put({ text: null, loading: true, error: null, key });
    const input = buildAiReviewInput({
      report: s.importResult.report, reconstruction: s.reconstruction, result: kind === 'data' ? null : s.experimentResult,
      current: s.currentLayout, alternative: s.altLayout, volume: s.volume, altName: s.altLayout.name,
    });
    try {
      const text = await generateAiReview(input, task);
      if (get().aiSlots[kind].key === key) put({ text, loading: false, error: null, key });
    } catch (e) {
      if (get().aiSlots[kind].key === key) put({ text: null, loading: false, error: e instanceof Error ? e.message : 'unknown error', key });
    }
  },

  loadSaturdayStressDemo: (screen = 'review') => {
    const demo = loadStressDemo();
    const layouts = freshLayouts();
    const { currentLayout, altLayout } = layouts;
    const currentPolicy: Policy = { ...DEFAULT_POLICY, allowJoins: false };
    const altPolicy: Policy = { ...DEFAULT_POLICY, allowJoins: true };
    const nextWindow: ServiceWindow = {
      dows: [...demo.preset.window.dows],
      startMin: demo.preset.window.startMin,
      endMin: demo.preset.window.endMin,
    };
    const nextVolume: VolumeSpec = {
      source: 'history',
      latentDemandMultiplier: demo.preset.latentDemandMultiplier,
    };
    const importResult = importOrders(demo.csvText, undefined, { isSample: true });
    const { tableUse, patience } = get();
    const reconstruction = reconstructHistory(importResult.rows, tableUse, currentLayout, nextWindow);

    const scenarios: Scenario[] = [
      {
        id: 'current',
        name: currentLayout.name || 'Current layout',
        layout: { ...currentLayout, id: 'current' },
        policy: currentPolicy,
      },
      {
        id: 'alternative',
        name: altLayout.name || 'Alternative layout',
        layout: { ...altLayout, id: 'alternative' },
        policy: altPolicy,
      },
    ];

    const experimentResult = runExperiment({
      rows: importResult.rows,
      window: nextWindow,
      tableUse,
      patience,
      volume: nextVolume,
      scenarios,
      baselineId: 'current',
      nights: demo.preset.nights,
      seed: demo.preset.seed,
      capacityLimitedNights: reconstruction.capacityLimitedNights,
    });

    set({
      rawCsvText: demo.csvText,
      datasetName: 'harbor table synthetic sample · saturday stress test',
      importNotice: null,
      demoBanner: 'demo loaded: harbor table, a synthetic 44-seat restaurant, on its saturday dinner rush (demand assumed 25% above what was seated). review its history below, or jump straight to the results.',
      isSample: true,
      activePresetDisclosure: demo.preset.disclosure,
      importResult,
      radarContext: demo.context,
      location: demo.location,
      ...layouts,
      currentPolicy,
      altPolicy,
      window: nextWindow,
      nights: demo.preset.nights,
      seed: demo.preset.seed,
      volume: nextVolume,
      reconstruction,
      experimentResult,
      activeScreen: screen,
      view: 'app',
    });
  },

  uploadCsvText: (csvText: string, fileName?: string) => {
    const importResult = importOrders(csvText, undefined, { isSample: false });
    const name = fileName ?? 'uploaded csv';
    const { tableUse, currentLayout, window } = get();
    const reconstruction =
      importResult.mapping !== null
        ? reconstructHistory(importResult.rows, tableUse, currentLayout, window)
        : null;
    set({
      rawCsvText: csvText,
      datasetName: name,
      demoBanner: null,
      importNotice: importResult.mapping
        ? `successfully imported ${name} · ${importResult.report.rowsUsed.toLocaleString('en-US')} checks parsed`
        : null,
      isSample: importResult.report.isSample,
      activePresetDisclosure: null,
      importResult,
      radarContext: emptyContext(),
      reconstruction,
      experimentResult: null,
      volume: { source: 'history', latentDemandMultiplier: 1.0 },
      activeScreen: 'review',
      view: 'app',
    });
  },

  dismissImportNotice: () => set({ importNotice: null }),

  applyManualMapping: (mapping: ColumnMapping) => {
    const { rawCsvText, isSample, tableUse, currentLayout, window } = get();
    if (!rawCsvText) return;
    const importResult = importOrders(rawCsvText, mapping, { isSample });
    const reconstruction =
      importResult.mapping !== null
        ? reconstructHistory(importResult.rows, tableUse, currentLayout, window)
        : null;
    set({ importResult, reconstruction, experimentResult: null });
  },

  updateCurrentLayout: (currentLayout: Layout) => {
    const { importResult, tableUse, window } = get();
    const reconstruction =
      importResult && importResult.mapping
        ? reconstructHistory(importResult.rows, tableUse, currentLayout, window)
        : null;
    set({ currentLayout, reconstruction });
  },

  // Changing which layout is compared, or editing it, invalidates the last run; results tabs re-run on open.
  setCompareTarget: (compareTarget) => set((s) => ({
    compareTarget,
    altLayout: compareTarget === 'suggested' ? s.suggestedLayout : s.customLayout,
    experimentResult: null,
  })),

  updateCustomLayout: (customLayout: Layout) =>
    set({ customLayout, altLayout: customLayout, compareTarget: 'custom', experimentResult: null }),

  startCustomFrom: (source) => {
    const s = get();
    const customLayout = cloneLayout(source === 'current' ? s.currentLayout : s.suggestedLayout, 'custom', CUSTOM_NAME);
    set({ customLayout, altLayout: customLayout, compareTarget: 'custom', experimentResult: null });
  },

  updateCurrentPolicy: (patch) =>
    set((s) => ({ currentPolicy: { ...s.currentPolicy, ...patch } })),

  updateAltPolicy: (patch) =>
    set((s) => ({ altPolicy: { ...s.altPolicy, ...patch } })),

  updateTableUse: (patch) => {
    const nextTableUse = { ...get().tableUse, ...patch };
    const { importResult, currentLayout, window } = get();
    const reconstruction =
      importResult && importResult.mapping
        ? reconstructHistory(importResult.rows, nextTableUse, currentLayout, window)
        : null;
    set({ tableUse: nextTableUse, reconstruction });
  },

  updatePatience: (patch) =>
    set((s) => ({ patience: { ...s.patience, ...patch } })),

  updateWindow: (patch) => {
    const nextWindow = { ...get().window, ...patch };
    const { importResult, tableUse, currentLayout } = get();
    const reconstruction =
      importResult && importResult.mapping
        ? reconstructHistory(importResult.rows, tableUse, currentLayout, nextWindow)
        : null;
    set({ window: nextWindow, reconstruction });
  },

  setNights: (nights) => set({ nights: Math.max(10, Math.min(500, Math.round(nights))) }),
  setSeed: (seed) => set({ seed: Math.round(seed) }),

  setLatentMultiplier: (latentDemandMultiplier) =>
    set((s) => ({
      volume: { ...s.volume, latentDemandMultiplier },
    })),

  setVolumeHistory: () =>
    set((s) => ({
      volume: { source: 'history', latentDemandMultiplier: s.volume.latentDemandMultiplier },
    })),

  selectRadarScenario: (scenario, band) => {
    const { volume, activePresetDisclosure } = get();
    // Picking a forecast day leaves the stress preset: its 1.25× would otherwise stack on the day's own assumptions.
    const leavingPreset = activePresetDisclosure !== null;
    set({
      volume: {
        source: 'radar',
        scenario,
        band,
        latentDemandMultiplier: leavingPreset ? 1.0 : volume.latentDemandMultiplier,
      },
      activePresetDisclosure: null,
      activeScreen: 'scenarios',
    });
  },

  runSimulation: () => {
    const {
      importResult,
      window,
      tableUse,
      patience,
      volume,
      currentLayout,
      altLayout,
      currentPolicy,
      altPolicy,
      nights,
      seed,
      reconstruction,
    } = get();
    if (!importResult || !importResult.rows.length) return;

    const scenarios: Scenario[] = [
      {
        id: 'current',
        name: currentLayout.name || 'Current layout',
        layout: { ...currentLayout, id: 'current' },
        policy: currentPolicy,
      },
      {
        id: 'alternative',
        name: altLayout.name || 'Alternative layout',
        layout: { ...altLayout, id: 'alternative' },
        policy: altPolicy,
      },
    ];

    const experimentResult = runExperiment({
      rows: importResult.rows,
      window,
      tableUse,
      patience,
      volume,
      scenarios,
      baselineId: 'current',
      nights,
      seed,
      capacityLimitedNights: reconstruction?.capacityLimitedNights,
    });

    set({ experimentResult, activeScreen: 'compare' });
  },

  fetchLiveNwsWeather: async () => {
    const { radarContext, location } = get();
    set({ weatherLoading: true });
    try {
      const nextCtx = await withLiveWeather(radarContext, location.lat, location.lon);
      set({ radarContext: nextCtx, weatherLoading: false });
    } catch {
      set({ weatherLoading: false });
    }
  },

  addOwnerEvent: (date, name, assumedMultiplier) =>
    set((s) => ({
      radarContext: {
        ...s.radarContext,
        events: [
          ...s.radarContext.events,
          assumedMultiplier != null && !Number.isNaN(assumedMultiplier)
            ? { date, name, assumedMultiplier }
            : { date, name },
        ],
      },
    })),

  removeOwnerEvent: (index) =>
    set((s) => ({
      radarContext: {
        ...s.radarContext,
        events: s.radarContext.events.filter((_, i) => i !== index),
      },
    })),

  addSchoolBreak: (start, end, name) =>
    set((s) => ({
      radarContext: {
        ...s.radarContext,
        schoolBreaks: [...s.radarContext.schoolBreaks, { start, end, name }],
      },
    })),

  removeSchoolBreak: (index) =>
    set((s) => ({
      radarContext: {
        ...s.radarContext,
        schoolBreaks: s.radarContext.schoolBreaks.filter((_, i) => i !== index),
      },
    })),
}));

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(
    appStore.subscribe,
    () => selector(appStore.getState()),
    () => selector(appStore.getState()),
  );
}
useAppStore.getState = appStore.getState;
useAppStore.setState = appStore.setState;
useAppStore.subscribe = appStore.subscribe;

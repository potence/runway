import { describe, expect, it, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { App } from '../../src/ui/App';
import { useAppStore } from '../../src/ui/store/useAppStore';
import { getLandingContent, SATURDAY_STRESS_PRESET } from '../../src/api';

describe('Runway UI Spine & 7-Day Demand Outlook Workflow', () => {
  beforeEach(() => {
    useAppStore.setState({
      view: 'landing',
      tourStep: null,
      datasetName: null,
      importNotice: null,
      activeScreen: 'start',
      rawCsvText: null,
      isSample: false,
      activePresetDisclosure: null,
      importResult: null,
      reconstruction: null,
      experimentResult: null,
    });
  });

  it('renders lowercase YC minimalist landing screen using getLandingContent() contract, Saturday stress CTA, and zero em-dashes', () => {
    const landing = getLandingContent();
    const html = renderToStaticMarkup(createElement(App)).replace(/&#x27;/g, "'");
    expect(html).toContain(landing.hero.headline);
    expect(html).toContain(landing.hero.subhead);
    expect(html).toContain('launch interactive demo');
    expect(html).toContain('upload pos csv');
    expect(html).toContain('download sample pos data');
    expect(html).not.toContain('app-sidebar'); // landing is full width, no workbench chrome
    for (const pillar of landing.pillars) {
      expect(html).toContain(pillar.title);
    }
    for (const d of landing.downloads) expect(html).toContain(`href="${d.href}"`);
    expect(html).toContain('your csv is processed in your browser and is not uploaded.');
    expect(html).not.toContain('—');
  });

  it('workbench import screen offers upload, both presets, downloads and a way back to landing', () => {
    useAppStore.getState().openWorkbench();
    expect(useAppStore.getState().view).toBe('app');
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('back to landing');
    expect(html).toContain('standard 44-seat');
    expect(html).toContain('drag your toast, square, or pos csv here');
    expect(html).toContain('saturday stress demo');
    expect(html).toContain('csv-drop-zone');
    expect(html).toContain('download sample pos data');
  });

  it('loads Saturday stress demo preset via loadSaturdayStressDemo and renders verbatim preset disclosure', () => {
    useAppStore.getState().loadSaturdayStressDemo();
    const state = useAppStore.getState();
    expect(state.isSample).toBe(true);
    // the demo opens on Data Review with context first, with a one-click path to the (already computed) results
    expect(state.activeScreen).toBe('review');
    const reviewHtml = renderToStaticMarkup(createElement(App));
    expect(reviewHtml).toContain('demo loaded: harbor table');
    expect(reviewHtml).toContain('demo-jump-compare');
    expect(reviewHtml).toContain('nights when 90% or more of your tables were in use at once');
    useAppStore.getState().setScreen('compare');
    expect(state.window.dows).toEqual([6]);
    expect(state.volume.latentDemandMultiplier).toBe(1.25);
    expect(state.nights).toBe(200);
    expect(state.seed).toBe(42);
    expect(state.activePresetDisclosure).toBe(SATURDAY_STRESS_PRESET.disclosure);
    expect(state.experimentResult).not.toBeNull();

    const compareHtml = renderToStaticMarkup(createElement(App)).replace(/&#x27;/g, "'");
    expect(state.view).toBe('app');
    expect(compareHtml).toContain(SATURDAY_STRESS_PRESET.disclosure);
    expect(compareHtml).toContain('switching to combinable two-tops cuts the average wait by 2.6 min.');
    expect(compareHtml).toContain('200 simulated nights');
    expect(compareHtml).toContain('seed 42');
    expect(compareHtml).not.toContain('—');
  });

  it('pitch path: stress demo, then Sat 11/7 HIGH from the outlook resets latent demand to 1.00 and matches the pinned result', async () => {
    const { buildRadar, toDemandScenario, DEFAULT_WINDOW } = await import('../../src/api');
    useAppStore.getState().loadSaturdayStressDemo();
    const st = useAppStore.getState();
    const day = buildRadar(st.importResult!.rows, st.radarContext, '2026-11-04', DEFAULT_WINDOW, st.tableUse, true).days.find((d) => d.date === '2026-11-07')!;
    useAppStore.getState().selectRadarScenario(toDemandScenario(day, DEFAULT_WINDOW)!, 'high');
    expect(useAppStore.getState().volume.latentDemandMultiplier).toBe(1);
    expect(useAppStore.getState().activePresetDisclosure).toBeNull();
    useAppStore.getState().runSimulation();
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('switching to combinable two-tops seats 7.2 more covers per night, cuts the average wait by 3.1 min and prevents 3.3 walkaways per night.');
  });

  it('results tabs never dead-end: compare runs the simulation on the fly', () => {
    useAppStore.getState().loadSyntheticSample();
    useAppStore.getState().setNights(20);
    expect(useAppStore.getState().experimentResult).toBeNull();
    const html = renderToStaticMarkup(createElement(App));
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*><span>compare layouts/);
    useAppStore.getState().runSimulation(); // what the nav click does before switching screens
    expect(useAppStore.getState().experimentResult).not.toBeNull();
  });

  it('active dataset card and import notice show the uploaded file name and check count', () => {
    const csv = ['Opened,Paid,# of Guests,Amount', '10/16/26 6:00 PM,10/16/26 7:10 PM,4,120.50', '10/16/26 6:30 PM,10/16/26 7:30 PM,2,64.00'].join(String.fromCharCode(10));
    useAppStore.getState().uploadCsvText(csv, 'my-edited-export.csv');
    const st = useAppStore.getState();
    expect(st.datasetName).toBe('my-edited-export.csv');
    expect(st.importNotice).toBe('successfully imported my-edited-export.csv · 2 checks parsed');
    expect(renderToStaticMarkup(createElement(App))).toContain('successfully imported my-edited-export.csv');
    useAppStore.getState().setScreen('start');
    const start = renderToStaticMarkup(createElement(App));
    expect(start).toContain('active dataset');
    expect(start).toContain('download this dataset as csv');
    expect(start).toContain('upload different / modified csv');
    expect(start).toContain('configure floor plan →');
    expect(start).toContain('checks loaded from my-edited-export');
  });

  it('guided tour opens from landing and steps through four cards', () => {
    useAppStore.getState().startTour();
    let html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('step 1 of 4');
    useAppStore.getState().setTourStep(3);
    html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('read the takeaway');
    expect(html).toContain('got it');
    useAppStore.getState().setTourStep(null);
    expect(renderToStaticMarkup(createElement(App))).not.toContain('tour-card');
  });

  it('loads Harbor Table synthetic sample, displays persistent SAMPLE DATA ribbon, and renders Data Review', () => {
    useAppStore.getState().loadSyntheticSample();
    const state = useAppStore.getState();
    expect(state.isSample).toBe(true);
    expect(state.activeScreen).toBe('review');
    expect(state.importResult?.rows.length).toBeGreaterThan(2000);
    expect(state.reconstruction).not.toBeNull();

    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('SAMPLE DATA (synthetic)');
    expect(html).toContain('pos-derived occupancy proxy (not verified occupancy)');
    expect(html).toContain('recorded checks may understate demand');
    expect(html).not.toContain('—');
  });

  it('renders the a/b/c layout tabs with a and b locked', () => {
    useAppStore.getState().loadSyntheticSample();
    useAppStore.getState().setScreen('floorplan');
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('test table layouts before service');
    expect(html).toContain('layout a: current (locked)');
    expect(html).toContain('layout b: suggested combinable (locked)');
    expect(html).toContain('layout c: build your own');
    expect(html).toContain('locked benchmark'); // opens on b, the default comparison
    expect(html).toContain('combinable table links');
    expect(html).not.toContain('—');
  });

  it('editing layout c makes it the compared alternative; switching back restores the locked b', () => {
    const st = useAppStore.getState();
    st.loadSyntheticSample();
    const b = useAppStore.getState().suggestedLayout;
    expect(useAppStore.getState().altLayout).toBe(b);
    useAppStore.getState().runSimulation();
    const c = { ...useAppStore.getState().customLayout, tables: useAppStore.getState().customLayout.tables.slice(1) };
    useAppStore.getState().updateCustomLayout(c);
    let now = useAppStore.getState();
    expect(now.compareTarget).toBe('custom');
    expect(now.altLayout).toBe(c);
    expect(now.experimentResult).toBeNull(); // stale run cleared; results tabs re-run
    expect(now.suggestedLayout).toBe(b); // b untouched
    useAppStore.getState().setCompareTarget('suggested');
    now = useAppStore.getState();
    expect(now.altLayout).toBe(b);
    expect(now.customLayout).toBe(c); // c kept for later
  });

  it('runs deterministic simulation and renders compare layouts screen with verbatim demandBanner and provenance labels', () => {
    useAppStore.getState().loadSyntheticSample();
    useAppStore.getState().setNights(25);
    useAppStore.getState().runSimulation();

    const state = useAppStore.getState();
    expect(state.activeScreen).toBe('compare');
    expect(state.experimentResult).not.toBeNull();

    const html = renderToStaticMarkup(createElement(App)).replace(/&#x27;/g, "'");
    expect(html).toContain(state.experimentResult!.demandBanner);
    expect(html).toContain('data-testid="executive-takeaway"');
    expect(html).toContain('25 simulated nights');
    expect(html).toContain('spread across simulated nights, not a calibrated interval');
    expect(html).toContain('mean (empirical 10th-90th across simulated nights)');
    expect(html).not.toContain('confidence interval');
    expect(html).not.toContain('prediction interval');
    expect(html).not.toContain('—');
  });

  it('renders minute-by-minute service replay screen with modeled queue label and snapshot tables', () => {
    useAppStore.getState().loadSyntheticSample();
    useAppStore.getState().setNights(20);
    useAppStore.getState().runSimulation();
    useAppStore.getState().setScreen('replay');

    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('modeled demand arrivals waiting (modeled wait)');
    expect(html).toContain('service replay');
    expect(html).not.toMatch(/n\d+-p\d+ · \d+p/); // party ids no longer drawn on tables or queue chips
    expect(html).not.toContain('—');
  });

  it('renders method & limitations screen with validation layers a-d and layer d not completed', () => {
    useAppStore.getState().openWorkbench('method');
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('pos check-open time is not customer arrival');
    expect(html).toContain('layer d · real-world prospective validation');
    expect(html).toContain('real-world predictive validation has not been performed.');
    expect(html).not.toContain('—');
  });

  it('renders 7-day demand outlook cards with incomplete event coverage note and simulate action', () => {
    useAppStore.getState().loadSyntheticSample();
    useAppStore.getState().setScreen('radar');

    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('anticipate busy nights with weather and events');
    expect(html).toContain('No events listed; coverage is incomplete.');
    expect(html).toContain('simulate this day');
    expect(html).not.toContain('confidence interval');
    expect(html).not.toContain('prediction interval');

    const state = useAppStore.getState();
    const { rows, report } = state.importResult!;
    expect(rows.length).toBeGreaterThan(0);
    expect(report.dateRange).not.toBeNull();
  });

  it('shows manual column-mapping form when uploaded CSV lacks standard Toast headers, then recovers on applyManualMapping', () => {
    const customCsv = [
      'OrderOpen,OrderClose,PartySize,CheckTotal',
      '2026-10-16 18:00,2026-10-16 19:15,4,120.50',
      '2026-10-16 18:30,2026-10-16 19:45,2,64.00',
    ].join('\n');

    useAppStore.getState().uploadCsvText(customCsv);
    expect(useAppStore.getState().importResult?.mapping).toBeNull();

    const mapperHtml = renderToStaticMarkup(createElement(App));
    expect(mapperHtml).toContain('map csv columns');
    expect(mapperHtml).toContain('OrderOpen');
    expect(mapperHtml).not.toContain('—');

    useAppStore.getState().applyManualMapping({
      opened: 'OrderOpen',
      closed: 'OrderClose',
      guests: 'PartySize',
      amount: 'CheckTotal',
    });

    expect(useAppStore.getState().importResult?.rows.length).toBe(2);
    const reviewHtml = renderToStaticMarkup(createElement(App));
    expect(reviewHtml).toContain('data review &amp; historical reconstruction');
    expect(reviewHtml).not.toContain('SAMPLE DATA (synthetic)');
    expect(reviewHtml).not.toContain('—');
  });

  it('explains a no-difference result and reruns the owner layouts under a saturday rush', () => {
    const st = useAppStore.getState();
    st.loadSyntheticSample();
    st.startCustomFrom('current'); // c = copy of a: the effect is exactly zero
    useAppStore.getState().runSimulation();
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('no-difference-explainer');
    expect(html).toContain('test under peak saturday rush (1.25× demand)');

    const altBefore = useAppStore.getState().altLayout;
    useAppStore.getState().testPeakRush();
    const after = useAppStore.getState();
    expect(after.altLayout).toBe(altBefore); // the owner's layout is kept, not swapped for the demo preset
    expect(after.window.dows).toEqual([6]);
    expect(after.volume).toEqual({ source: 'history', latentDemandMultiplier: 1.25 });
    expect(after.activeScreen).toBe('compare');
    expect(after.experimentResult).not.toBeNull();
  });
});

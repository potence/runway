import type { ExperimentResult, Takeaway } from '../domain/types';

// Turns paired metrics into a short, honest summary. Only differences whose 10th-90th band excludes zero
// are stated as effects; everything else says "no clear difference". No extrapolation beyond the run.
const fmt = (x: number) => (Math.abs(x) < 0.05 ? '0' : Math.abs(x).toFixed(1));
const signed = (x: number) => (Math.abs(x) < 0.05 ? '0' : `${x > 0 ? '+' : '−'}${fmt(x)}`);

export function buildTakeaway(r: ExperimentResult, altName: string): Takeaway {
  const pair = (k: string) => r.metrics.find(m => m.key === k)?.paired[0];
  const covers = pair('seatedCovers'), wait = pair('meanWaitMin'), walk = pair('abandonedParties');
  const nights = (covers ?? wait ?? walk)?.nights ?? 0;
  const items: Takeaway['items'] = [];
  const phrases: string[] = [];
  const detail = (p: { wins: number; nights: number; noClearDifference: boolean }) =>
    p.noClearDifference ? 'no clear difference (range includes zero)' : `better on ${p.wins} of ${p.nights} nights`;

  if (covers) {
    const clear = !covers.noClearDifference;
    items.push({ key: 'covers', label: 'seated covers per night', value: signed(covers.meanDelta), clear, detail: detail(covers) });
    if (clear) phrases.push(covers.meanDelta > 0 ? `seats ${fmt(covers.meanDelta)} more covers per night` : `seats ${fmt(covers.meanDelta)} fewer covers per night`);
  }
  if (wait) {
    const clear = !wait.noClearDifference;
    items.push({ key: 'wait', label: 'average wait', value: `${signed(wait.meanDelta)} min`, clear, detail: detail(wait) });
    if (clear) phrases.push(wait.meanDelta < 0 ? `cuts the average wait by ${fmt(wait.meanDelta)} min` : `adds ${fmt(wait.meanDelta)} min to the average wait`);
  }
  if (walk) {
    const clear = !walk.noClearDifference;
    items.push({ key: 'walkaways', label: 'walkaways prevented per night', value: signed(-walk.meanDelta), clear, detail: detail(walk) });
    if (clear) phrases.push(walk.meanDelta < 0 ? `prevents ${fmt(walk.meanDelta)} walkaways per night` : `adds ${fmt(walk.meanDelta)} walkaways per night`);
  }

  const name = altName.toLowerCase();
  const headline = phrases.length
    ? `switching to ${name} ${phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}` : phrases[0]}.`
    : `no clear difference between the two layouts on these nights.`;
  const unclear = items.filter(i => !i.clear).map(i => i.label.replace(' per night', ''));
  const footnote = `${nights} simulated nights; both layouts face the same modeled guests each night. ` +
    (unclear.length && phrases.length ? `${unclear.join(' and ')}: no clear difference. ` : '') +
    'modeled under stated assumptions, not measured.';
  return { headline, items, footnote };
}

/**
 * When no headline effect is clear, says why in plain words, from the run's own baseline numbers.
 * Returns null when at least one effect is clear.
 */
export function explainNoDifference(r: ExperimentResult): string | null {
  const m = (k: string) => r.metrics.find(x => x.key === k);
  const keys = ['seatedCovers', 'meanWaitMin', 'abandonedParties'];
  if (keys.some(k => m(k)?.paired[0] && !m(k)!.paired[0].noClearDifference)) return null;
  const wait = m('meanWaitMin')?.perScenario['current']?.mean ?? 0;
  const walk = m('abandonedParties')?.perScenario['current']?.mean ?? 0;
  if (wait < 3 && walk < 0.5) {
    return `at this demand level the current layout already seats almost every party quickly (average modeled wait ${wait.toFixed(1)} min, ${walk.toFixed(1)} walkaways per night), so there is no table bottleneck for a different layout to fix.`;
  }
  return `at this demand level the gap between the layouts is smaller than the night-to-night variation (current layout: average modeled wait ${wait.toFixed(1)} min, ${walk.toFixed(1)} walkaways per night).`;
}

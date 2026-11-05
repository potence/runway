import { useEffect, useState, type CSSProperties } from 'react';
import { useAppStore, type ScreenId } from '../store/useAppStore';

// `targets`: first selector found on screen gets the spotlight; none found (e.g. on the landing page) = centered card.
export const TOUR_STEPS: { title: string; body: string; screen: ScreenId; targets: string[] }[] = [
  { title: 'import your data', screen: 'start', targets: ['[data-testid="csv-drop-zone"]', '[data-testid="launch-demo-cta"]'],
    body: 'drop a pos export here or pick a synthetic sample. everything runs locally in your browser; nothing is uploaded.' },
  { title: 'test table layouts', screen: 'floorplan', targets: ['#floor-canvas', '#nav-floorplan'],
    body: 'drag tables around your dining room and click two tables to combine them for bigger parties.' },
  { title: 'run 200 simulated nights', screen: 'scenarios', targets: ['#run-sim-btn', '#nav-scenarios'],
    body: 'click here. both layouts face the same modeled dinner rushes, built from your own history and the assumptions you set.' },
  { title: 'read the takeaway', screen: 'compare', targets: ['#takeaway-card', '#nav-compare'],
    body: 'the modeled change in wait times and seated covers, before you move a single physical table.' },
];

const PAD = 8;       // spotlight padding around the target
const CARD_W = 360;
const CARD_H = 230;  // generous estimate, only used to choose a side

type Rect = { top: number; left: number; width: number; height: number };

function measure(selectors: string[]): Rect | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
  }
  return null;
}

/** Puts the card below, above, or beside the spotlight, whichever fits the viewport first. */
function cardPosition(r: Rect): CSSProperties {
  const vw = window.innerWidth, vh = window.innerHeight, gap = 14;
  const left = Math.max(16, Math.min(r.left, vw - CARD_W - 16));
  if (r.top + r.height + gap + CARD_H < vh) return { top: r.top + r.height + gap, left };
  if (r.top - gap - CARD_H > 0) return { bottom: vh - r.top + gap, left };
  const top = Math.max(16, Math.min(r.top, vh - CARD_H - 16));
  if (r.left + r.width + gap + CARD_W < vw) return { top, left: r.left + r.width + gap };
  if (r.left - gap - CARD_W > 0) return { top, left: r.left - gap - CARD_W };
  return { bottom: 16, right: 16 };
}

export function TourButton({ className = 'btn' }: { className?: string }) {
  const startTour = useAppStore((s) => s.startTour);
  return (
    <button type="button" className={className} data-testid="tour-btn" onClick={startTour}>
      take quick tour
    </button>
  );
}

export function GuidedTour() {
  const step = useAppStore((s) => s.tourStep);
  const setTourStep = useAppStore((s) => s.setTourStep);
  const view = useAppStore((s) => s.view);
  const hasData = useAppStore((s) => Boolean(s.importResult?.rows.length));
  const hasSim = useAppStore((s) => Boolean(s.experimentResult));
  const setScreen = useAppStore((s) => s.setScreen);
  const runSimulation = useAppStore((s) => s.runSimulation);
  const activeScreen = useAppStore((s) => s.activeScreen);
  const [rect, setRect] = useState<Rect | null>(null);

  // In the workbench with data loaded, each step shows its own screen behind the card. Keyed on the step only,
  // so loading a demo while the tour is open never gets pulled back to a tour screen.
  useEffect(() => {
    if (step === null || view !== 'app' || !hasData) return;
    const target = TOUR_STEPS[step].screen;
    if (target === 'compare' && !hasSim) runSimulation();
    setScreen(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTourStep(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, setTourStep]);

  // Track the target while the tour is open: screens fade in, pages scroll and windows resize under it.
  useEffect(() => {
    if (step === null) { setRect(null); return; }
    const selectors = TOUR_STEPS[step].targets;
    // after the step's screen mounts, bring its target into view
    const scrollTimer = window.setTimeout(() => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); break; }
      }
    }, 60);
    const update = () => setRect((prev) => {
      const next = measure(selectors);
      const same = prev && next && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5
        && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5;
      return same || (!prev && !next) ? prev : next;
    });
    update();
    const timer = window.setInterval(update, 120);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.clearTimeout(scrollTimer); window.clearInterval(timer); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step, activeScreen, view]);

  if (step === null) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  return (
    <div className={`tour-layer ${rect ? 'has-spot' : 'tour-scrim'}`} onClick={(e) => { if (e.target === e.currentTarget) setTourStep(null); }}>
      {rect && <div className="tour-spot" data-testid="tour-spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
      <div className="tour-card fade-in" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="tour-card"
        style={rect ? { position: 'fixed', ...cardPosition(rect) } : undefined}>
        <div className="tour-progress" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => <span key={i} className={i <= step ? 'is-on' : ''} />)}
        </div>
        <div className="tour-kicker">step {step + 1} of {TOUR_STEPS.length}</div>
        <h2 id="tour-title">{s.title}</h2>
        <p>{s.body}</p>
        <div className="tour-actions">
          <button type="button" className="link-btn" onClick={() => setTourStep(null)}>exit</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button type="button" className="btn" onClick={() => setTourStep(step - 1)}>back</button>}
            <button type="button" className="btn btn-primary" autoFocus onClick={() => setTourStep(last ? null : step + 1)}>
              {last ? 'got it' : 'next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

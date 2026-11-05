import { buildTakeaway } from '../../api';
import type { ExperimentResult } from '../../domain/types';

export function TakeawayCard({ result, altName, seed }: { result: ExperimentResult; altName: string; seed: number }) {
  const t = buildTakeaway(result, altName);
  return (
    <section className="takeaway" id="takeaway-card" data-testid="executive-takeaway" aria-label="takeaway">
      <div className="takeaway-kicker">takeaway</div>
      <p className="takeaway-headline">{t.headline}</p>
      <div className="takeaway-stats">
        {t.items.map((i) => (
          <div key={i.key} className={`takeaway-stat ${i.clear ? 'is-clear' : 'is-unclear'}`}>
            <div className="takeaway-value">{i.value}</div>
            <div className="takeaway-label">{i.label}</div>
            <div className="takeaway-detail">{i.detail}</div>
          </div>
        ))}
      </div>
      <p className="takeaway-foot">{t.footnote} seed {seed}.</p>
    </section>
  );
}

import { getLandingContent } from '../../api';
import { CsvUploadButton, SampleDownloads } from '../components/CsvUpload';
import { useAppStore } from '../store/useAppStore';
import { TourButton } from '../components/GuidedTour';

export function LandingScreen() {
  const c = getLandingContent();
  const loadSaturdayStressDemo = useAppStore((s) => s.loadSaturdayStressDemo);
  const loadSyntheticSample = useAppStore((s) => s.loadSyntheticSample);
  const openWorkbench = useAppStore((s) => s.openWorkbench);
  const hasSession = useAppStore((s) => Boolean(s.importResult?.rows.length));

  return (
    <div className="landing" data-testid="landing-page">
      <nav className="landing-nav" aria-label="site">
        <span className="landing-logo">runway</span>
        <div className="landing-nav-links">
          <a href="#research">research</a>
          <a href="#downloads">sample data</a>
          <TourButton className="btn btn-ghost" />
          <button type="button" className="btn btn-primary" onClick={() => openWorkbench()}>
            {hasSession ? 'back to workbench' : 'open workbench'}
          </button>
        </div>
      </nav>

      <header className="landing-hero-full fade-in">
        <div className="landing-brand-pill">{c.hero.tagline}</div>
        <h1 className="landing-headline-xl">{c.hero.headline}</h1>
        <p className="landing-subtitle">{c.hero.subhead}</p>
        <div className="landing-actions">
          <button type="button" className="btn btn-primary btn-lg" data-testid="launch-demo-cta" onClick={() => loadSaturdayStressDemo()}>
            launch interactive demo
          </button>
          <CsvUploadButton />
          <a className="btn btn-lg btn-ghost" href="#downloads">download sample pos data</a>
        </div>
        <p className="landing-fineprint">
          the demo opens a synthetic restaurant on a saturday rush, with demand assumed 25% above what was seated.
        </p>
      </header>

      <section className="landing-cards" aria-label="what runway does">
        {c.pillars.map((p, i) => (
          <article key={p.id} className="landing-card">
            <span className="landing-card-index">0{i + 1}</span>
            <h2>{p.title}</h2>
            <p>{p.summary}</p>
          </article>
        ))}
      </section>

      <section id="downloads" className="landing-section">
        <div className="landing-section-head">
          <h2>try it with a real file</h2>
          <p>download a synthetic pos export, then drop it into the uploader. every file is labeled sample data when it loads.</p>
        </div>
        <SampleDownloads />
        <div className="landing-inline-actions">
          <button type="button" className="btn" data-testid="landing-load-sample" onClick={loadSyntheticSample}>
            or open the built-in synthetic sample
          </button>
        </div>
      </section>

      <section id="research" className="landing-section landing-two-col">
        <div>
          <h2>research</h2>
          {c.research.map((r) => (
            <div key={r.title} className="citation">
              <div className="citation-title">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}
              </div>
              <div className="citation-meta">{r.authors} · {r.year} · {r.publisher}</div>
              <p>{r.relevance}</p>
            </div>
          ))}
        </div>
        <div>
          <h2>what we promise</h2>
          <ul className="guarantee-list">
            {c.guarantees.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      </section>

      <footer className="landing-footer">
        <span>runway</span>
        <button type="button" className="link-btn" onClick={() => openWorkbench('method')}>method &amp; limitations</button>
      </footer>
    </div>
  );
}

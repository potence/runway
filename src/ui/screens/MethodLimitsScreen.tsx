import { useAppStore } from '../store/useAppStore';

export function MethodLimitsScreen() {
  const setScreen = useAppStore((s) => s.setScreen);

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">methodology, provenance &amp; known limitations</h1>
          <p className="screen-subtitle">
            pos check-open time is not customer arrival. runway strictly separates historical table-use reconstruction
            from layout simulation and labels every quantity with its exact provenance.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => setScreen('start')}>
            back to start
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">table layout simulation provenance legend</h2>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>label</th>
                  <th>meaning &amp; examples</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">observed</td>
                  <td>
                    direct pos export fields after cleaning (<code className="mono">opened</code>,{' '}
                    <code className="mono">paid/closed</code>, guest count, net check amount, party-size mix).
                  </td>
                </tr>
                <tr>
                  <td className="mono">derived</td>
                  <td>
                    observed pos records combined with assumed offsets (e.g., estimated table-use intervals{' '}
                    <code className="mono">[checkopen - openlag, checkclose + linger]</code> and capacity-limited night flags).
                  </td>
                </tr>
                <tr>
                  <td className="mono">modeled</td>
                  <td>
                    simulation or forecast output (modeled demand arrivals, modeled wait under these
                    assumptions, modeled abandonment under your patience assumption, seated covers).
                  </td>
                </tr>
                <tr>
                  <td className="mono">assumed</td>
                  <td>
                    owner-controlled or default configuration input (table layout, nesting/join policy,{' '}
                    <code className="mono">openlagmin</code>, <code className="mono">lingermin</code>, patience, and{' '}
                    <code className="mono">latentdemandmultiplier</code>). never inferred from pos data.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">7-day demand outlook factor evidence legend</h2>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>label</th>
                  <th>meaning &amp; multiplier policy</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">learned</td>
                  <td>
                    estimated from matched historical observations with 4+ exposed and 4+ comparison nights and explicit
                    support counts.
                  </td>
                </tr>
                <tr>
                  <td className="mono">assumed</td>
                  <td>
                    multiplier explicitly entered by the restaurant owner for a known local event or promotion; never
                    presented as learned from data.
                  </td>
                </tr>
                <tr>
                  <td className="mono">flag-only</td>
                  <td>
                    external context shown for awareness (weather, federal/dining holidays, school breaks, or unquantified
                    events). multiplier remains strictly neutral at <code className="mono">1.00x</code>.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <h2 className="panel-title">why pos check-open time is not customer queue arrival</h2>
        </div>
        <div className="grid-2" style={{ textTransform: 'lowercase' }}>
          <div>
            <p style={{ margin: '0 0 8px 0', color: 'var(--body)' }}>
              <strong>1. timestamp semantics:</strong> in pos exports such as toast{' '}
              <code className="mono">orderdetails.csv</code>, <code className="mono">opened</code> records when a server
              opened the check at a table, not when the party physically arrived at the host stand or joined a waitlist.
              similarly, <code className="mono">paid</code> / <code className="mono">closed</code> does not establish the
              exact minute guests stood up and left.
            </p>
            <p style={{ margin: 0, color: 'var(--body)' }}>
              <strong>2. unobserved demand &amp; censoring:</strong> seated-check exports contain only parties that were
              seated. parties that walked away due to long waits are absent from pos records. recorded check volume on
              busy nights is therefore capacity-censored.
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 8px 0', color: 'var(--body)' }}>
              <strong>3. strictly separated pipelines:</strong> runway never feeds historical table-use start estimates
              into the simulation queue as arrival times. historical reconstruction (<code className="mono">reconstructhistory</code>)
              produces pos-derived occupancy proxies only.
            </p>
            <p style={{ margin: 0, color: 'var(--body)' }}>
              <strong>4. simulated demand generation:</strong> layout simulation (<code className="mono">runexperiment</code>)
              generates fresh modeled demand arrivals from the recorded-seating timing profile scaled by your explicit{' '}
              <code className="mono">latentdemandmultiplier</code> (default <code className="mono">1.00x</code>) and starts
              each party&apos;s patience clock at its modeled arrival time.
            </p>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <h2 className="panel-title">validation layers (a-d) &amp; what they establish</h2>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>layer</th>
                <th>verification scope</th>
                <th>what it establishes</th>
                <th>what it does not establish</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">layer a · software correctness</td>
                <td>deterministic seed repeatability, no table double-booking, capacity bounds, terminal party states, paired common random numbers.</td>
                <td>the discrete-event engine and parser obey their formal specification.</td>
                <td>real-world accuracy of customer behavior or restaurant revenue gains.</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>
                  verified in suite
                </td>
              </tr>
              <tr>
                <td className="mono">layer b · analytical queueing</td>
                <td>restricted single-party-size, identical-table, poisson arrival, exponential service, strict fcfs, infinite-patience check against erlang c.</td>
                <td>core queueing mechanics match analytical queueing theory under idealized assumptions.</td>
                <td>accuracy for mixed party sizes, table joins, finite patience, or real host stands.</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>
                  verified in suite
                </td>
              </tr>
              <tr>
                <td className="mono">layer c · historical consistency</td>
                <td>pos-derived occupancy proxy reconstruction, configured seat consistency check, and rolling-origin 7-day forecast backtest vs. naive weekday baselines.</td>
                <td>internal consistency with recorded pos checks and out-of-sample baseline error on historical records.</td>
                <td>causal impact of a layout change or prospective complete-demand accuracy.</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>
                  reported in app
                </td>
              </tr>
              <tr>
                <td className="mono">layer d · real-world prospective validation</td>
                <td>prospective before/after floor-plan trials or live wait-time validation at an operating restaurant.</td>
                <td>none</td>
                <td><strong>real-world predictive validation has not been performed.</strong></td>
                <td className="mono" style={{ color: 'var(--muted)' }}>
                  not completed
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-raised">
        <div className="panel-header">
          <h2 className="panel-title">synthetic sample data &amp; external coverage disclosures</h2>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--body)', fontSize: 12.5, textTransform: 'lowercase' }}>
          <li>
            <strong>harbor table synthetic dataset:</strong> the built-in harbor table csv and context json are
            synthetic fixtures created to exercise row cleaning, censoring warnings, combinable table joins, and
            demand forecast code paths. they must never be cited as empirical evidence from a real restaurant.
          </li>
          <li>
            <strong>event &amp; weather coverage:</strong> when the 7-day outlook shows no listed events for a date, it
            explicitly states <em>&ldquo;no events listed; coverage is incomplete.&rdquo;</em> only owner-entered
            events and school breaks are known to the system, and weather is treated as flag-only (<code className="mono">1.00x</code>).
          </li>
          <li>
            <strong>out of scope in mvp:</strong> staffing headcounts, kitchen prep quantities, and revpash timing
            metrics are intentionally excluded because seated pos check timestamps alone cannot validate them.
          </li>
        </ul>
      </section>
    </div>
  );
}

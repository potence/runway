# runway

**plan rush hour for your restaurant before you move a single table.**

Runway is a client-only planning tool for independent full-service restaurants. It turns the check-level history your point of sale already records into two things:

- **Floor Plan Lab**: a counterfactual dining-room simulator. Change your table mix, then see how the same modeled dinner rushes play out in each layout.
- **Rush Radar**: a 7-day outlook of expected recorded parties, built from your own history, with weather, holidays and local events shown as context.

Everything runs in your browser. Your POS file is parsed in memory and never uploaded anywhere.

---

## Key capabilities

1. **POS data ingestion**
   - Parses check-level CSV exports in the browser.
   - Toast `OrderDetails` exports are mapped automatically. Square or other exports can be mapped column by column.
   - Voided, takeout/delivery and broken rows are set aside and listed in a cleaning ledger.
   - Nothing leaves browser memory.
2. **Floor Plan Lab**
   - Three layouts:
     - **A, your current room**: locked as the baseline.
     - **B, a suggested layout**: locked. Some fixed four-tops become two-tops that push together in pairs.
     - **C, your own design**: fully editable.
   - Drag tables with snap and collision spacing, add or remove tables, and click two tables to make them combinable.
3. **Deterministic simulation**
   - 200 paired simulated nights.
   - Both layouts face exactly the same modeled guests each night (seeded common random numbers), so the difference you see comes from the room, not from luck.
   - Results show the mean and the 10th–90th percentile spread across nights. An effect is only called out when that spread excludes zero.
4. **Service replay**
   - Minute-by-minute playback of one typical simulated night.
   - Shows table states (available / occupied with minutes left / being cleared) and the host-stand queue.
5. **Rush Radar**
   - A 7-day forecast of recorded parties from your same-weekday history, with a rolling-origin backtest against naive baselines.
   - Live National Weather Service forecasts, the federal holiday calendar and owner-entered local events appear on each day as context.
   - They change the numbers only when you enter an explicit, labeled assumption.
   - "Simulate this day" sends a forecast night straight into the simulator.
6. **Optional AI operations analyst**
   - An optional Google Gemini integration that turns the engine's already-computed results into plain-language briefings:
     - a results review;
     - a data summary;
     - a weekly prep and staffing memo;
     - a question box.
   - Gemini never computes or changes a number.

A synthetic sample restaurant ("Harbor Table", 44 seats) and several synthetic demo CSVs in `public/demo/` let you try everything without your own data. Synthetic data is always labeled **SAMPLE DATA (synthetic)** in the app.

---

## Getting started

Requires Node.js 18 or newer.

```bash
# 1. Install dependencies
npm install

# 2. Start the local development server (http://localhost:5173)
npm run dev

# 3. Run the test suite (67 tests: engine, importer, forecast and UI workflow)
npm test

# 4. Type-check and build for production (output in dist/)
npm run build
```

Other scripts:

- `npm run typecheck`: TypeScript only.
- `npm run gen:sample`: regenerates the synthetic sample restaurant.

---

## Optional AI setup (localhost)

The AI features are off unless you supply a key, and they only run on the local development server.

```bash
cp .env.example .env
# then set GEMINI_API_KEY=... in .env
npm run dev
```

How the key is handled:

- The key is read by the Vite dev server and attached by a local proxy (`/gemini`). It is **never sent to the browser and never written into the production build**.
- A production build (`npm run build`) ships with the AI features switched off.
- Public deployments therefore run fully deterministically, with no key and no LLM calls.
- The only network request the deployed app makes is the optional live weather fetch from api.weather.gov.

---

## Methodology and non-negotiables

- **A check opening is not a guest arrival.** POS check-open times record when an order started, not when a party walked in. Past wait times are therefore not observable from POS data.
- **Unseated parties are not in POS logs.** Guests who left without being seated never produced a check. On capacity-limited nights, recorded checks understate real demand. Runway flags those nights and never claims to recover the missing demand. Testing above recorded demand is an explicit, owner-controlled assumption (for example, 1.25×), and it is always labeled.
- **Two separate pipelines.**
  - Historical reconstruction describes what the POS shows.
  - The simulation generates fresh modeled demand from your history's timing and party mix.
  - The two never exchange values.
- **All math is deterministic TypeScript.** Parsing, reconstruction, forecasting, simulation and metrics live in `src/pos`, `src/model`, `src/radar`, `src/sim` and `src/scenarios`, with seeded random numbers only. Re-running with the same inputs and seed gives identical results. No LLM is involved in any calculation.
- **Modeled, not measured.** Waits, walkaways and covers in the simulator are modeled outputs under the stated assumptions (patience, table reset time, latent demand). Every assumption is visible and editable.

---

## Project layout

```
src/
  api/        the only engine surface the UI imports
  domain/     shared types
  pos/        CSV import and cleaning
  model/      historical reconstruction, demand model, seeded RNG
  sim/        event-driven seating simulation, metrics, replay snapshots
  radar/      7-day forecast, NWS weather, holidays
  scenarios/  preset layouts and assumptions
  sample/     synthetic sample restaurant
  ui/         React screens, components and store
tests/        Vitest suites
scripts/      synthetic data generators
public/demo/  downloadable synthetic POS exports
```

Stack: React 18, TypeScript, Vite, Vitest, Zustand, Papa Parse.

import type { LandingContent } from '../domain/types';

// Landing copy. Lowercase by design. Every claim must stay true to the engine:
// forecasts are recorded-party outlooks, weather/events are context unless the owner enters a multiplier,
// and all wait/cover results are modeled on synthetic data, never measured or "proven".
export const LANDING_CONTENT: LandingContent = {
  hero: {
    tagline: 'runway · restaurant capacity & demand planning',
    headline: 'plan rush hour for your restaurant before you move a single table',
    subhead: 'see busy nights coming from your own pos history, test combinable two-tops and seating rules in a simulation, and compare modeled guest wait times before service starts.',
  },
  pillars: [
    { id: 'demand', title: 'anticipate demand',
      summary: 'a rolling 7-day outlook of recorded parties built from your past check volume. live nws weather, holidays and local events sit alongside as context; they only move the outlook when you enter your own assumption.' },
    { id: 'layouts', title: 'test table layouts',
      summary: 'model combinable two-top tables and seating rules without rearranging physical furniture.' },
    { id: 'results', title: 'compare results',
      summary: '200 simulated nights where each layout faces the same modeled guests, showing changes in modeled wait times and seated covers, and saying "no clear difference" when there is none.' },
  ],
  research: [
    { authors: 'Gary M. Thompson', year: 2007, publisher: 'Cornell Center for Hospitality Research',
      title: 'Restaurant Capacity Effectiveness: Leaving Money on the Tables',
      relevance: 'found that most sampled restaurants had a table mix poorly matched to their party sizes; it motivates testing your table mix, but its revenue figures are not runway results.' },
    { authors: 'Gary M. Thompson', year: 2003, publisher: 'Cornell Center for Hospitality Research',
      title: 'Optimizing a Restaurant’s Seating Capacity: Use Dedicated or Combinable Tables?',
      relevance: 'found that combinable tables do not always win, and dedicated tables often did better for mid-size restaurants; that is why runway tests your own room instead of assuming.',
      url: 'https://www.newswise.com/articles/which-restaurant-table-configurations-make-most-money' },
  ],
  guarantees: [
    'a pos check-open time is never treated as when a guest arrived.',
    'latent demand is an explicit assumption you set (default 1.00×), never inferred from your data.',
    'no llm is used anywhere in the calculations: every number comes from deterministic, seeded code you can rerun.',
    'waits and walkaways are modeled under stated assumptions; the pos cannot record them.',
    'your csv is processed in your browser and is not uploaded.',
  ],
  presets: [
    { id: 'sample', loader: 'loadSample', label: 'synthetic sample',
      detail: 'harbor table, a made-up 44-seat restaurant with 80 nights of synthetic pos history.' },
    { id: 'stress', loader: 'loadStressDemo', label: 'saturday rush surge (assumed 1.25× demand)',
      detail: 'saturdays only, with demand assumed 25% above what was seated. an assumption for stress testing, not a forecast. synthetic data.' },
  ],
  downloads: [
    { href: 'demo/harbor-table-synthetic-pos-export.csv', label: 'full pos export · 80 nights',
      detail: 'toast orderdetails-style columns, including split checks and refunds. synthetic.' },
    { href: 'demo/harbor-table-synthetic-saturdays.csv', label: 'saturday nights only',
      detail: 'the 16 busiest services, where the room was full most nights. synthetic.' },
    { href: 'demo/harbor-table-synthetic-messy-export.csv', label: 'messy export · 5 weeks',
      detail: 'mixed date formats, currency symbols and missing close times, to show the import checks. synthetic.' },
    { href: 'demo/table-mix-profile-synthetic.csv', label: '12-table mix profile · 10 weeks',
      detail: 'four 2-tops, six 4-tops, two 6-tops (44 seats); 52/32/16% party mix; ~67-min checks. illustrative parameters, not cornell data. synthetic.' },
  ],
};

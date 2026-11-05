import { describe, expect, it } from 'vitest';
import { getLandingContent, loadSample, loadStressDemo, SATURDAY_STRESS_PRESET } from '../../src/api';

describe('landing content', () => {
  const c = getLandingContent();
  const copy = [c.hero.tagline, c.hero.headline, c.hero.subhead, ...c.pillars.flatMap(p => [p.title, p.summary]),
    ...c.guarantees, ...c.presets.flatMap(p => [p.label, p.detail])];

  it('is all lowercase', () => {
    for (const s of copy) expect(s).toBe(s.toLowerCase());
  });
  it('makes no overclaims and uses no internal jargon', () => {
    const all = copy.join(' ');
    expect(all).not.toMatch(/\bprove|proven|optimi[sz]e|hallucinat|guarantee[sd]? (results|savings)|rush radar|floor plan lab/);
    expect(c.pillars.find(p => p.id === 'demand')!.summary).toMatch(/context/);
  });
  it('preset hooks point at real loaders and match the stress multiplier', () => {
    const loaders = { loadSample, loadStressDemo };
    for (const p of c.presets) expect(typeof loaders[p.loader]).toBe('function');
    expect(c.presets.find(p => p.id === 'stress')!.label).toContain(`${SATURDAY_STRESS_PRESET.latentDemandMultiplier}×`);
  });
});

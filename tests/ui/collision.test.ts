import { describe, expect, it } from 'vitest';
import { resolveCollision } from '../../src/ui/screens/FloorPlanScreen';
import { harborCombinableLayout, harborCurrentLayout } from '../../src/scenarios/presets';

const box = (x: number, y: number, w = 70, h = 70) => ({ x, y, w, h });
const clear = (a: ReturnType<typeof box>, b: ReturnType<typeof box>, gap: number) =>
  a.x >= b.x + b.w + gap || a.x + a.w + gap <= b.x || a.y >= b.y + b.h + gap || a.y + a.h + gap <= b.y;

describe('floor plan drag collision', () => {
  it('leaves a free spot alone', () => {
    expect(resolveCollision(box(0, 0), [box(300, 300)])).toEqual({ x: 0, y: 0 });
  });

  it('pushes a table dropped onto a neighbour out to the 15px clearance edge', () => {
    const other = box(200, 200);
    const out = resolveCollision(box(185, 210), [other])!;
    expect(out).toEqual({ x: 115, y: 210 }); // shallowest exit: slide left
    expect(clear({ ...box(0, 0), ...out }, other, 15)).toBe(true);
  });

  it('lets combinable partners touch but never overlap', () => {
    expect(resolveCollision(box(130, 0), [{ ...box(200, 0), gap: 0 }])).toEqual({ x: 130, y: 0 });
    expect(resolveCollision(box(150, 0), [{ ...box(200, 0), gap: 0 }])).toEqual({ x: 130, y: 0 });
  });

  it('never returns an overlapping position for any drop point on the preset rooms', () => {
    for (const layout of [harborCurrentLayout(), harborCombinableLayout()]) {
      const [moving, ...others] = layout.tables;
      for (let x = 0; x <= 800 - moving.w; x += 10) for (let y = 0; y <= 500 - moving.h; y += 10) {
        const out = resolveCollision({ x, y, w: moving.w, h: moving.h }, others);
        if (out) for (const o of others) expect(clear({ ...out, w: moving.w, h: moving.h }, o, 15)).toBe(true);
      }
    }
  });
});

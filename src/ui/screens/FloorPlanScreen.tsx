import { useRef, useState } from 'react';
import type { Layout, TableDef } from '../../domain/types';
import { seatsOf } from '../../api';
import { NextStep } from '../components/NextStep';
import { useAppStore } from '../store/useAppStore';

type EditingTarget = 'current' | 'suggested' | 'custom';
const TAB_LABEL: Record<EditingTarget, string> = { current: 'layout a: current', suggested: 'layout b: suggested combinable', custom: 'layout c: build your own' };
const CANVAS_W = 800;
const CANVAS_H = 500;
const SNAP = 10;

function sizeForCapacity(capacity: number): { w: number; h: number } {
  if (capacity <= 2) return { w: 50, h: 50 };
  if (capacity <= 4) return { w: 70, h: 70 };
  if (capacity <= 6) return { w: 100, h: 70 };
  return { w: 130, h: 70 };
}
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const topLabel = (cap: number) => `${cap}-top`;
const CLEARANCE = 15;

type Box = { x: number; y: number; w: number; h: number; gap?: number };
const hits = (a: Box, b: Box, fallback: number) => {
  const gap = b.gap ?? fallback;
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
};

/**
 * Pushes a dragged table out of every neighbour's clearance box along the shallowest axis, so it slides
 * along edges instead of passing through. A box's own `gap` overrides the clearance (combinable partners may touch). Returns null when no clear spot exists near the pointer.
 */
export function resolveCollision(cand: Box, others: Box[], bounds = { w: CANVAS_W, h: CANVAS_H }, gap = CLEARANCE): { x: number; y: number } | null {
  let { x, y } = cand;
  for (let pass = 0; pass < 4; pass++) {
    const o = others.find((b) => hits({ ...cand, x, y }, b, gap));
    if (!o) return { x, y };
    const g = o.gap ?? gap;
    const pushLeft = o.x - g - cand.w - x, pushRight = o.x + o.w + g - x;
    const pushUp = o.y - g - cand.h - y, pushDown = o.y + o.h + g - y;
    const dx = Math.abs(pushLeft) < Math.abs(pushRight) ? pushLeft : pushRight;
    const dy = Math.abs(pushUp) < Math.abs(pushDown) ? pushUp : pushDown;
    if (Math.abs(dx) < Math.abs(dy)) x = clamp(x + dx, 0, bounds.w - cand.w);
    else y = clamp(y + dy, 0, bounds.h - cand.h);
  }
  return others.some((b) => hits({ ...cand, x, y }, b, gap)) ? null : { x, y };
}

export function FloorPlanScreen() {
  const currentLayout = useAppStore((s) => s.currentLayout);
  const suggestedLayout = useAppStore((s) => s.suggestedLayout);
  const customLayout = useAppStore((s) => s.customLayout);
  const compareTarget = useAppStore((s) => s.compareTarget);
  const setCompareTarget = useAppStore((s) => s.setCompareTarget);
  const reconstruction = useAppStore((s) => s.reconstruction);
  const updateCurrentLayout = useAppStore((s) => s.updateCurrentLayout);
  const updateCustomLayout = useAppStore((s) => s.updateCustomLayout);
  const startCustomFrom = useAppStore((s) => s.startCustomFrom);
  const setScreen = useAppStore((s) => s.setScreen);

  const [target, setTarget] = useState<EditingTarget>(compareTarget);
  // A is the room as it is today: locked so it stays a fair baseline, unless the owner unlocks it to match their real floor.
  const [unlockA, setUnlockA] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); // up to 2 table ids
  // While dragging, the moving table's position lives here; the store is written once on release.
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const layoutOf = (k: EditingTarget) => (k === 'current' ? currentLayout : k === 'suggested' ? suggestedLayout : customLayout);
  const layout: Layout = layoutOf(target);
  const locked = target === 'suggested' || (target === 'current' && !unlockA);
  const setLayout = (next: Layout) => {
    if (target === 'current' && unlockA) updateCurrentLayout(next);
    else if (target === 'custom') updateCustomLayout(next);
  };
  const pick = (k: EditingTarget) => { setTarget(k); setSelected([]); };
  const nameOf = (id: string) => layout.tables.find((t) => t.id === id)?.name ?? id;
  const pos = (t: TableDef) => (drag?.id === t.id ? { x: drag.x, y: drag.y } : { x: t.x, y: t.y });

  const toSvg = (e: React.PointerEvent) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const toggleSelect = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)));

  const onTableDown = (e: React.PointerEvent, t: TableDef) => {
    e.stopPropagation();
    if (locked) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e);
    setDrag({ id: t.id, dx: p.x - t.x, dy: p.y - t.y, x: t.x, y: t.y, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const t = layout.tables.find((x) => x.id === drag.id);
    if (!t) return;
    const p = toSvg(e);
    const free = resolveCollision(
      { x: clamp(snap(p.x - drag.dx), 0, CANVAS_W - t.w), y: clamp(snap(p.y - drag.dy), 0, CANVAS_H - t.h), w: t.w, h: t.h },
      layout.tables.filter((o) => o.id !== t.id).map((o) => ({
        ...o, gap: layout.joins.some((j) => (j.a === t.id && j.b === o.id) || (j.b === t.id && j.a === o.id)) ? 0 : undefined,
      })),
    );
    if (free && (free.x !== drag.x || free.y !== drag.y)) setDrag({ ...drag, x: free.x, y: free.y, moved: true });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.moved) {
      setLayout({ ...layout, tables: layout.tables.map((t) => (t.id === drag.id ? { ...t, x: drag.x, y: drag.y } : t)) });
    } else {
      toggleSelect(drag.id); // a press without movement is a click
    }
    setDrag(null);
  };

  const pair = selected.length === 2 ? selected : null;
  const pairJoin = pair ? layout.joins.find((j) => (j.a === pair[0] && j.b === pair[1]) || (j.a === pair[1] && j.b === pair[0])) : undefined;
  const pairCapacity = pair ? pair.reduce((s, id) => s + (layout.tables.find((t) => t.id === id)?.capacity ?? 0), 0) : 0;
  const single = selected.length === 1 ? layout.tables.find((t) => t.id === selected[0]) ?? null : null;

  const combineOrSplit = () => {
    if (!pair) return;
    setLayout({
      ...layout,
      joins: pairJoin ? layout.joins.filter((j) => j !== pairJoin) : [...layout.joins, { a: pair[0], b: pair[1], joinedCapacity: pairCapacity }],
    });
    setSelected([]);
  };

  const addTable = (capacity: 2 | 4 | 6) => {
    let n = 1;
    while (layout.tables.some((t) => t.id === `t${n}` || t.name === `T${n}`)) n++;
    const { w, h } = sizeForCapacity(capacity);
    // drop it in the first free grid slot from the bottom-left so it never lands on top of another table
    let x = 20, y = CANVAS_H - h - 20;
    const overlaps = (ax: number, ay: number) => layout.tables.some((t) => hits({ x: ax, y: ay, w, h }, t, CLEARANCE));
    while (overlaps(x, y) && x < CANVAS_W - w) x += 20;
    const table: TableDef = { id: `t${n}`, name: `T${n}`, capacity, x, y, w, h, shape: capacity === 2 ? 'round' : 'rect' };
    setLayout({ ...layout, tables: [...layout.tables, table] });
    setSelected([table.id]);
  };

  const updateSingle = (patch: Partial<TableDef>) => {
    if (!single) return;
    setLayout({
      ...layout,
      tables: layout.tables.map((t) => (t.id !== single.id ? t : { ...t, ...patch, ...(patch.capacity ? sizeForCapacity(patch.capacity) : {}) })),
    });
  };
  const deleteSingle = () => {
    if (!single) return;
    setLayout({ ...layout, tables: layout.tables.filter((t) => t.id !== single.id), joins: layout.joins.filter((j) => j.a !== single.id && j.b !== single.id) });
    setSelected([]);
  };

  const maxObservedOpenGuests = reconstruction ? Math.max(0, ...reconstruction.nights.map((n) => n.peakOpenCheckGuests)) : 0;
  const seats = seatsOf(layout);

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">test table layouts before service</h1>
          <p className="screen-subtitle">drag tables to move them. click two tables to combine them for bigger parties.</p>
        </div>
      </div>

      {maxObservedOpenGuests > seats && (
        <div className="notice">
          peak guests on open checks ({maxObservedOpenGuests}) is more than this layout's {seats} seats. check the layout or the export.
        </div>
      )}

      <div className="panel floor-toolbar">
        <div className="segmented" role="tablist" aria-label="layout selector">
          {(['current', 'suggested', 'custom'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={target === k} data-testid={`layout-tab-${k}`}
              className={`segmented-btn ${target === k ? 'active' : ''}`} onClick={() => pick(k)}>
              {TAB_LABEL[k]}{k === 'custom' ? '' : ' (locked)'} · {seatsOf(layoutOf(k))} seats
            </button>
          ))}
        </div>
        <div className="floor-toolbar-actions">
          {!locked && (
            <>
              <button type="button" className="btn btn-sm" onClick={() => addTable(2)}>+ 2-top</button>
              <button type="button" className="btn btn-sm" onClick={() => addTable(4)}>+ 4-top</button>
              <button type="button" className="btn btn-sm" onClick={() => addTable(6)}>+ 6-top</button>
            </>
          )}
          {target === 'custom' && (
            <>
              <button type="button" className="btn btn-sm" data-testid="custom-from-a" onClick={() => { startCustomFrom('current'); setSelected([]); }}>restart c from a</button>
              <button type="button" className="btn btn-sm" data-testid="custom-from-b" onClick={() => { startCustomFrom('suggested'); setSelected([]); }}>restart c from b</button>
            </>
          )}
        </div>
      </div>

      <div className="compare-target" data-testid="compare-target">
        <span>simulate layout a against:</span>
        <div className="segmented">
          {(['suggested', 'custom'] as const).map((k) => (
            <button key={k} type="button" className={`segmented-btn ${compareTarget === k ? 'active' : ''}`} data-testid={`compare-${k}`}
              onClick={() => setCompareTarget(k)}>
              {k === 'suggested' ? 'b · suggested combinable' : 'c · your custom layout'}
            </button>
          ))}
        </div>
        <span className="panel-meta">editing layout c switches the comparison to c.</span>
      </div>

      <div className="grid-sidebar-right">
        <section className="panel" style={{ padding: 14 }}>
          <div className="panel-header" style={{ marginBottom: 10 }}>
            <h2 className="panel-title">
              {layout.name.toLowerCase()}
              {locked && <span className="lock-badge" data-testid="lock-badge">locked benchmark</span>}
            </h2>
            <span className="panel-meta">{layout.tables.length} tables · {seats} seats · {layout.joins.length} combinable pairs</span>
          </div>
          <div className="floor-canvas-wrap" id="floor-canvas">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className={`floor-svg ${drag?.moved ? 'is-dragging' : ''} ${locked ? 'is-locked' : ''}`}
              data-testid="floor-plan-svg"
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              onClick={(e) => { if (e.target === e.currentTarget) setSelected([]); }}
            >
              <defs>
                <pattern id="draftGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="rgba(255, 255, 255, 0.1)" />
                </pattern>
              </defs>
              <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="url(#draftGrid)" pointerEvents="none" />

              {layout.joins.map((j) => {
                const a = layout.tables.find((t) => t.id === j.a);
                const b = layout.tables.find((t) => t.id === j.b);
                if (!a || !b) return null;
                const pa = pos(a), pb = pos(b);
                const x1 = pa.x + a.w / 2, y1 = pa.y + a.h / 2, x2 = pb.x + b.w / 2, y2 = pb.y + b.h / 2;
                const label = `${a.name} + ${b.name} → ${topLabel(j.joinedCapacity)}`;
                const bw = label.length * 6.4 + 14;
                const by = Math.max(2, Math.min(pa.y, pb.y) - 24);
                return (
                  <g key={`${j.a}-${j.b}`} className="join-bridge" pointerEvents="none">
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <rect x={(x1 + x2) / 2 - bw / 2} y={by} width={bw} height={18} rx={9} />
                    <text x={(x1 + x2) / 2} y={by + 12.5} textAnchor="middle">{label}</text>
                  </g>
                );
              })}

              {layout.tables.map((t) => {
                const p = pos(t);
                const isSel = selected.includes(t.id);
                const cx = p.x + t.w / 2, cy = p.y + t.h / 2;
                return (
                  <g key={t.id} className={`floor-table ${isSel ? 'is-selected' : ''} ${drag?.id === t.id ? 'is-grabbed' : ''}`}
                    data-testid={`table-${t.id}`} onPointerDown={(e) => onTableDown(e, t)}>
                    <title>{`${t.name} · ${topLabel(t.capacity)} · drag to move, click to select`}</title>
                    {t.shape === 'round'
                      ? <circle cx={cx} cy={cy} r={Math.min(t.w, t.h) / 2} />
                      : <rect x={p.x} y={p.y} width={t.w} height={t.h} rx={6} />}
                    <text x={cx} y={cy - 2} textAnchor="middle" className="floor-table-name">{t.name}</text>
                    <text x={cx} y={cy + 12} textAnchor="middle" className="floor-table-sub">{topLabel(t.capacity)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="panel" data-testid="table-inspector">
            {locked ? (
              <>
                <h2 className="panel-title">{target === 'current' ? 'your room today' : 'runway suggestion'}</h2>
                <p className="card-copy">
                  {target === 'current'
                    ? 'layout a is the baseline every alternative is measured against, so it is locked. unlock it only to make it match your real floor.'
                    : 'layout b keeps the same 44 seats but swaps four of the fixed four-tops for eight two-tops that push together in pairs. it is locked so it stays a fixed benchmark.'}
                </p>
                {target === 'current'
                  ? <button type="button" className="btn btn-sm" data-testid="unlock-a" onClick={() => setUnlockA(true)}>edit my current room</button>
                  : <button type="button" className="btn btn-sm" onClick={() => { startCustomFrom('suggested'); pick('custom'); }}>copy into layout c to edit</button>}
              </>
            ) : pair ? (
              <>
                <h2 className="panel-title">{nameOf(pair[0])} + {nameOf(pair[1])}</h2>
                <p className="card-copy">
                  {pairJoin
                    ? `these tables can be pushed together into a ${topLabel(pairJoin.joinedCapacity)}.`
                    : `push these together for parties up to ${pairCapacity}. the simulation only joins them when no single table fits.`}
                </p>
                <button type="button" className="btn btn-primary" data-testid="combine-btn" style={{ width: '100%' }} onClick={combineOrSplit}>
                  {pairJoin ? 'split these tables' : `combine tables into ${topLabel(pairCapacity)}`}
                </button>
              </>
            ) : single ? (
              <>
                <div className="panel-header">
                  <h2 className="panel-title">{single.name} · {topLabel(single.capacity)}</h2>
                  <button type="button" className="btn btn-sm btn-danger" onClick={deleteSingle}>delete</button>
                </div>
                <div className="field-label" style={{ marginBottom: 6 }}><span>seats</span></div>
                <div className="segmented" style={{ marginBottom: 12 }}>
                  {[2, 4, 6, 8].map((c) => (
                    <button key={c} type="button" className={`segmented-btn ${single.capacity === c ? 'active' : ''}`} onClick={() => updateSingle({ capacity: c })}>
                      {c}
                    </button>
                  ))}
                </div>
                <div className="field-label" style={{ marginBottom: 6 }}><span>shape</span></div>
                <div className="segmented" style={{ marginBottom: 12 }}>
                  {(['rect', 'round'] as const).map((sh) => (
                    <button key={sh} type="button" className={`segmented-btn ${single.shape === sh ? 'active' : ''}`} onClick={() => updateSingle({ shape: sh })}>
                      {sh === 'rect' ? 'square' : 'round'}
                    </button>
                  ))}
                </div>
                <p className="panel-meta">click a second table to combine them.</p>
              </>
            ) : (
              <>
                <h2 className="panel-title">how to edit</h2>
                <ul className="howto">
                  <li><strong>drag</strong> a table to move it</li>
                  <li><strong>click</strong> a table to change its seats</li>
                  <li><strong>click two tables</strong> to combine them</li>
                </ul>
              </>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">combinable table links ({layout.joins.length})</h2>
            {layout.joins.length === 0 ? (
              <p className="panel-meta">none yet. click two tables, then "combine".</p>
            ) : (
              <ul className="join-chips">
                {layout.joins.map((j) => (
                  <li key={`${j.a}-${j.b}`}>
                    <span>{nameOf(j.a)} + {nameOf(j.b)} → {topLabel(j.joinedCapacity)}</span>
                    <button type="button" className="link-btn" aria-label={`split ${nameOf(j.a)} and ${nameOf(j.b)}`}
                      onClick={() => setLayout({ ...layout, joins: layout.joins.filter((x) => x !== j) })}>
                      split
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <NextStep label="proceed to scenarios & simulation →" testId="to-scenarios-btn" onClick={() => setScreen('scenarios')} />
    </div>
  );
}

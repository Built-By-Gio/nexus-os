import React, { useEffect, useMemo, useRef } from "react";
import { animate, stagger, steps, svg } from "animejs";
import { calm } from "./motion.js";

export function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6],
  [3, 11, 1, 9], [15, 7, 13, 5],
];

export function ditherPath(w, h, level) {
  let d = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (level(x / w, y / h) * 16 > BAYER[y % 4][x % 4] + 0.5) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

const SHAPES = {
  orb: (x, y) => { const dx = x - 0.5, dy = y - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2; return r > 1 ? 0 : (1 - r) * 0.65 + Math.max(0, 0.35 - Math.hypot(x - 0.36, y - 0.34) * 1.1); },
  fade: (x, y) => (1 - x) * (0.55 + 0.45 * (1 - y)),
  band: (x, y) => Math.max(0, Math.sin(y * Math.PI) * (1 - x * 0.8)),
};

export function Dither({ shape = "orb", w = 64, h = 64, className = "" }) {
  const d = useMemo(() => ditherPath(w, h, SHAPES[shape] || SHAPES.orb), [shape, w, h]);
  return (
    <svg className={`nx-dither ${className}`} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function traceRoutes(seed, count, size = 1000) {
  const rnd = seeded(seed);
  const routes = [];
  for (let i = 0; i < count; i++) {
    const side = Math.floor(rnd() * 4);
    const along = 60 + rnd() * (size - 120);
    let x = side === 0 ? along : side === 1 ? size : side === 2 ? along : 0;
    let y = side === 0 ? 0 : side === 1 ? along : side === 2 ? size : along;
    const ix = side === 1 ? -1 : side === 3 ? 1 : 0;
    const iy = side === 0 ? 1 : side === 2 ? -1 : 0;
    const pts = [[x, y]];
    const legs = 2 + Math.floor(rnd() * 3);
    const vias = [];
    for (let l = 0; l < legs; l++) {
      const run = 60 + rnd() * 200;
      if (l % 2 === 0) { x += ix * run; y += iy * run; }
      else {
        const dir = rnd() < 0.5 ? -1 : 1;
        const diag = 30 + rnd() * 90;
        x += (iy ? dir : ix) * diag; y += (ix ? dir : iy) * diag;
      }
      x = Math.max(8, Math.min(size - 8, x)); y = Math.max(8, Math.min(size - 8, y));
      pts.push([x, y]);
      if (rnd() < 0.35) vias.push([x, y]);
    }
    routes.push({
      d: "M" + pts.map((p) => p.map((v) => v.toFixed(0)).join(" ")).join("L"),
      end: pts[pts.length - 1], vias,
    });
  }
  return routes;
}

export function Traces({ seed = "nx", count = 14, className = "" }) {
  const routes = useMemo(() => traceRoutes(seed, count), [seed, count]);
  return (
    <svg className={`nx-traces ${className}`} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {routes.map((r, i) => (
        <g key={i}>
          <path className="nx-trace" d={r.d} />
          {r.vias.map(([x, y], j) => <circle key={j} className="nx-via" cx={x} cy={y} r="4" />)}
          <rect className="nx-pad" x={r.end[0] - 7} y={r.end[1] - 7} width="14" height="14" />
        </g>
      ))}
    </svg>
  );
}

export function NeuralNet({ seed = "nx", layers = [3, 5, 5, 4], className = "" }) {
  const net = useMemo(() => {
    const rnd = seeded(seed + "net");
    const W = 400, H = 300;
    const cols = layers.map((n, li) => Array.from({ length: n }, (_, i) => ({
      x: 30 + (li * (W - 60)) / (layers.length - 1),
      y: H / 2 + (i - (n - 1) / 2) * 52,
    })));
    const edges = [];
    for (let li = 0; li < cols.length - 1; li++) {
      for (const a of cols[li]) for (const b of cols[li + 1]) {
        if (rnd() < 0.72) edges.push({ a, b, tone: rnd() < 0.3 ? "hot" : rnd() < 0.6 ? "cool" : "dim" });
      }
    }
    return { W, H, nodes: cols.flat(), edges };
  }, [seed, layers]);
  return (
    <svg className={`nx-net ${className}`} viewBox={`0 0 ${net.W} ${net.H}`} aria-hidden="true">
      {net.edges.map((e, i) => (
        <line key={i} className={`nx-net-edge nx-net-${e.tone}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} />
      ))}
      {net.nodes.map((n, i) => <circle key={i} className="nx-net-node" cx={n.x} cy={n.y} r="10" />)}
    </svg>
  );
}

const PARTS = ["R", "C", "U", "Q", "L", "D", "J"];

export function silkLabels(seed, n) {
  const rnd = seeded(seed + "silk");
  return Array.from({ length: n }, () => PARTS[Math.floor(rnd() * PARTS.length)] + (1 + Math.floor(rnd() * 140)));
}

export function TerminalTag({ lines, className = "" }) {
  return (
    <div className={`nx-ttag ${className}`}>
      {lines.map((l, i) => <p key={i}>&gt; {l}</p>)}
    </div>
  );
}

const LAYOUTS = [
  { orb: [4, 62], silk: [[30, 34], [72, 64], [12, 46]] },
  { orb: [70, 30], silk: [[40, 90], [8, 52], [80, 44]] },
  { orb: [8, 40], silk: [[50, 30], [30, 70], [86, 36]] },
  { orb: [66, 64], silk: [[40, 50], [6, 88], [76, 90]] },
];

const MOODS = ["ONLINE", "LISTENING", "AWARE", "READY", "WATCHING", "THINKING"];

export function Collage({ mod, index, level }) {
  const ref = useRef(null);
  const seed = mod.id;
  const L = LAYOUTS[[...seed].reduce((s, c) => s + c.charCodeAt(0), 0) % LAYOUTS.length];
  const loud = level === "loud";
  const silk = useMemo(() => silkLabels(seed, 3), [seed]);
  const moods = useMemo(() => {
    const rnd = seeded(seed + "mood");
    return [0, 1, 2].map(() => MOODS[Math.floor(rnd() * MOODS.length)]).filter((m, i, a) => a.indexOf(m) === i);
  }, [seed]);

  useEffect(() => {
    const root = ref.current;
    if (!root || calm()) return;
    const anims = [];
    const traces = root.querySelectorAll(".nx-trace");
    if (traces.length) {
      anims.push(animate(svg.createDrawable(traces), { draw: ["0 0", "0 1"], duration: 1100, ease: "inOutQuad", delay: stagger(40) }));
    }
    const pop = root.querySelectorAll(".nx-pad,.nx-via,.nx-net-node");
    if (pop.length) anims.push(animate(pop, { opacity: [0, 1], duration: 200, ease: steps(2), delay: stagger(18, { start: 500 }) }));
    const edges = root.querySelectorAll(".nx-net-edge");
    if (edges.length) anims.push(animate(edges, { opacity: [0, 1], duration: 300, delay: stagger(6, { start: 400, from: "random" }) }));
    const blocks = root.querySelectorAll(".nx-dither,.nx-ttag,.nx-silk,.nx-vtitle");
    if (blocks.length) anims.push(animate(blocks, { opacity: [0, 1], duration: 360, ease: steps(4), delay: stagger(90, { start: 200 }) }));
    return () => anims.forEach((a) => a.revert());
  }, [seed, level]);

  if (level === "off") return null;
  const num = String(index + 1).padStart(2, "0");
  const pos = ([l, t]) => ({ left: `${l}%`, top: `${t}%` });

  return (
    <div ref={ref} className={`nx-collage nx-collage-${level}`} aria-hidden="true">
      <Traces seed={seed} count={loud ? 16 : 7} className="nx-col-traces" />
      {loud && <NeuralNet seed={seed} className="nx-col-net" />}
      {loud && <div className="nx-col-orb" style={pos(L.orb)}><Dither shape="orb" /></div>}
      {loud && <TerminalTag className="nx-col-tag" lines={moods} />}
      {silk.map((s, i) => <span key={s + i} className="nx-silk" style={pos(L.silk[i])}>{s}</span>)}
      <div className="nx-vtitle">U{num} · {mod.label.toUpperCase()}</div>
    </div>
  );
}

export function Ticker({ items }) {
  const run = items.map((s, i) => <span key={i}>{s}<b>///</b></span>);
  return (
    <div className="nx-ticker" aria-hidden="true">
      <i className="nx-ticker-prompt">&gt;</i>
      <div className="nx-ticker-track">{run}{run}{run}{run}</div>
    </div>
  );
}

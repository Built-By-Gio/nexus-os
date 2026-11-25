import { animate, stagger, steps } from "animejs";

export function calm() {
  return !!document.querySelector(".nx-still")
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const PANELS = [
  ".nx-w", ".nx-panel", ".nx-out", ".nx-set-group", ".nx-nc", ".nx-empty", ".nx-twin-empty",
  ".nx-scan-table", ".nx-dev-table", ".nx-ports", ".nx-hops", ".nx-lat-graph", ".nx-lat-stats",
  ".nx-asst-open", ".nx-term-wrap", ".nx-tabs", ".nx-tool-blurb", ".nx-agent > *",
].join(",");

const GLYPHS = "█▓▒░<>/\\_#01";

let observer = null;
let waiting = [];

function settle() {
  observer?.disconnect();
  observer = null;
  waiting.forEach((el) => { el.style.opacity = ""; el.style.transform = ""; });
  waiting = [];
}

const open = (targets, delay) => animate(targets, {
  opacity: [0, 1],
  scaleY: [0.04, 1],
  duration: 340,
  ease: "outQuart",
  delay,
  onComplete: (a) => a.revert(),
});

function decode(chars) {
  const text = [...chars].map((c) => c.textContent);
  const p = { v: 0 };
  animate(p, {
    v: 1, duration: 560, ease: "linear",
    onUpdate: () => chars.forEach((c, i) => {
      c.textContent = p.v * chars.length > i || text[i] === " " ? text[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }),
    onComplete: () => chars.forEach((c, i) => { c.textContent = text[i]; }),
  });
}

export function enterView(scope, main) {
  settle();
  if (!scope || !main || calm()) return;

  const chars = [...document.querySelectorAll(".nx-topbar .nx-ch")];
  if (chars.length) decode(chars);

  const items = [...scope.querySelectorAll(PANELS)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const fold = main.getBoundingClientRect().bottom;
  const now = items.filter((el) => el.getBoundingClientRect().top < fold);
  const later = items.filter((el) => !now.includes(el));
  if (now.length) open(now, stagger(40, { start: 90 }));
  if (!later.length) return;

  later.forEach((el) => { el.style.opacity = "0"; });
  waiting = later;
  observer = new IntersectionObserver((entries) => {
    const hits = entries.filter((e) => e.isIntersecting).map((e) => e.target);
    if (!hits.length) return;
    hits.forEach((el) => { observer.unobserve(el); el.style.opacity = ""; });
    waiting = waiting.filter((el) => !hits.includes(el));
    open(hits, stagger(50));
  }, { root: main, rootMargin: "0px 0px -8% 0px" });
  later.forEach((el) => observer.observe(el));
}

export function wipe(el) {
  if (!el || calm()) return;
  animate(el, { opacity: [1, 0], duration: 380, ease: steps(5), onComplete: (a) => a.revert() });
}

const SPARK_TARGETS = ".nx-nav, .nx-cta, .nx-asst-send, .nx-btn-on, .nx-chip-on, .nx-tab";

export function sparkOnClick(e) {
  const btn = e.target.closest?.(SPARK_TARGETS);
  const root = btn?.closest(".nx-root");
  if (!btn || !root || calm()) return;
  for (let i = 0; i < 7; i++) {
    const s = document.createElement("i");
    s.className = "nx-spark-pop";
    s.style.left = `${e.clientX}px`;
    s.style.top = `${e.clientY}px`;
    root.appendChild(s);
    const ang = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 26;
    animate(s, {
      x: Math.round(Math.cos(ang) * dist / 4) * 4, y: Math.round(Math.sin(ang) * dist / 4) * 4,
      opacity: [1, 0], duration: 420, ease: steps(4), onComplete: () => s.remove(),
    });
  }
}

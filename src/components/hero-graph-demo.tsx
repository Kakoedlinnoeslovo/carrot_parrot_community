"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

const NODES = [
  { id: "a", label: "Prompt", sub: "text in", x: 72, y: 118 },
  { id: "b", label: "Image", sub: "fal model", x: 248, y: 52 },
  { id: "c", label: "Refine", sub: "edit pass", x: 248, y: 186 },
  { id: "d", label: "Publish", sub: "share", x: 428, y: 118 },
] as const;

const EDGES: [string, string][] = [
  ["a", "b"],
  ["a", "c"],
  ["b", "d"],
  ["c", "d"],
];

function nodeById(id: string) {
  const n = NODES.find((x) => x.id === id);
  if (!n) throw new Error(`missing node ${id}`);
  return n;
}

export function HeroGraphDemo() {
  const reducedMotion = usePrefersReducedMotion();
  const motionClass = reducedMotion ? "" : "hero-graph-demo--motion";

  return (
    <div
      className={`hero-graph-demo ${motionClass} relative mx-auto w-full max-w-xl`}
      aria-hidden
    >
      <div className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-orange-500/25 via-violet-500/10 to-amber-400/15 blur-2xl" />
      <div
        className="relative overflow-hidden rounded-2xl border border-white/12 bg-zinc-900/45 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        style={{ perspective: "1400px" }}
      >
        <div
          className="relative px-4 py-5 sm:px-6 sm:py-6"
          style={{
            transform: "rotateX(6deg) rotateY(-4deg)",
            transformStyle: "preserve-3d",
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {!reducedMotion && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-50" />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">
                Live canvas preview
              </span>
            </div>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
              fal pipeline
            </span>
          </div>

          <svg
            viewBox="0 0 520 260"
            className="h-auto w-full text-orange-400/90"
            fill="none"
          >
            <defs>
              <linearGradient id="hero-edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(251 146 60)" stopOpacity="0.15" />
                <stop offset="50%" stopColor="rgb(251 146 60)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="rgb(251 146 60)" stopOpacity="0.15" />
              </linearGradient>
            </defs>

            {EDGES.map(([from, to], i) => {
              const a = nodeById(from);
              const b = nodeById(to);
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2 + (i % 2 === 0 ? -14 : 14);
              const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
              return (
                <path
                  key={`${from}-${to}`}
                  d={d}
                  stroke="url(#hero-edge-grad)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className={reducedMotion ? "opacity-80" : "hero-graph-edge"}
                />
              );
            })}

            {NODES.map((n, i) => (
              <g key={n.id} transform={`translate(${n.x - 48} ${n.y - 32})`}>
                <g
                  className={reducedMotion ? "" : "hero-graph-node"}
                  style={
                    reducedMotion
                      ? undefined
                      : ({ animationDelay: `${i * 0.12}s` } satisfies CSSProperties)
                  }
                >
                  <rect
                    width={96}
                    height={64}
                    rx={14}
                    className="fill-zinc-800/90 stroke-white/15"
                    strokeWidth={1}
                  />
                  <text
                    x={48}
                    y={26}
                    textAnchor="middle"
                    className="fill-zinc-100 text-[11px] font-semibold"
                    style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
                  >
                    {n.label}
                  </text>
                  <text
                    x={48}
                    y={44}
                    textAnchor="middle"
                    className="fill-zinc-400 text-[9px]"
                    style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
                  >
                    {n.sub}
                  </text>
                </g>
              </g>
            ))}
          </svg>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500">
        Node outputs fan in and merge—the same idea as your Studio canvas.
      </p>
    </div>
  );
}

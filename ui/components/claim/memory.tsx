"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/format";
import { visibleFindings } from "@/lib/live";
import type { Claim } from "@/lib/types";
import type { DrawerTarget } from "../doc-drawer";
import { cx } from "../ui";

interface GNode {
  id: string;
  col: 0 | 1 | 2 | 3;
  label: string;
  sub?: string;
  tone: "doc" | "fact" | "for" | "against" | "flag" | "pay" | "part" | "decline";
  episode: number;
  doc?: string;
  finding?: string;
}

interface GEdge {
  a: string;
  b: string;
}

const COLS = ["Documents", "Facts", "Findings", "Claim lines"];
const ROW = 30;
const NODE_W = 210;

function build(claim: Claim, elapsed: number) {
  const eps = claim.episodes ?? [];
  const live = eps.length - 1;
  const upto = elapsed < 0 ? live - 1 : live;
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const docTitle = (id: string) => claim.documents.find((d) => d.id === id)?.title ?? id;

  const docEp = new Map<string, number>();
  eps.slice(0, upto + 1).forEach((e, i) => e.docs.forEach((d) => docEp.set(d, i)));
  for (const [d, i] of docEp) nodes.push({ id: `d:${d}`, col: 0, label: d, sub: docTitle(d), tone: "doc", episode: i, doc: d });

  const factsByDoc = new Map<string, string[]>();
  eps.slice(0, upto + 1).forEach((e, i) => {
    for (const a of e.agents) {
      if (a.kind !== "extractor" && a.kind !== "router") continue;
      a.steps.forEach((s, n) => {
        if (s.type !== "extract" || !s.cite || !docEp.has(s.cite.doc)) return;
        if (i === live && s.t > elapsed) return;
        const id = `f:${i}:${a.id}:${n}`;
        nodes.push({ id, col: 1, label: s.label, tone: "fact", episode: i, doc: s.cite.doc });
        edges.push({ a: `d:${s.cite.doc}`, b: id });
        factsByDoc.set(s.cite.doc, [...(factsByDoc.get(s.cite.doc) ?? []), id]);
      });
    }
  });

  for (const l of claim.lines) {
    const tone = l.outcome === "PAY" ? "pay" : l.outcome === "PAY_PARTIAL" ? "part" : "decline";
    nodes.push({ id: `l:${l.line}`, col: 3, label: `Line ${l.line} · ${l.description}`, sub: l.payable ? money(l.payable) : "£0.00", tone, episode: 0 });
  }

  for (const f of visibleFindings(claim, elapsed)) {
    const id = `g:${f.id}`;
    nodes.push({ id, col: 2, label: f.title, sub: f.id, tone: f.side, episode: f.episode ?? 0, finding: f.id });
    const docs = [...new Set(f.cites.map((c) => c.doc))].filter((d) => docEp.has(d));
    for (const d of docs) {
      const facts = factsByDoc.get(d);
      if (facts?.length) facts.forEach((fid) => edges.push({ a: fid, b: id }));
      else edges.push({ a: `d:${d}`, b: id });
    }
    f.lines?.forEach((ln) => edges.push({ a: id, b: `l:${ln}` }));
  }
  return { nodes, edges, upto };
}

const TONE: Record<GNode["tone"], string> = {
  doc: "border-line bg-white",
  fact: "border-[#d9d6ff] bg-primary-soft",
  for: "border-[#bfe8a8] bg-[#f1fbea]",
  against: "border-[#ffc7d6] bg-[#fff3f7]",
  flag: "border-[#f6dc8a] bg-[#fffaea]",
  pay: "border-line bg-white",
  part: "border-line bg-white",
  decline: "border-line bg-white",
};

const DOT: Partial<Record<GNode["tone"], string>> = {
  for: "bg-[#1ea672]",
  against: "bg-bad-ink",
  flag: "bg-[#e5a000]",
  pay: "bg-[#1ea672]",
  part: "bg-info-ink",
  decline: "bg-bad-ink",
};

export function MemoryTab({ claim, elapsed, openDoc, onFinding }: { claim: Claim; elapsed: number; openDoc: (t: DrawerTarget) => void; onFinding: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1100);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, edges, upto } = useMemo(() => build(claim, elapsed), [claim, elapsed]);
  const colX = [0, 0.31, 0.6, 1].map((f) => 20 + f * (w - 40 - NODE_W));
  const pos = new Map<string, { x: number; y: number }>();
  const height = Math.max(
    ...[0, 1, 2, 3].map((c) => {
      const col = nodes.filter((n) => n.col === c).sort((a, b) => a.episode - b.episode);
      col.forEach((n, i) => pos.set(n.id, { x: colX[c], y: 36 + i * ROW }));
      return 36 + col.length * ROW;
    }),
  );
  const near = new Set<string>();
  if (hover) {
    near.add(hover);
    edges.forEach((e) => {
      if (e.a === hover) near.add(e.b);
      if (e.b === hover) near.add(e.a);
    });
  }
  const added = nodes.filter((n) => n.episode === upto).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6 text-[13px]">
        <div>
          <b className="tabular-nums">{nodes.length}</b> <span className="text-muted">nodes</span>
        </div>
        <div>
          <b className="tabular-nums">{edges.length}</b> <span className="text-muted">edges</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#1a7f4b]">
          <span className="size-2 rounded-full bg-[#1ea672]" />
          {added} added in the latest run
        </div>
        <div className="ml-auto font-mono text-[12px] text-muted">cognee · dataset {claim.apiId}</div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-[#fbfcfd]">
        <div ref={ref} className="relative min-w-[980px]" style={{ height: height + 16 }}>
          {COLS.map((c, i) => (
            <div key={c} className="absolute top-3 text-[11px] font-semibold uppercase tracking-wide text-muted" style={{ left: colX[i] }}>
              {c}
            </div>
          ))}
          <svg className="pointer-events-none absolute inset-0" width="100%" height={height + 16}>
            {edges.map((e, i) => {
              const a = pos.get(e.a);
              const b = pos.get(e.b);
              if (!a || !b) return null;
              const x1 = a.x + NODE_W;
              const y1 = a.y + 12;
              const x2 = b.x;
              const y2 = b.y + 12;
              const mx = (x1 + x2) / 2;
              const on = hover && near.has(e.a) && near.has(e.b);
              return (
                <path
                  key={i}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={on ? "#635bff" : "#d5dbe3"}
                  strokeWidth={on ? 1.6 : 1}
                  opacity={hover && !on ? 0.25 : 1}
                />
              );
            })}
          </svg>
          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const isNew = n.episode === upto && n.col !== 3;
            const dim = hover && !near.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  if (n.doc && n.col === 0) openDoc({ doc: n.doc, quotes: [], title: n.sub ?? n.label });
                  else if (n.finding) onFinding(n.finding);
                }}
                className={cx(
                  "fade-in absolute flex h-6 items-center gap-1.5 rounded-md border px-2 text-left text-[11.5px] transition-opacity",
                  TONE[n.tone],
                  isNew && "ring-2 ring-[#1ea672]/40",
                  dim && "opacity-30",
                )}
                style={{ left: p.x, top: p.y, width: NODE_W }}
                title={n.sub ? `${n.label} · ${n.sub}` : n.label}
              >
                {DOT[n.tone] && <span className={cx("size-1.5 shrink-0 rounded-full", DOT[n.tone])} />}
                {n.col === 0 && <span className="shrink-0 font-mono text-[10.5px] font-semibold text-ink">{n.label}</span>}
                <span className="truncate text-ink-2">{n.col === 0 ? n.sub : n.label}</span>
                {n.col === 3 && <span className="ml-auto shrink-0 tabular-nums text-muted">{n.sub}</span>}
                {isNew && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-[#1ea672]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

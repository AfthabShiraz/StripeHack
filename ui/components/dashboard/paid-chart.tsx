"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DayStat } from "@/lib/data/history";
import { compactMoney, money, pct } from "@/lib/format";
import { Segmented } from "../ui";

interface Bucket {
  label: string;
  sub: string;
  agent: number;
  human: number;
  agentN: number;
  humanN: number;
}

function bucketize(days: DayStat[]): Bucket[] {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  if (days.length <= 100) {
    return days.map((d) => ({ label: fmt(d.date, { day: "numeric", month: "short" }), sub: fmt(d.date, { weekday: "short" }), agent: d.agentPaid, human: d.humanPaid, agentN: d.agentCount, humanN: d.humanCount }));
  }
  const out: Bucket[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const w = days.slice(i, i + 7);
    out.push({
      label: fmt(w[0].date, { day: "numeric", month: "short" }),
      sub: `Week of`,
      agent: w.reduce((n, d) => n + d.agentPaid, 0),
      human: w.reduce((n, d) => n + d.humanPaid, 0),
      agentN: w.reduce((n, d) => n + d.agentCount, 0),
      humanN: w.reduce((n, d) => n + d.humanCount, 0),
    });
  }
  return out;
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

export function PaidChart({ days }: { days: DayStat[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [mode, setMode] = useState<"Value" | "Claims">("Value");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const buckets = useMemo(() => bucketize(days), [days]);
  const val = (b: Bucket) => (mode === "Value" ? [b.agent, b.human] : [b.agentN, b.humanN]);
  const max = niceMax(Math.max(...buckets.map((b) => val(b)[0] + val(b)[1])));
  const H = 220;
  const padL = 52;
  const padB = 24;
  const plotW = Math.max(10, w - padL - 4);
  const plotH = H - padB - 8;
  const slot = plotW / buckets.length;
  const barW = Math.max(2, Math.min(22, slot * 0.68));
  const y = (v: number) => (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(buckets.length / Math.max(2, Math.floor(plotW / 70)));
  const fmtTick = (v: number) => (mode === "Value" ? compactMoney(v) : String(Math.round(v)));
  const hb = hover !== null ? buckets[hover] : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[12px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-agent" />
            Agent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-human" />
            Human
          </span>
        </div>
        <Segmented options={["Value", "Claims"] as const} value={mode} onChange={setMode} />
      </div>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w} y1={8 + plotH - y(t)} y2={8 + plotH - y(t)} stroke="#ebeef1" strokeWidth={1} />
              <text x={padL - 8} y={8 + plotH - y(t) + 4} textAnchor="end" className="fill-[#687385] text-[11px] tabular-nums">
                {fmtTick(t)}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const [a, h] = val(b);
            const x = padL + i * slot + (slot - barW) / 2;
            const ha = y(a);
            const hh = y(h);
            const gap = hh > 0 && ha > 0 ? 2 : 0;
            const r = Math.min(4, barW / 2);
            const dim = hover !== null && hover !== i;
            return (
              <g key={i} opacity={dim ? 0.45 : 1}>
                <rect x={x} y={8 + plotH - ha} width={barW} height={Math.max(0, ha)} fill="var(--agent)" rx={hh > 0 ? 1 : r} />
                {hh > 0 && <path d={`M${x},${8 + plotH - ha - gap} v${-(hh - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${hh - r} z`} fill="var(--human)" />}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-[#687385] text-[11px]">
                    {b.label}
                  </text>
                )}
                <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={padL} x2={w} y1={8 + plotH} y2={8 + plotH} stroke="#d5dbe3" />
        </svg>
        {hb && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-52 rounded-lg border border-line bg-white p-3 text-[12px] shadow-lg"
            style={{ left: Math.min(Math.max(0, padL + hover * slot + slot / 2 - 104), w - 208), transform: "translateY(-8px)" }}
          >
            <div className="mb-1.5 font-semibold text-ink">
              {hb.sub === "Week of" ? `Week of ${hb.label}` : `${hb.sub} ${hb.label}`}
            </div>
            <div className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-2"><span className="size-2 rounded-[2px] bg-agent" />Agent</span>
              <span className="tabular-nums">{money(hb.agent)} · {hb.agentN}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-2"><span className="size-2 rounded-[2px] bg-human" />Human</span>
              <span className="tabular-nums">{money(hb.human)} · {hb.humanN}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t border-line-2 pt-1.5 text-muted">
              <span>Agent share of value</span>
              <span className="tabular-nums text-ink">{pct(hb.agent / (hb.agent + hb.human || 1))}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

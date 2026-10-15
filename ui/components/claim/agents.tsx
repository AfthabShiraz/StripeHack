"use client";

import {
  ArrowRightLeft,
  BookMarked,
  Brain,
  CheckCircle2,
  Circle,
  CircleDashed,
  Database,
  FileSearch,
  Flag,
  GitBranch,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clock, duration, tokens } from "@/lib/format";
import { agentEnd, agentState, childrenOf } from "@/lib/live";
import { useStore } from "@/lib/store";
import type { Agent, Claim, StepType, TraceStep } from "@/lib/types";
import type { DrawerTarget } from "../doc-drawer";
import { Button, Clause, Pill, cx } from "../ui";

const KIND_LABEL: Record<Agent["kind"], string> = {
  orchestrator: "Orchestrator",
  intake: "Coverage",
  router: "Router",
  extractor: "Evidence",
  section: "Section",
  consistency: "Fraud",
  calculator: "Calculator",
  decision: "Decision",
  payment: "Payment",
};

function barColor(a: Agent) {
  if (a.kind === "orchestrator") return "bg-ink";
  if (a.kind === "extractor" || a.kind === "router") return "bg-[#9b94ff]";
  if (a.kind === "calculator") return "bg-[#687385]";
  if (a.kind === "payment") return "bg-[#1ea672]";
  return "bg-primary";
}

const STEP_ICON: Record<StepType, React.ReactNode> = {
  spawn: <GitBranch className="size-3.5" />,
  read: <FileSearch className="size-3.5" />,
  retrieve: <BookMarked className="size-3.5" />,
  extract: <Search className="size-3.5" />,
  check: <ShieldCheck className="size-3.5" />,
  finding: <Flag className="size-3.5" />,
  handoff: <ArrowRightLeft className="size-3.5" />,
  tool: <Wrench className="size-3.5" />,
  decision: <Brain className="size-3.5" />,
  memory: <Database className="size-3.5" />,
};

function StateIcon({ state }: { state: ReturnType<typeof agentState> }) {
  if (state === "done") return <CheckCircle2 className="size-3.5 text-[#1ea672]" />;
  if (state === "running") return <Loader2 className="size-3.5 animate-spin text-primary" />;
  return <CircleDashed className="size-3.5 text-faint" />;
}

function ResultPill({ r }: { r?: TraceStep["result"] }) {
  if (!r) return null;
  if (r === "pass") return <Pill tone="ok">Pass</Pill>;
  if (r === "fail") return <Pill tone="bad">Fail</Pill>;
  if (r === "warn") return <Pill tone="warn">Warn</Pill>;
  return <Pill tone="neutral">Info</Pill>;
}

function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const parts = text.split(/("(?:[^"\\]|\\.)*"(?:\s*:)?|\b-?\d+(?:\.\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g);
  return (
    <pre className="overflow-x-auto rounded-md bg-[#0a2540] p-3 font-mono text-[11.5px] leading-relaxed text-[#c1c9d2]">
      {parts.map((p, i) => {
        if (/^".*":$/.test(p.replace(/\s/g, ""))) return <span key={i} className="text-[#a5b4fc]">{p}</span>;
        if (p.startsWith('"')) return <span key={i} className="text-[#7ee0b5]">{p}</span>;
        if (/^-?\d/.test(p)) return <span key={i} className="text-[#ffb68a]">{p}</span>;
        if (p === "true" || p === "false" || p === "null") return <span key={i} className="text-[#ffb68a]">{p}</span>;
        return p;
      })}
    </pre>
  );
}

function Waterfall({ claim, elapsed, selected, onSelect }: { claim: Claim; elapsed: number; selected: string; onSelect: (id: string) => void }) {
  const total = claim.runLength;
  const rows = useMemo(() => childrenOf(claim), [claim]);
  const ticks = useMemo(() => {
    const step = total > 180000 ? 60000 : total > 90000 ? 30000 : 15000;
    const out: number[] = [];
    for (let t = 0; t <= total; t += step) out.push(t);
    return out;
  }, [total]);
  const nowPct = Math.min(100, (elapsed / total) * 100);
  const live = Number.isFinite(elapsed) && elapsed < total;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="grid grid-cols-[300px_minmax(0,1fr)] border-b border-line bg-canvas text-[11px] text-muted">
        <div className="px-3 py-2 font-semibold uppercase tracking-wide">Agent</div>
        <div className="relative mr-4 h-full">
          {ticks.map((t) => (
            <span key={t} className="absolute top-2 -translate-x-1/2 tabular-nums" style={{ left: `${(t / total) * 100}%` }}>
              {clock(t)}
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        {rows.map((a) => {
          const st = agentState(a, elapsed);
          const end = Math.min(elapsed, agentEnd(a));
          const left = (a.start / total) * 100;
          const width = st === "queued" ? 0 : Math.max(0.6, ((end - a.start) / total) * 100);
          const isSel = selected === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              className={cx(
                "grid h-9 w-full grid-cols-[300px_minmax(0,1fr)] items-center border-b border-line-2 text-left last:border-b-0",
                isSel ? "bg-primary-soft" : "hover:bg-canvas",
              )}
            >
              <div className={cx("flex min-w-0 items-center gap-2 px-3", a.parent && "pl-7")}>
                {a.parent && <span className="-ml-3 h-px w-2 bg-line" />}
                <StateIcon state={st} />
                <span className={cx("truncate text-[13px]", st === "queued" ? "text-faint" : "text-ink", isSel && "font-semibold")}>{a.name}</span>
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted">{st === "queued" ? "" : duration(end - a.start)}</span>
              </div>
              <div className="relative mr-4 h-full">
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-line-2" style={{ left: `${(t / total) * 100}%` }} />
                ))}
                {st !== "queued" && (
                  <span
                    className={cx("absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[3px]", barColor(a), st === "running" && "stripes-run")}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    {a.steps
                      .filter((s) => s.type === "finding" && s.t <= elapsed)
                      .map((s) => (
                        <span key={s.t} className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ffcb57]" style={{ left: `${((s.t - a.start) / Math.max(1, end - a.start)) * 100}%` }} />
                      ))}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {live && (
          <div className="pointer-events-none absolute inset-y-0 left-[300px] right-4">
            <span className="absolute inset-y-0 w-px bg-primary" style={{ left: `${nowPct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function TracePanel({ claim, agent, elapsed, openDoc, onFinding }: { claim: Claim; agent: Agent; elapsed: number; openDoc: (t: DrawerTarget) => void; onFinding: (id: string) => void }) {
  const st = agentState(agent, elapsed);
  const steps = agent.steps.filter((s) => s.t <= elapsed);
  const children = claim.agents.filter((a) => a.parent === agent.id);
  const written = claim.findings.filter((f) => f.agent === agent.id && agent.steps.some((s) => s.type === "finding" && s.t <= elapsed));
  const allCites = agent.steps.filter((s) => s.cite).map((s) => ({ ...s.cite!, tone: "neutral" as const }));

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-line">
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <StateIcon state={st} />
            <div className="truncate text-[15px] font-semibold">{agent.name}</div>
          </div>
          {st === "done" ? <Pill tone="ok">Done</Pill> : st === "running" ? <Pill tone="primary" dot>Running</Pill> : <Pill>Queued</Pill>}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-[12px]">
          <div>
            <div className="text-muted">Type</div>
            <div className="text-ink">{KIND_LABEL[agent.kind]}</div>
          </div>
          <div className="min-w-0">
            <div className="text-muted">Model</div>
            <div className="truncate font-mono text-[11.5px] text-ink">{agent.model}</div>
          </div>
          <div>
            <div className="text-muted">Started</div>
            <div className="tabular-nums text-ink">+{clock(agent.start)}</div>
          </div>
          <div>
            <div className="text-muted">Tokens</div>
            <div className="tabular-nums text-ink">{agent.tokensIn ? `${tokens(agent.tokensIn)} / ${tokens(agent.tokensOut)}` : "—"}</div>
          </div>
        </div>
        {(agent.docs.length > 0 || agent.clauses.length > 0) && (
          <div className="mt-3 space-y-1.5">
            {agent.docs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Docs</span>
                {agent.docs.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => openDoc({ doc: d, quotes: allCites, title: `${agent.name} · inputs` })}
                    className="h-5 rounded-[4px] border border-line bg-white px-1.5 font-mono text-[11px] text-ink-2 hover:border-primary hover:text-primary"
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            {agent.clauses.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Clauses</span>
                {agent.clauses.map((c) => (
                  <Clause key={c} id={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Trace</div>
        {st === "queued" && <div className="py-6 text-center text-[13px] text-faint">Starts at +{clock(agent.start)}</div>}
        <ol className="relative space-y-3 border-l border-line pl-4">
          {steps.map((s, i) => (
            <li key={i} className="fade-in relative">
              <span className="absolute -left-[25px] top-0 flex size-[18px] items-center justify-center rounded-full border border-line bg-white text-muted">{STEP_ICON[s.type]}</span>
              <div className="flex items-start gap-2">
                <span className="mt-px shrink-0 font-mono text-[11px] tabular-nums text-faint">+{(s.t / 1000).toFixed(1)}s</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] leading-snug text-ink">{s.label}</span>
                    <ResultPill r={s.result} />
                  </div>
                  {s.detail && <div className="mt-0.5 text-[12px] leading-snug text-muted">{s.detail}</div>}
                  {s.clause && (
                    <div className="mt-1">
                      <Clause id={s.clause} />
                    </div>
                  )}
                  {s.cite && (
                    <button
                      type="button"
                      onClick={() =>
                        openDoc({
                          doc: s.cite!.doc,
                          quotes: [{ ...s.cite!, tone: s.result === "fail" ? "against" : s.result === "pass" ? "for" : s.result === "warn" ? "flag" : "neutral" }],
                          active: s.cite!.quote,
                          title: `${agent.name} · ${s.label}`,
                        })
                      }
                      className="mt-1.5 flex w-full items-start gap-2 rounded-md border border-line bg-canvas px-2 py-1.5 text-left text-[12px] hover:border-primary/50 hover:bg-primary-soft"
                    >
                      <span className="mt-px shrink-0 rounded bg-white px-1 font-mono text-[11px] font-medium text-ink-2 ring-1 ring-line">{s.cite.doc}</span>
                      <span className="line-clamp-2 font-mono text-[11.5px] text-ink-2">{s.cite.quote.trim()}</span>
                    </button>
                  )}
                  {s.type === "finding" && s.finding && (
                    <button type="button" onClick={() => onFinding(s.finding!)} className="mt-1 text-[12px] font-medium text-primary hover:underline">
                      Open in review
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
          {st === "running" && (
            <li className="relative">
              <span className="absolute -left-[25px] top-0 flex size-[18px] items-center justify-center rounded-full border border-primary/40 bg-white text-primary">
                <Loader2 className="size-3 animate-spin" />
              </span>
              <span className="text-[13px] text-muted">Working</span>
            </li>
          )}
        </ol>

        {children.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Subagents</div>
            <div className="flex flex-wrap gap-1.5">
              {children.map((c) => {
                const cs = agentState(c, elapsed);
                return (
                  <span key={c.id} className={cx("inline-flex h-6 items-center gap-1.5 rounded-md border border-line px-2 text-[12px]", cs === "queued" ? "text-faint" : "text-ink-2")}>
                    {cs === "done" ? <CheckCircle2 className="size-3 text-[#1ea672]" /> : cs === "running" ? <Loader2 className="size-3 animate-spin text-primary" /> : <Circle className="size-3" />}
                    {c.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {written.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Wrote to Evidence Pack</div>
            <div className="space-y-1">
              {written.map((f) => (
                <button key={f.id} type="button" onClick={() => onFinding(f.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-canvas">
                  <span className={cx("size-2 shrink-0 rounded-full", f.side === "for" ? "bg-[#1ea672]" : f.side === "against" ? "bg-bad-ink" : "bg-[#e5a000]")} />
                  <span className="font-mono text-[11px] text-muted">{f.id}</span>
                  <span className="truncate text-ink">{f.title}</span>
                  {f.impact && <span className="ml-auto shrink-0 tabular-nums text-muted">{f.impact}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {st === "done" && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Output</div>
            <Json value={agent.output} />
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentsTab({ claim, elapsed, openDoc, onFinding }: { claim: Claim; elapsed: number; openDoc: (t: DrawerTarget) => void; onFinding: (id: string) => void }) {
  const { replay } = useStore();
  const live = Number.isFinite(elapsed);
  const running = live && elapsed < claim.runLength;
  const [selected, setSelected] = useState("orch");
  const [follow, setFollow] = useState(running);

  const latestRunning = useMemo(() => {
    const r = claim.agents.filter((a) => a.kind !== "orchestrator" && agentState(a, elapsed) === "running");
    return r.sort((a, b) => b.start - a.start)[0]?.id;
  }, [claim.agents, elapsed]);

  useEffect(() => {
    if (follow && running && latestRunning) setSelected(latestRunning);
  }, [follow, running, latestRunning]);

  const agent = claim.agents.find((a) => a.id === selected) ?? claim.agents[0];
  const doneCount = claim.agents.filter((a) => agentState(a, elapsed) === "done").length;
  const runCount = claim.agents.filter((a) => agentState(a, elapsed) === "running").length;
  const tok = claim.agents.filter((a) => agentState(a, elapsed) !== "queued").reduce((n, a) => n + a.tokensIn + a.tokensOut, 0);
  const shown = Math.min(elapsed, claim.runLength);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 text-[13px]">
        <div>
          <span className="text-muted">Agents </span>
          <b className="tabular-nums">{doneCount}</b>
          <span className="text-muted"> / {claim.agents.length} done</span>
        </div>
        {running && (
          <div className="flex items-center gap-1.5 text-primary">
            <Loader2 className="size-3.5 animate-spin" />
            <b className="tabular-nums">{runCount}</b> running
          </div>
        )}
        <div>
          <span className="text-muted">Elapsed </span>
          <b className="tabular-nums">{clock(shown)}</b>
          <span className="text-muted"> / {clock(claim.runLength)}</span>
        </div>
        <div>
          <span className="text-muted">Tokens </span>
          <b className="tabular-nums">{tokens(tok)}</b>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {running && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-[#635bff]" />
              Follow live
            </label>
          )}
          {live && (
            <Button size="sm" onClick={() => { replay(); setFollow(true); setSelected("orch"); }}>
              <RotateCcw className="size-3.5" />
              Replay run
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_440px] gap-4">
        <div className="min-w-0 space-y-3">
          <Waterfall claim={claim} elapsed={elapsed} selected={agent.id} onSelect={(id) => { setSelected(id); setFollow(false); }} />
          <div className="flex items-center gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-ink" />Orchestrator</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-[#9b94ff]" />Router, evidence</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" />Reasoning</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-[#687385]" />Deterministic</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-[#1ea672]" />Stripe</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rotate-45 bg-[#ffcb57]" />Finding written</span>
          </div>
        </div>
        <div className="h-[calc(100vh-200px)] min-h-[480px]">
          <TracePanel claim={claim} agent={agent} elapsed={elapsed} openDoc={openDoc} onFinding={onFinding} />
        </div>
      </div>
    </div>
  );
}

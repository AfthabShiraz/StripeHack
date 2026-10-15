"use client";

import { Bot, CalendarClock, CheckCircle2, Clock, FilePlus2, Loader2, Mail, Network, Paperclip, Send } from "lucide-react";
import { clock, duration, money } from "@/lib/format";
import { episodeFindings } from "@/lib/live";
import { useStore } from "@/lib/store";
import type { Claim, Episode, Stance } from "@/lib/types";
import type { DrawerTarget } from "../doc-drawer";
import { Card, CardHeader, Pill, cx } from "../ui";

export function visibleEmails(claim: Claim, elapsed: number) {
  const live = (claim.episodes?.length ?? 1) - 1;
  return (claim.emails ?? []).filter((m) => m.episode < live || (elapsed >= 0 && elapsed >= (m.t ?? 0)));
}

export function graphSize(claim: Claim, upto: number) {
  const eps = claim.episodes?.slice(0, upto + 1) ?? [];
  const docs = eps.reduce((n, e) => n + e.docs.length, 0);
  const facts = eps.reduce((n, e) => n + e.facts, 0);
  const findings = claim.findings.filter((f) => (f.episode ?? 0) <= upto).length;
  return { nodes: docs + facts + findings + claim.lines.length, edges: Math.round(facts * 2.4 + findings * 3.1 + docs) };
}

export function StanceBar({ stance, big }: { stance: Stance; big?: boolean }) {
  const parts = [
    { k: "Reject", v: stance.reject, c: "bg-[#df1b41]" },
    { k: "Partial", v: stance.partial, c: "bg-primary" },
    { k: "Full", v: stance.full, c: "bg-[#1ea672]" },
  ];
  return (
    <div>
      <div className={cx("flex gap-[2px] overflow-hidden rounded-[4px]", big ? "h-6" : "h-1.5")}>
        {parts
          .filter((p) => p.v > 0)
          .map((p) => (
            <div key={p.k} className={cx("flex items-center justify-center text-[11px] font-semibold text-white transition-all duration-700", p.c)} style={{ width: `${p.v * 100}%` }}>
              {big && p.v >= 0.12 ? `${Math.round(p.v * 100)}%` : ""}
            </div>
          ))}
      </div>
      {big && (
        <div className="mt-1.5 flex justify-between text-[12px] text-muted">
          {parts.map((p) => (
            <span key={p.k} className="flex items-center gap-1.5">
              <span className={cx("size-2 rounded-[2px]", p.c)} />
              {p.k} {Math.round(p.v * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const TRIGGER_ICON: Record<Episode["trigger"], React.ReactNode> = {
  opened: <FilePlus2 className="size-4" />,
  evidence: <Paperclip className="size-4" />,
  schedule: <CalendarClock className="size-4" />,
};

interface Props {
  claim: Claim;
  elapsed: number;
  openDoc: (t: DrawerTarget) => void;
  onRun: (episode: number) => void;
  onEmail: (id: string) => void;
  onFinding: (id: string) => void;
  onMemory: () => void;
}

export function TimelineTab({ claim, elapsed, openDoc, onRun, onEmail, onFinding, onMemory }: Props) {
  const { spawn } = useStore();
  const episodes = claim.episodes ?? [];
  const live = episodes.length - 1;
  const current = elapsed < 0 ? live - 1 : live;
  const liveDone = elapsed >= claim.runLength;
  const shown = episodes.slice(0, current + 1).map((e, i) => ({ e, i })).reverse();
  const emails = visibleEmails(claim, elapsed);
  const stance = current === live && !liveDone ? episodes[live - 1].stance : episodes[current].stance;
  const requests = claim.requests ?? [];
  const isReceived = (r: (typeof requests)[number]) => r.received !== undefined && (r.received < live || (r.received === live && elapsed >= 0));
  const size = graphSize(claim, current);
  const prevSize = graphSize(claim, Math.max(0, current - 1));
  const docTitle = (id: string) => claim.documents.find((d) => d.id === id)?.title ?? id;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="min-w-0">
        <ol className="relative space-y-3 border-l border-line pl-6">
          {elapsed < 0 && (
            <li className="relative">
              <span className="absolute -left-[33px] top-3 flex size-[18px] items-center justify-center rounded-full border-2 border-dashed border-[#9ccbe0] bg-white" />
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-[#9ccbe0] bg-[#f6fbfe] px-4 py-3 text-[13px]">
                <Clock className="size-4 shrink-0 text-info-ink" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">Waiting on the customer</div>
                  <div className="truncate text-muted">{requests.filter((r) => !isReceived(r)).map((r) => r.item).join(", ")}</div>
                </div>
                <button
                  type="button"
                  onClick={spawn}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[#ffc58a] bg-white px-2.5 text-[12.5px] font-medium text-[#b54708] hover:bg-[#fff6ec]"
                >
                  <span className="rounded-[3px] bg-[#fff1e0] px-1 text-[10px] font-semibold uppercase tracking-wide">Test</span>
                  Simulate customer reply
                </button>
              </div>
            </li>
          )}
          {shown.map(({ e, i }) => {
            const isLive = i === live;
            const running = isLive && !liveDone;
            const findings = episodeFindings(claim, i);
            const sent = emails.filter((m) => m.episode === i && m.direction === "out");
            const received = emails.find((m) => m.episode === i && m.direction === "in");
            return (
              <li key={e.id} className={cx("fade-in relative", isLive && "slide-in")}>
                <span
                  className={cx(
                    "absolute -left-[33px] top-3 flex size-[18px] items-center justify-center rounded-full border bg-white",
                    running ? "border-primary text-primary" : "border-line text-muted",
                  )}
                >
                  {running ? <Loader2 className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <div className={cx("rounded-lg border bg-white", running ? "border-primary/50 shadow-[0_0_0_3px_rgba(99,91,255,0.12)]" : "border-line")}>
                  <div className="flex items-center gap-2.5 border-b border-line-2 px-4 py-2.5">
                    <span className="text-muted">{TRIGGER_ICON[e.trigger]}</span>
                    <span className="text-[14px] font-semibold text-ink">{e.label}</span>
                    {running && (
                      <Pill tone="primary" dot>
                        Agents reading
                      </Pill>
                    )}
                    <span className="ml-auto text-[12.5px] tabular-nums text-muted">{e.at}</span>
                  </div>
                  <div className="space-y-3 px-4 py-3">
                    {received && (
                      <button type="button" onClick={() => onEmail(received.id)} className="flex w-full items-center gap-2 text-left text-[13px] text-ink-2 hover:text-ink">
                        <Mail className="size-3.5 shrink-0 text-muted" />
                        <span className="truncate">
                          <span className="font-medium">{received.from.split(" <")[0]}:</span> {received.body.split("\n").find((l) => l.trim() && !/^(hi|hello)/i.test(l.trim())) ?? received.subject}
                        </span>
                      </button>
                    )}
                    {e.docs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {e.docs.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => openDoc({ doc: d, quotes: [], title: docTitle(d) })}
                            className="flex h-6 items-center gap-1.5 rounded-md border border-line bg-canvas px-2 text-[12px] text-ink-2 hover:border-primary hover:text-primary"
                          >
                            <span className="font-mono text-[11px] font-medium">{d}</span>
                            <span className="max-w-[180px] truncate">{docTitle(d)}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[13px]">
                      <Bot className="size-3.5 shrink-0 text-primary" />
                      {running ? (
                        <span className="text-ink-2">
                          {e.agents.length} agents woke · {clock(elapsed)} elapsed
                        </span>
                      ) : (
                        <span className="text-ink-2">
                          {e.agents.length} agents · {duration(e.runLength)} · {e.facts} facts added to memory
                        </span>
                      )}
                      <button type="button" onClick={() => onRun(i)} className="ml-auto shrink-0 font-medium text-primary hover:underline">
                        View trace
                      </button>
                    </div>

                    {!running && <p className="text-[13px] leading-relaxed text-ink-2">{e.summary}</p>}

                    {!running && findings.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {findings.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => onFinding(f.id)}
                            className="flex h-6 items-center gap-1.5 rounded-md border border-line px-2 text-[12px] text-ink-2 hover:bg-canvas"
                          >
                            <span className={cx("size-1.5 rounded-full", f.side === "for" ? "bg-[#1ea672]" : f.side === "against" ? "bg-bad-ink" : "bg-[#e5a000]")} />
                            <span className="max-w-[220px] truncate">{f.title}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {sent.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onEmail(m.id)}
                        className="flex w-full items-center gap-2 rounded-md bg-canvas px-2.5 py-1.5 text-left text-[12.5px] hover:bg-[#eef1f5]"
                      >
                        <Send className="size-3.5 shrink-0 text-[#d0478a]" />
                        <span className="shrink-0 font-medium text-ink">Emailed customer</span>
                        <span className="truncate text-muted">{m.subject}</span>
                        {m.requests && <span className="ml-auto shrink-0 text-muted">{m.requests.length} asked</span>}
                      </button>
                    ))}

                    {!running && (
                      <div className="flex items-center gap-3 border-t border-line-2 pt-2.5">
                        <span className="w-28 shrink-0 text-[12px] text-muted">Orchestrator view</span>
                        <div className="flex-1">
                          <StanceBar stance={e.stance} />
                        </div>
                        <span className="w-36 shrink-0 text-right text-[12px] tabular-nums text-ink-2">
                          {e.stance.low === e.stance.high ? money(e.stance.low) : `${money(e.stance.low)}–${money(e.stance.high)}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-4">
        <div className="sticky top-4 space-y-4">
          <Card>
            <CardHeader title="Orchestrator view" right={<span>{current === live && liveDone ? "Decided" : "After run " + (current + 1)}</span>} />
            <div className="space-y-3 p-4">
              <StanceBar stance={stance} big />
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-muted">Payable</span>
                <span className="text-[20px] font-semibold tabular-nums">
                  {stance.low === stance.high ? money(stance.low) : `${money(stance.low)} – ${money(stance.high)}`}
                </span>
              </div>
              <p className="text-[13px] leading-snug text-ink-2">{elapsed >= 0 && !liveDone ? "Reading new evidence. Checking the memory graph." : stance.note}</p>
              {stance.blocker && !(elapsed >= 0) && (
                <div className="flex items-center gap-2 rounded-md bg-warn-bg/60 px-2.5 py-1.5 text-[12.5px] text-warn-ink">
                  <Clock className="size-3.5 shrink-0" />
                  Blocking payment: {stance.blocker}
                </div>
              )}
              {liveDone && (
                <div className="flex items-center gap-2 rounded-md bg-ok-bg/70 px-2.5 py-1.5 text-[12.5px] text-ok-ink">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  Paid {money(claim.net)} without a person
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Requested from customer" right={<span className="tabular-nums">{requests.filter(isReceived).length} / {requests.length}</span>} />
            <div className="divide-y divide-line-2">
              {requests.map((r) => {
                const got = isReceived(r);
                return (
                  <div key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    {got ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1ea672]" /> : <Clock className="mt-0.5 size-4 shrink-0 text-info-ink" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium leading-snug text-ink">{r.item}</div>
                      <div className="text-[12px] text-muted">
                        {got ? (
                          <>
                            Received {episodes[r.received!].at.replace(", now", "")} ·{" "}
                            {r.docs.map((d, n) => (
                              <button key={d} type="button" onClick={() => openDoc({ doc: d, quotes: [], title: docTitle(d) })} className="font-mono text-[11px] text-primary hover:underline">
                                {d}
                                {n < r.docs.length - 1 ? ", " : ""}
                              </button>
                            ))}
                          </>
                        ) : (
                          `Asked ${r.chased.length + 1} times · ${r.clause}`
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Cognee memory" icon={<Network className="size-4 text-primary" />} right={<button type="button" onClick={onMemory} className="font-medium text-primary hover:underline">Open graph</button>} />
            <div className="grid grid-cols-2 divide-x divide-line">
              <div className="px-4 py-3">
                <div className="text-[12px] text-muted">Nodes</div>
                <div className="text-[18px] font-semibold tabular-nums">{size.nodes}</div>
                <div className="text-[12px] text-[#1ea672]">+{size.nodes - prevSize.nodes} last run</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[12px] text-muted">Edges</div>
                <div className="text-[18px] font-semibold tabular-nums">{size.edges}</div>
                <div className="text-[12px] text-[#1ea672]">+{size.edges - prevSize.edges} last run</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

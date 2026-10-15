"use client";

import { ArrowRight, Bot, Loader2, User } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LEDGER, type Range, daysFor } from "@/lib/data/history";
import { clock, money, money0, pct } from "@/lib/format";
import { agentState } from "@/lib/live";
import { useAllClaimStates } from "@/lib/store";
import { Card, CardHeader, Pill, Segmented, cx } from "../ui";
import { PaidChart } from "./paid-chart";

function Tile({ label, value, sub, swatch }: { label: string; value: React.ReactNode; sub: React.ReactNode; swatch?: string }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        {swatch && <span className={cx("size-2 rounded-[2px]", swatch)} />}
        {label}
      </div>
      <div className="mt-1 truncate text-[22px] font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      <div className="truncate text-[12px] text-muted">{sub}</div>
    </div>
  );
}

function ShareBar({ label, agent, human, fmt }: { label: string; agent: number; human: number; fmt: (n: number) => string }) {
  const total = agent + human || 1;
  const a = agent / total;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-muted">{fmt(agent + human)}</span>
      </div>
      <div className="flex h-6 gap-[2px] overflow-hidden rounded-[4px]">
        <div className="flex items-center bg-agent px-2 text-[11px] font-semibold text-white" style={{ width: `${a * 100}%` }}>
          {pct(a)}
        </div>
        <div className="flex flex-1 items-center justify-end bg-human px-2 text-[11px] font-semibold text-white">{pct(1 - a)}</div>
      </div>
      <div className="mt-1 flex justify-between text-[12px] tabular-nums text-muted">
        <span>Agent {fmt(agent)}</span>
        <span>Human {fmt(human)}</span>
      </div>
    </div>
  );
}

export function Home() {
  const [range, setRange] = useState<Range>("30D");
  const days = useMemo(() => daysFor(range), [range]);
  const states = useAllClaimStates();

  const t = useMemo(() => {
    const agentPaid = days.reduce((n, d) => n + d.agentPaid, 0);
    const humanPaid = days.reduce((n, d) => n + d.humanPaid, 0);
    const agentN = days.reduce((n, d) => n + d.agentCount, 0);
    const humanN = days.reduce((n, d) => n + d.humanCount, 0);
    const declined = days.reduce((n, d) => n + d.declined, 0);
    const referred = days.reduce((n, d) => n + d.referred, 0);
    return { agentPaid, humanPaid, agentN, humanN, declined, referred };
  }, [days]);

  const review = states.filter((s) => s.status === "needs_review");
  const live = states.filter((s) => s.status === "triaging");
  const waiting = states.filter((s) => s.status === "awaiting_evidence");
  const decided = states.filter((s) => s.decision?.action === "approved");
  const total = t.agentPaid + t.humanPaid;

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-10 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold tracking-tight">Home</h1>
        <Segmented options={["MTD", "30D", "90D", "YTD"] as const} value={range} onChange={setRange} />
      </div>

      <Card className="mt-5 grid grid-cols-5 divide-x divide-line">
        <Tile label="Paid out" value={money0(total)} sub={`${(t.agentN + t.humanN).toLocaleString()} claims`} />
        <Tile label="Paid by agents" swatch="bg-agent" value={pct(t.agentPaid / total)} sub={`${money0(t.agentPaid)} · ${t.agentN.toLocaleString()} claims`} />
        <Tile label="Paid by people" swatch="bg-human" value={pct(t.humanPaid / total)} sub={`${money0(t.humanPaid)} · ${t.humanN.toLocaleString()} claims`} />
        <Tile label="Settled without a person" value={pct(t.agentN / (t.agentN + t.humanN))} sub="of paid claims" />
        <Tile label="Median time to pay" value={<span>4m 06s <span className="text-[14px] font-normal text-muted">agent</span></span>} sub="1.8 days human" />
      </Card>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Paid out" right={<span>{range === "YTD" ? "Weekly" : "Daily"} · GBP</span>} />
            <div className="p-4">
              <PaidChart days={days} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent payouts" right={<Link href="/payouts" className="flex items-center gap-1 font-medium text-primary hover:underline">View all <ArrowRight className="size-3.5" /></Link>} />
            <table className="w-full text-[13px]">
              <tbody>
                {decided.map(({ claim, decision, status }) => (
                  <tr key={claim.id} className="border-b border-line-2">
                    <td className="px-4 py-2.5 font-semibold tabular-nums">{money(decision!.amount)}</td>
                    <td className="px-2 py-2.5"><Pill tone={status === "paid" ? "ok" : "info"} dot={status !== "paid"}>{status === "paid" ? "Paid" : "In transit"}</Pill></td>
                    <td className="px-2 py-2.5"><Link href={`/claims/${claim.id}`} className="font-mono text-[12px] text-primary hover:underline">{claim.id}</Link></td>
                    <td className="px-2 py-2.5 text-ink-2">{claim.claimant}</td>
                    <td className="px-2 py-2.5"><span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#007a93]"><User className="size-3.5" />{decision!.by}</span></td>
                    <td className="px-4 py-2.5 text-right text-muted">{decision!.at}</td>
                  </tr>
                ))}
                {LEDGER.slice(0, 7 - decided.length).map((r) => (
                  <tr key={r.id} className="border-b border-line-2 last:border-b-0">
                    <td className="px-4 py-2.5 font-semibold tabular-nums">{money(r.amount)}</td>
                    <td className="px-2 py-2.5"><Pill tone={r.status === "paid" ? "ok" : "info"}>{r.status === "paid" ? "Paid" : "In transit"}</Pill></td>
                    <td className="px-2 py-2.5 font-mono text-[12px] text-muted">{r.claim}</td>
                    <td className="px-2 py-2.5 text-ink-2">{r.payee}</td>
                    <td className="px-2 py-2.5">
                      <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", r.by === "agent" ? "text-primary-ink" : "text-[#007a93]")}>
                        {r.by === "agent" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                        {r.approver}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">{r.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Needs you" right={<span className="tabular-nums">{review.length}</span>} />
            <div className="divide-y divide-line-2">
              {review.map(({ claim }) => (
                <Link key={claim.id} href={`/claims/${claim.id}`} className="block px-4 py-3 hover:bg-canvas">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{claim.claimant}</span>
                    <span className="text-[13px] font-semibold tabular-nums">{money(claim.recommendation === "DECLINE" ? claim.claimed : claim.net)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-muted">
                    <span className="truncate">{claim.id} · {claim.heads.join(", ")}</span>
                    <Pill tone={claim.recommendation === "DECLINE" ? "bad" : "info"}>{claim.recommendation === "DECLINE" ? "Decline" : "Pay"}</Pill>
                  </div>
                </Link>
              ))}
              {!review.length && <div className="px-4 py-8 text-center text-[13px] text-faint">Queue is empty</div>}
            </div>
          </Card>

          {waiting.length > 0 && (
            <Card>
              <CardHeader title="Waiting on customers" right={<span className="tabular-nums">{waiting.length}</span>} />
              <div className="divide-y divide-line-2">
                {waiting.map(({ claim }) => {
                  const open = (claim.requests ?? []).filter((r) => r.received === undefined || r.received === (claim.episodes?.length ?? 0) - 1);
                  return (
                    <Link key={claim.id} href={`/claims/${claim.id}`} className="block px-4 py-3 hover:bg-canvas">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">{claim.claimant}</span>
                        <span className="text-[13px] font-semibold tabular-nums">{money(claim.net)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-muted">
                        {open.map((r) => r.item).join(", ")} · asked {open[0] ? open[0].chased.length + 1 : 0} times
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}

          {live.map(({ claim, elapsed }) => {
            const running = claim.agents.filter((a) => a.kind !== "orchestrator" && agentState(a, elapsed) === "running");
            const done = claim.agents.filter((a) => agentState(a, elapsed) === "done").length;
            return (
              <Card key={claim.id}>
                <CardHeader title={<span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin text-primary" />Triaging now</span>} right={<span className="tabular-nums">{clock(elapsed)}</span>} />
                <Link href={`/claims/${claim.id}`} className="block p-4 hover:bg-canvas">
                  <div className="flex items-center justify-between">
                    <span className="text-[13.5px] font-semibold">{claim.claimant}</span>
                    <span className="font-mono text-[12px] text-muted">{claim.id}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-2">
                    <div className="stripes-run h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, (elapsed / claim.runLength) * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted">
                    {done} of {claim.agents.length} agents done
                  </div>
                  <div className="mt-2 space-y-1">
                    {running.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                        {a.name}
                      </div>
                    ))}
                  </div>
                </Link>
              </Card>
            );
          })}

          <Card>
            <CardHeader title="Share of paid out" />
            <div className="space-y-4 p-4">
              <ShareBar label="By value" agent={t.agentPaid} human={t.humanPaid} fmt={money0} />
              <ShareBar label="By claims" agent={t.agentN} human={t.humanN} fmt={(n) => n.toLocaleString()} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Outcomes" right={<span>{range}</span>} />
            <div className="px-4 py-2">
              <div className="flex justify-between py-1.5 text-[13px]"><span className="text-muted">Paid by agents, no person</span><span className="tabular-nums">{t.agentN.toLocaleString()}</span></div>
              <div className="flex justify-between py-1.5 text-[13px]"><span className="text-muted">Referred to a person</span><span className="tabular-nums">{t.referred.toLocaleString()}</span></div>
              <div className="flex justify-between py-1.5 text-[13px]"><span className="text-muted">Declined</span><span className="tabular-nums">{t.declined.toLocaleString()}</span></div>
              <div className="flex justify-between py-1.5 text-[13px]"><span className="text-muted">Rejection rate</span><span className="tabular-nums">{pct(t.declined / (t.agentN + t.humanN + t.declined), 1)}</span></div>
              <div className="flex justify-between py-1.5 text-[13px]"><span className="text-muted">Cost to review a claim</span><span className="tabular-nums">£14 agent · £126 person</span></div>
              <div className="flex justify-between py-1.5 text-[13px]"><span className="text-muted">Agent limit</span><span className="tabular-nums">£1,000 net</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

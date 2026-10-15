"use client";

import { Bot, Search, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { clock, money } from "@/lib/format";
import { agentState } from "@/lib/live";
import { useAllClaimStates } from "@/lib/store";
import type { ClaimStatus } from "@/lib/types";
import { Card, Pill, Segmented, StatusPill, Tabs, cx } from "./ui";

type View = "all" | "waiting" | "triaging" | "review" | "agent" | "paid" | "declined";

const VIEWS: { id: View; label: string; match: (s: ClaimStatus, route: string, human: boolean) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "waiting", label: "Awaiting evidence", match: (s) => s === "awaiting_evidence" },
  { id: "triaging", label: "Triaging", match: (s) => s === "triaging" },
  { id: "review", label: "Needs review", match: (s) => s === "needs_review" },
  { id: "agent", label: "Auto-settled", match: (s, r, human) => s === "paid" && r === "agent" && !human },
  { id: "paid", label: "Paid", match: (s) => s === "paid" || s === "approved" },
  { id: "declined", label: "Declined", match: (s) => s === "declined" },
];

export function ClaimsList() {
  const params = useSearchParams();
  const router = useRouter();
  const view = (params.get("view") as View) || "all";
  const [q, setQ] = useState(params.get("q") ?? "");
  const paramQ = params.get("q") ?? "";
  const [prevQ, setPrevQ] = useState(paramQ);
  if (paramQ !== prevQ) {
    setPrevQ(paramQ);
    setQ(paramQ);
  }
  const [route, setRoute] = useState<"All" | "Agent" | "Human">("All");
  const states = useAllClaimStates();

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, states.filter((s) => v.match(s.status, s.claim.route, !!s.decision)).length])), [states]);
  const rows = states.filter((s) => {
    const v = VIEWS.find((x) => x.id === view) ?? VIEWS[0];
    if (!v.match(s.status, s.claim.route, !!s.decision)) return false;
    if (route !== "All" && s.claim.route !== route.toLowerCase()) return false;
    if (q) {
      const hay = `${s.claim.id} ${s.claim.claimant} ${s.claim.policy} ${s.claim.heads.join(" ")} ${s.claim.destination}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const inReview = states.filter((s) => s.status === "needs_review");
  const paidByAgent = states.filter((s) => s.status === "paid" && s.claim.route === "agent").reduce((n, s) => n + s.claim.payment.amount, 0);
  const paidByHuman = states.filter((s) => s.status === "paid" && s.claim.route === "human").reduce((n, s) => n + (s.decision?.amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-10 pt-6">
      <h1 className="text-[24px] font-semibold tracking-tight">Claims</h1>

      <div className="mt-5 grid grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[12px] text-muted">Needs review</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{inReview.length}</div>
          <div className="text-[12px] text-muted">{money(inReview.reduce((n, s) => n + s.claim.claimed, 0))} claimed</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-muted">Triaging now</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{counts.triaging}</div>
          <div className="text-[12px] text-muted">agents working</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-muted">Paid by agents</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{money(paidByAgent)}</div>
          <div className="text-[12px] text-muted">under £1,000 each</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-muted">Paid by people</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{money(paidByHuman)}</div>
          <div className="text-[12px] text-muted">T1 and above</div>
        </Card>
      </div>

      <div className="mt-6">
        <Tabs<View>
          value={view}
          onChange={(v) => router.replace(v === "all" ? "/claims" : `/claims?view=${v}`)}
          tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: counts[v.id] }))}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-8 w-64 rounded-md border border-line pl-8 pr-2 text-[13px] placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Segmented options={["All", "Agent", "Human"] as const} value={route} onChange={setRoute} />
      </div>

      <Card className="mt-3 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[12px] text-muted">
              <th className="px-4 py-2.5 font-medium">Claim</th>
              <th className="px-2 py-2.5 font-medium">Claimant</th>
              <th className="px-2 py-2.5 font-medium">Heads of claim</th>
              <th className="px-2 py-2.5 font-medium">Status</th>
              <th className="px-2 py-2.5 font-medium">Route</th>
              <th className="px-2 py-2.5 font-medium">Agents</th>
              <th className="px-2 py-2.5 text-right font-medium">Claimed</th>
              <th className="px-2 py-2.5 text-right font-medium">Net</th>
              <th className="px-2 py-2.5 font-medium">Fraud</th>
              <th className="px-4 py-2.5 text-right font-medium">Reported</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ claim: c, status, elapsed }) => {
              const live = status === "triaging";
              const waiting = status === "awaiting_evidence";
              const outstanding = (c.requests ?? []).filter((r) => r.received === undefined || r.received === (c.episodes?.length ?? 0) - 1);
              const doneAgents = c.agents.filter((a) => agentState(a, elapsed) === "done").length;
              return (
                <tr key={c.id} className="border-b border-line-2 last:border-b-0 hover:bg-canvas/70">
                  <td className="px-4 py-3">
                    <Link href={`/claims/${c.id}`} className="font-mono text-[12.5px] font-medium text-primary hover:underline">
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    <Link href={`/claims/${c.id}`} className="text-ink hover:underline">
                      {c.claimant}
                    </Link>
                    <div className="text-[12px] text-muted">{c.destination}</div>
                  </td>
                  <td className="px-2 py-3 text-ink-2">{c.heads.length > 2 ? `${c.heads.slice(0, 2).join(", ")} +${c.heads.length - 2}` : c.heads.join(", ")}</td>
                  <td className="px-2 py-3">
                    <StatusPill status={status} />
                  </td>
                  <td className="px-2 py-3">
                    {live ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", c.route === "agent" ? "text-primary-ink" : "text-[#007a93]")}>
                        {c.route === "agent" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                        {c.route === "agent" ? "Agent · T0" : `Human · ${c.tier}`}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {waiting ? (
                      <span className="text-[12.5px] text-info-ink">Waiting on customer · {outstanding.length} item</span>
                    ) : live ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line-2">
                          <div className="stripes-run h-full rounded-full bg-primary" style={{ width: `${(elapsed / c.runLength) * 100}%` }} />
                        </div>
                        <span className="text-[12px] tabular-nums text-muted">
                          {doneAgents}/{c.agents.length} · {clock(elapsed)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[12.5px] text-muted">{c.episodes ? `${c.episodes.length} runs over 2 weeks` : `${c.agents.length} · ${clock(c.runLength)}`}</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-ink-2">{money(c.claimed)}</td>
                  <td className="px-2 py-3 text-right font-semibold tabular-nums">{live ? <span className="font-normal text-faint">—</span> : money(c.net)}</td>
                  <td className="px-2 py-3">{live ? <span className="text-faint">—</span> : waiting ? <Pill>Incomplete</Pill> : <Pill tone={c.fraudBand === "Green" ? "ok" : c.fraudBand === "Amber" ? "warn" : "bad"}>{c.fraudScore} {c.fraudBand}</Pill>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-muted">{c.reported}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-[13px] text-faint">
                  No claims
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line bg-canvas px-4 py-2 text-[12px] text-muted">
          <span>
            {rows.length} of {states.length}
          </span>
          <span>Page 1 of 1</span>
        </div>
      </Card>
    </div>
  );
}

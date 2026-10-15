"use client";

import { Bot, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LEDGER } from "@/lib/data/history";
import { duration, money } from "@/lib/format";
import { useAllClaimStates } from "@/lib/store";
import { Card, CopyId, Pill, Tabs, cx } from "./ui";

type F = "all" | "agent" | "human";

interface Row {
  id: string;
  claim: string;
  href?: string;
  payee: string;
  amount: number;
  by: "agent" | "human";
  approver: string;
  heads: string;
  created: string;
  status: "paid" | "pending" | "in_transit";
  seconds?: number;
}

export function Payouts() {
  const [f, setF] = useState<F>("all");
  const states = useAllClaimStates();

  const fromClaims: Row[] = states
    .filter((s) => s.status === "paid" || s.status === "approved")
    .map(({ claim, decision, status }) => ({
      id: decision?.payoutId ?? claim.payment.id,
      claim: claim.id,
      href: `/claims/${claim.id}`,
      payee: claim.claimant,
      amount: decision?.amount ?? claim.payment.amount,
      by: decision ? ("human" as const) : ("agent" as const),
      approver: decision?.by ?? "Agent (T0)",
      heads: claim.heads.join(", "),
      created: decision?.at ?? claim.payment.created ?? "",
      status: status === "paid" ? ("paid" as const) : ("in_transit" as const),
      seconds: decision ? undefined : claim.runLength / 1000,
    }));

  const all: Row[] = [...fromClaims, ...LEDGER];
  const rows = all.filter((r) => f === "all" || r.by === f);
  const sum = (rs: Row[]) => rs.reduce((n, r) => n + r.amount, 0);

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-10 pt-6">
      <h1 className="text-[24px] font-semibold tracking-tight">Payouts</h1>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-[12px] text-muted">Total</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{money(sum(all))}</div>
          <div className="text-[12px] text-muted">{all.length} payouts</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-muted"><span className="size-2 rounded-[2px] bg-agent" />Approved by agent</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{money(sum(all.filter((r) => r.by === "agent")))}</div>
          <div className="text-[12px] text-muted">{all.filter((r) => r.by === "agent").length} payouts</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[12px] text-muted"><span className="size-2 rounded-[2px] bg-human" />Approved by a person</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{money(sum(all.filter((r) => r.by === "human")))}</div>
          <div className="text-[12px] text-muted">{all.filter((r) => r.by === "human").length} payouts</div>
        </Card>
      </div>

      <div className="mt-6">
        <Tabs<F>
          value={f}
          onChange={setF}
          tabs={[
            { id: "all", label: "All", count: all.length },
            { id: "agent", label: "Agent", count: all.filter((r) => r.by === "agent").length },
            { id: "human", label: "Human", count: all.filter((r) => r.by === "human").length },
          ]}
        />
      </div>

      <Card className="mt-4 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[12px] text-muted">
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-2 py-2.5 font-medium" />
              <th className="px-2 py-2.5 font-medium">Status</th>
              <th className="px-2 py-2.5 font-medium">Payout</th>
              <th className="px-2 py-2.5 font-medium">Claim</th>
              <th className="px-2 py-2.5 font-medium">Payee</th>
              <th className="px-2 py-2.5 font-medium">Heads of claim</th>
              <th className="px-2 py-2.5 font-medium">Approved by</th>
              <th className="px-2 py-2.5 text-right font-medium">Claim to payout</th>
              <th className="px-4 py-2.5 text-right font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-2 last:border-b-0 hover:bg-canvas/70">
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(r.amount)}</td>
                <td className="px-2 py-2.5 text-[12px] text-muted">GBP</td>
                <td className="px-2 py-2.5">
                  <Pill tone={r.status === "paid" ? "ok" : "info"} dot={r.status !== "paid"}>
                    {r.status === "paid" ? "Paid" : "In transit"}
                  </Pill>
                </td>
                <td className="px-2 py-2.5">
                  <CopyId value={r.id} />
                </td>
                <td className="px-2 py-2.5">
                  {r.href ? (
                    <Link href={r.href} className="font-mono text-[12px] text-primary hover:underline">
                      {r.claim}
                    </Link>
                  ) : (
                    <span className="font-mono text-[12px] text-muted">{r.claim}</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-ink">{r.payee}</td>
                <td className="px-2 py-2.5 text-ink-2">{r.heads}</td>
                <td className="px-2 py-2.5">
                  <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", r.by === "agent" ? "text-primary-ink" : "text-[#007a93]")}>
                    {r.by === "agent" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                    {r.approver}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted">{r.seconds ? (r.seconds > 86400 ? `${(r.seconds / 86400).toFixed(1)} days` : duration(r.seconds * 1000)) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted">{r.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

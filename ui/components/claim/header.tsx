"use client";

import { Check, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { clock, money } from "@/lib/format";
import { agentState } from "@/lib/live";
import { REVIEWER, type Decision, useStore } from "@/lib/store";
import type { Claim, ClaimStatus } from "@/lib/types";
import { Button, CopyId, Modal, Pill, StatusPill, cx } from "../ui";

export function Banner({ claim, status, elapsed, onWatch }: { claim: Claim; status: ClaimStatus; elapsed: number; onWatch: () => void }) {
  if (status === "triaging") {
    const done = claim.agents.filter((a) => agentState(a, elapsed) === "done").length;
    return (
      <div className="flex h-9 items-center gap-2 border-b border-[#d9d6ff] bg-primary-soft px-6 text-[13px] text-primary-ink">
        <Sparkles className="size-3.5" />
        <span className="font-semibold">Agents are triaging this claim.</span>
        <span>
          {done} of {claim.agents.length} agents done · {clock(elapsed)} elapsed
        </span>
        <button type="button" onClick={onWatch} className="ml-auto font-semibold underline-offset-2 hover:underline">
          Watch agents
        </button>
      </div>
    );
  }
  if (status === "needs_review") {
    return (
      <div className="flex h-9 items-center gap-2 border-b border-[#f5d77a] bg-[#fdf6dd] px-6 text-[13px] text-[#8a4b00]">
        <ShieldAlert className="size-3.5" />
        <span className="font-semibold">Requires: {claim.tier} claims handler</span>
        <span>Your level: {REVIEWER.level}.</span>
      </div>
    );
  }
  return null;
}

interface Step {
  label: string;
  sub: string;
  state: "done" | "current" | "todo" | "stopped";
}

function steps(claim: Claim, status: ClaimStatus, elapsed: number, decision?: Decision): Step[] {
  const triaged = status !== "triaging";
  const humanDecided = !!decision;
  const agentPaid = claim.route === "agent";
  const decisionStep: Step = agentPaid
    ? { label: "Decision", sub: "Agent · T0", state: "done" }
    : humanDecided
      ? { label: decision!.action === "approved" ? "Approved" : "Declined", sub: decision!.by, state: decision!.action === "approved" ? "done" : "stopped" }
      : { label: "Human review", sub: triaged ? `Awaiting ${claim.tier}` : "Pending", state: triaged ? "current" : "todo" };
  const last: Step =
    status === "paid"
      ? { label: "Paid", sub: decision?.at ?? claim.payment.created ?? "", state: "done" }
      : status === "approved"
        ? { label: "Paying", sub: "Stripe payout", state: "current" }
        : status === "declined"
          ? { label: "Closed", sub: "Letter queued", state: "done" }
          : { label: "Paid", sub: "", state: "todo" };
  return [
    { label: "Reported", sub: claim.reported, state: "done" },
    {
      label: "Triaged by agents",
      sub: triaged ? `${claim.agents.length} agents · ${clock(claim.runLength)}` : `${clock(elapsed)} elapsed`,
      state: triaged ? "done" : "current",
    },
    decisionStep,
    last,
  ];
}

export function Stepper({ claim, status, elapsed, decision }: { claim: Claim; status: ClaimStatus; elapsed: number; decision?: Decision }) {
  const s = steps(claim, status, elapsed, decision);
  return (
    <div className="flex items-start">
      {s.map((st, i) => (
        <div key={st.label + i} className="flex min-w-0 flex-1 items-start">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={cx(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                st.state === "done" && "bg-[#1ea672] text-white",
                st.state === "stopped" && "bg-bad-ink text-white",
                st.state === "current" && "border-2 border-primary bg-white",
                st.state === "todo" && "border-2 border-line bg-white",
              )}
            >
              {(st.state === "done" || st.state === "stopped") && <Check className="size-3" strokeWidth={3} />}
              {st.state === "current" && <span className="size-2 animate-pulse rounded-full bg-primary" />}
            </span>
            <div className="min-w-0">
              <div className={cx("text-[12px] font-semibold uppercase tracking-wide", st.state === "todo" ? "text-faint" : st.state === "current" ? "text-primary" : "text-ink")}>{st.label}</div>
              <div className="truncate text-[12px] text-muted">{st.sub || " "}</div>
            </div>
          </div>
          {i < s.length - 1 && <div className={cx("mx-3 mt-[11px] h-px flex-1", st.state === "done" ? "bg-[#1ea672]" : "bg-line")} />}
        </div>
      ))}
    </div>
  );
}

export function ClaimHeader({ claim, status, onShowPayment }: { claim: Claim; status: ClaimStatus; onShowPayment: () => void }) {
  const { approve, decline } = useStore();
  const [modal, setModal] = useState<null | "approve" | "decline">(null);
  const [note, setNote] = useState("");
  const recommendsDecline = claim.recommendation === "DECLINE";
  const payAmount = claim.payment.amount;

  let actions: React.ReactNode = null;
  if (status === "triaging") {
    actions = (
      <Button variant="primary" disabled>
        Waiting for agents
      </Button>
    );
  } else if (status === "needs_review") {
    actions = recommendsDecline ? (
      <>
        <Button onClick={() => { setNote(""); setModal("approve"); }}>Override and pay {money(payAmount)}</Button>
        <Button variant="primary" onClick={() => { setNote("Agree with recommendation. A.3(b) applies."); setModal("decline"); }}>
          Confirm decline
        </Button>
      </>
    ) : (
      <>
        <Button variant="danger" onClick={() => { setNote(""); setModal("decline"); }}>Decline</Button>
        <Button variant="primary" onClick={() => { setNote("Checked Evidence Pack. Agree with agent calculation."); setModal("approve"); }}>
          Approve and pay {money(payAmount)}
        </Button>
      </>
    );
  } else if (status === "paid" || status === "approved") {
    actions = <Button onClick={onShowPayment}>View payout</Button>;
  }

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-[22px] font-semibold tracking-tight text-ink">
            {claim.claimant} <span className="font-normal text-muted">· {claim.heads.join(", ")}</span>
          </h1>
          <StatusPill status={status} />
        </div>
        <div className="mt-1 flex items-center gap-3">
          <CopyId value={claim.id} className="text-[13px] text-ink-2" />
          <CopyId value={claim.apiId} />
        </div>
        <div className="mt-1 text-[13px] text-muted">
          Loss {claim.lossDate} · {claim.destination} · Reported {claim.reported} · {claim.policy} · {claim.cover} · {claim.wording}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>

      <Modal
        open={modal === "approve"}
        onClose={() => setModal(null)}
        title={`Approve and pay ${money(payAmount)}`}
        footer={
          <>
            <Button onClick={() => setModal(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                approve(claim, payAmount, note);
                setModal(null);
              }}
            >
              Approve and pay
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md border border-line bg-canvas p-3 text-[13px]">
            <div className="flex justify-between"><span className="text-muted">Payee</span><span>{claim.payment.payee} · {claim.payment.account}</span></div>
            <div className="flex justify-between"><span className="text-muted">Reference</span><span className="font-mono text-[12px]">{claim.payment.reference}</span></div>
            <div className="flex justify-between"><span className="text-muted">Idempotency key</span><span className="font-mono text-[12px]">{claim.payment.idempotencyKey}</span></div>
          </div>
          {recommendsDecline && <div className="rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn-ink">This overrides the agent recommendation to decline.</div>}
          <label className="block text-[13px] font-medium text-ink">
            Note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-line p-2 text-[13px] font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </label>
        </div>
      </Modal>

      <Modal
        open={modal === "decline"}
        onClose={() => setModal(null)}
        title="Decline claim"
        footer={
          <>
            <Button onClick={() => setModal(null)}>Cancel</Button>
            <Button
              variant="primary"
              className="!bg-bad-ink hover:!bg-[#930a33]"
              onClick={() => {
                decline(claim, note);
                setModal(null);
              }}
            >
              Decline claim
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>No payment will be made. A decision letter will be queued for {claim.claimant}.</p>
          <label className="block text-[13px] font-medium text-ink">
            Reason
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-line p-2 text-[13px] font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </label>
        </div>
      </Modal>
    </div>
  );
}

export function SummaryStrip({ claim, status, done, decision, findings, citations }: { claim: Claim; status: ClaimStatus; done: boolean; decision?: Decision; findings: number; citations: number }) {
  const paid = status === "paid" ? (decision?.amount ?? claim.payment.amount) : 0;
  const rec = claim.recommendation === "DECLINE" ? "Decline" : claim.recommendation === "SETTLE" ? "Pay in full" : "Pay in part";
  const cells: { k: string; v: React.ReactNode; sub?: React.ReactNode }[] = [
    { k: "Claimed", v: money(claim.claimed), sub: `${claim.lines.length} lines` },
    {
      k: "Recommended",
      v: done ? money(claim.net) : <span className="text-faint">—</span>,
      sub: done ? rec : "Agents working",
    },
    { k: "Paid", v: money(paid), sub: status === "paid" ? (decision ? decision.by : "Agent · T0") : "—" },
    {
      k: "Route",
      v: done ? (claim.route === "agent" ? "Agent" : "Human") : <span className="text-faint">—</span>,
      sub: done ? (claim.route === "agent" ? "Within T0 authority" : `${claim.tier} required`) : "Pending",
    },
    {
      k: "Fraud screen",
      v: done ? <span className="flex items-center gap-2">{claim.fraudScore}<Pill tone={claim.fraudBand === "Green" ? "ok" : claim.fraudBand === "Amber" ? "warn" : "bad"}>{claim.fraudBand}</Pill></span> : <span className="text-faint">—</span>,
      sub: "FRD-03",
    },
    { k: "Evidence", v: `${findings} findings`, sub: `${citations} citations` },
  ];
  return (
    <div className="grid grid-cols-6 divide-x divide-line rounded-lg border border-line">
      {cells.map((c) => (
        <div key={c.k} className="min-w-0 px-4 py-3">
          <div className="text-[12px] text-muted">{c.k}</div>
          <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-ink">{c.v}</div>
          <div className="truncate text-[12px] text-muted">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

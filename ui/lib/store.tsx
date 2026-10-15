"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CLAIMS, LIVE_CLAIM_ID } from "./data";
import type { Claim, ClaimStatus, LogEvent } from "./types";

export interface Decision {
  action: "approved" | "declined";
  by: string;
  at: string;
  note: string;
  amount: number;
  payoutId?: string;
  payoutStatus?: "pending" | "paid";
}

interface Store {
  now: number;
  liveStart: number;
  decisions: Record<string, Decision>;
  approve: (claim: Claim, amount: number, note: string) => void;
  decline: (claim: Claim, note: string) => void;
  replay: () => void;
}

const StoreContext = createContext<Store | null>(null);

export const REVIEWER = { name: "Alex Morgan", initials: "AM", level: "T2 · Senior claims handler", email: "alex.morgan@larkspur.example" };

const LIVE_KEY = "si.liveStart";
const DECISIONS_KEY = "si.decisions";

function readJSON<T>(store: "local" | "session", key: string): T | null {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    const v = s.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(store: "local" | "session", key: string, value: unknown) {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function payoutId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let id = "po_1QD";
  for (let i = 0; i < 18; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function stamp() {
  return new Date().toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const [liveStart, setLiveStart] = useState(() => Date.now());
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  useEffect(() => {
    // Restore the run clock and decisions after mount so the static HTML matches the first client render.
    const saved = readJSON<number>("session", LIVE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setLiveStart(saved);
    else writeJSON("session", LIVE_KEY, liveStart);
    const d = readJSON<Record<string, Decision>>("local", DECISIONS_KEY);
    if (d) setDecisions(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const save = useCallback((next: Record<string, Decision>) => {
    setDecisions(next);
    writeJSON("local", DECISIONS_KEY, next);
  }, []);

  const approve = useCallback(
    (claim: Claim, amount: number, note: string) => {
      const id = payoutId();
      const next = {
        ...decisions,
        [claim.id]: { action: "approved" as const, by: REVIEWER.name, at: stamp(), note, amount, payoutId: id, payoutStatus: "pending" as const },
      };
      save(next);
      window.setTimeout(() => {
        setDecisions((cur) => {
          const d = cur[claim.id];
          if (!d || d.payoutId !== id) return cur;
          const upd = { ...cur, [claim.id]: { ...d, payoutStatus: "paid" as const } };
          writeJSON("local", DECISIONS_KEY, upd);
          return upd;
        });
      }, 2200);
    },
    [decisions, save],
  );

  const decline = useCallback(
    (claim: Claim, note: string) => {
      save({ ...decisions, [claim.id]: { action: "declined", by: REVIEWER.name, at: stamp(), note, amount: 0 } });
    },
    [decisions, save],
  );

  const replay = useCallback(() => {
    const t = Date.now();
    setLiveStart(t);
    writeJSON("session", LIVE_KEY, t);
    const next = { ...decisions };
    delete next[LIVE_CLAIM_ID];
    save(next);
  }, [decisions, save]);

  const value = useMemo(() => ({ now, liveStart, decisions, approve, decline, replay }), [now, liveStart, decisions, approve, decline, replay]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

/** Milliseconds into the agent run for this claim. Completed claims return Infinity. */
export function useElapsed(claim: Claim) {
  const { now, liveStart } = useStore();
  if (claim.id !== LIVE_CLAIM_ID) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - liveStart);
}

export function statusOf(claim: Claim, elapsed: number, decision?: Decision): ClaimStatus {
  if (decision?.action === "approved") return decision.payoutStatus === "paid" ? "paid" : "approved";
  if (decision?.action === "declined") return "declined";
  if (claim.status === "triaging") return elapsed < claim.runLength ? "triaging" : "needs_review";
  return claim.status;
}

export function useClaimState(claim: Claim) {
  const { decisions } = useStore();
  const elapsed = useElapsed(claim);
  const decision = decisions[claim.id];
  const status = statusOf(claim, elapsed, decision);
  const done = elapsed >= claim.runLength;
  return { elapsed, decision, status, done };
}

export function useAllClaimStates() {
  const { decisions, now, liveStart } = useStore();
  return CLAIMS.map((c) => {
    const elapsed = c.id === LIVE_CLAIM_ID ? Math.max(0, now - liveStart) : Number.POSITIVE_INFINITY;
    const decision = decisions[c.id];
    return { claim: c, elapsed, decision, status: statusOf(c, elapsed, decision) };
  });
}

/** Static log plus events produced by the live run and by reviewer decisions. Newest first. */
export function claimLogs(claim: Claim, elapsed: number, status: ClaimStatus, decision?: Decision): LogEvent[] {
  const extra: LogEvent[] = [];
  if (claim.id === LIVE_CLAIM_ID) {
    for (const a of claim.agents) {
      if (a.kind === "orchestrator") continue;
      if (elapsed >= a.start + a.duration) extra.push({ id: `live_${a.id}`, type: "agent.completed", detail: a.name, actor: `agent.${a.id}`, at: "Oct 15, 08:53" });
    }
    if (elapsed >= claim.runLength) {
      extra.push({ id: "live_pack", type: "evidence_pack.created", detail: "6 lines · 8 findings · 13 citations", actor: "agent.orchestrator", at: "Oct 15, 08:54" });
      extra.push({ id: "live_ref", type: "claim.referred", detail: "T1 · net £1,252.08 over T0 limit", actor: "agent.decision", at: "Oct 15, 08:54" });
    }
  }
  if (decision?.action === "approved") {
    extra.push({ id: "dec_appr", type: "claim.approved", detail: decision.note || "Approved", actor: decision.by, at: decision.at });
    extra.push({ id: "dec_po", type: "payout.created", detail: `${decision.payoutId} · idem ${claim.payment.idempotencyKey}`, actor: "stripe", at: decision.at });
    if (status === "paid") extra.push({ id: "dec_paid", type: "payout.paid", detail: `£${decision.amount.toFixed(2)} to ${claim.payment.account}`, actor: "stripe", at: decision.at });
  }
  if (decision?.action === "declined") {
    extra.push({ id: "dec_decl", type: "claim.declined", detail: decision.note || "Declined", actor: decision.by, at: decision.at });
    extra.push({ id: "dec_letter", type: "letter.queued", detail: "Decision letter LTR-02", actor: "agent.decision", at: decision.at });
  }
  return [...extra.reverse(), ...claim.logs];
}

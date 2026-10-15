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
  /** when the demo evidence was received, or null while the claim is waiting on the customer */
  spawnedAt: number | null;
  decisions: Record<string, Decision>;
  approve: (claim: Claim, amount: number, note: string) => void;
  decline: (claim: Claim, note: string) => void;
  spawn: () => void;
  resetDemo: () => void;
}

const StoreContext = createContext<Store | null>(null);

export const REVIEWER = { name: "Alex Morgan", initials: "AM", level: "T2 · Senior claims handler", email: "alex.morgan@strype.example" };

const SPAWN_KEY = "si.spawnedAt";
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
    if (value === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function transferId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let id = "tr_1QD";
  for (let i = 0; i < 18; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function stamp() {
  return new Date().toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const [spawnedAt, setSpawnedAt] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  useEffect(() => {
    // Restore demo state after mount so the static HTML matches the first client render.
    const saved = readJSON<number>("session", SPAWN_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setSpawnedAt(saved);
    const d = readJSON<Record<string, Decision>>("local", DECISIONS_KEY);
    if (d) setDecisions(d);
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
      const id = transferId();
      save({
        ...decisions,
        [claim.id]: { action: "approved", by: REVIEWER.name, at: stamp(), note, amount, payoutId: id, payoutStatus: "pending" },
      });
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

  const spawn = useCallback(() => {
    const t = Date.now();
    setSpawnedAt(t);
    writeJSON("session", SPAWN_KEY, t);
  }, []);

  const resetDemo = useCallback(() => {
    setSpawnedAt(null);
    writeJSON("session", SPAWN_KEY, null);
    save({});
  }, [save]);

  const value = useMemo(() => ({ now, spawnedAt, decisions, approve, decline, spawn, resetDemo }), [now, spawnedAt, decisions, approve, decline, spawn, resetDemo]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

/**
 * Milliseconds into the live agent run.
 * -1 while the demo claim waits on the customer; Infinity for claims with no live run.
 */
function elapsedFor(claim: Claim, now: number, spawnedAt: number | null) {
  if (claim.id !== LIVE_CLAIM_ID) return Number.POSITIVE_INFINITY;
  return spawnedAt === null ? -1 : Math.max(0, now - spawnedAt);
}

export function useElapsed(claim: Claim) {
  const { now, spawnedAt } = useStore();
  return elapsedFor(claim, now, spawnedAt);
}

export function statusOf(claim: Claim, elapsed: number, decision?: Decision): ClaimStatus {
  if (decision?.action === "approved") return decision.payoutStatus === "paid" ? "paid" : "approved";
  if (decision?.action === "declined") return "declined";
  if (claim.episodes) {
    if (elapsed < 0) return "awaiting_evidence";
    if (elapsed < claim.runLength) return "triaging";
  }
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
  const { decisions, now, spawnedAt } = useStore();
  return CLAIMS.map((c) => {
    const elapsed = elapsedFor(c, now, spawnedAt);
    const decision = decisions[c.id];
    return { claim: c, elapsed, decision, status: statusOf(c, elapsed, decision) };
  });
}

/** Index of the latest episode that has happened. */
export function currentEpisode(claim: Claim, elapsed: number) {
  if (!claim.episodes) return 0;
  return elapsed < 0 ? claim.episodes.length - 2 : claim.episodes.length - 1;
}

/** Static log plus events from the live run and reviewer decisions. Newest first. */
export function claimLogs(claim: Claim, elapsed: number, status: ClaimStatus, decision?: Decision): LogEvent[] {
  const live = claim.episodes ? claim.episodes.length - 1 : -1;
  const base = claim.logs.filter((l) => {
    if (l.episode === undefined || l.episode < live) return true;
    if (elapsed < 0) return false;
    return l.type === "evidence.received" || elapsed >= claim.runLength;
  });
  const extra: LogEvent[] = [];
  if (decision?.action === "approved") {
    extra.push({ id: "dec_appr", type: "claim.approved", detail: decision.note || "Approved", actor: decision.by, at: decision.at });
    extra.push({ id: "dec_po", type: "transfer.created", detail: `${decision.payoutId} · idem ${claim.payment.idempotencyKey}`, actor: "stripe", at: decision.at });
    if (status === "paid") extra.push({ id: "dec_paid", type: "transfer.paid", detail: `£${decision.amount.toFixed(2)} to ${claim.payment.account}`, actor: "stripe", at: decision.at });
  }
  if (decision?.action === "declined") {
    extra.push({ id: "dec_decl", type: "claim.declined", detail: decision.note || "Declined", actor: decision.by, at: decision.at });
    extra.push({ id: "dec_letter", type: "email.queued", detail: "Decision letter LTR-02", actor: "agent.comms", at: decision.at });
  }
  return [...extra.reverse(), ...base];
}

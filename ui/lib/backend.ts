/**
 * Client for the Python claims API (server/app.py), proxied at /api by next.config.ts.
 * When the API is unreachable every helper fails soft and the UI keeps its mock data.
 */
import type { AuthorityCheck, Claim, ClaimStatus, FraudIndicator, LineItem, Outcome, SectionTotal } from "./types";

export interface TimelineEvent {
  at: string;
  step: string;
  message: string;
  artifact?: string | null;
}

export interface LivePayment {
  id: string;
  amount: number;
  status: string;
  account: string;
  idempotencyKey: string;
  dashboardUrl: string;
  created: string;
}

export interface LiveLine {
  line: number;
  section: string;
  outcome: Outcome;
  payable: number;
  clauses: string[];
  evidence: string[];
  reason: string;
  calculation: string;
  cites: { doc: string; quote: string }[];
}

export interface LiveOverlay {
  version: number;
  net: number;
  fraudScore: number;
  fraudBand: "Green" | "Amber" | "Red";
  lines: LiveLine[];
  sections: (SectionTotal & { calculation: string })[];
  fraud: FraudIndicator[];
  decision: null | {
    status: "PAID" | "REFERRED" | "NO_PAYMENT_DUE";
    decidedAt: string;
    paidNow: number;
    paidTotal: number;
    verdict: "AGREE" | "REFER";
    summary: string;
    authority: AuthorityCheck[];
    payment: LivePayment | null;
    letter: { subject: string; body_markdown: string } | null;
  };
}

export interface LiveState {
  exists: boolean;
  claimId: string;
  status?: "NEW" | "PROCESSING" | "WAITING" | "PAID" | "REFERRED" | "NO_PAYMENT_DUE" | "ERROR";
  running: boolean;
  received?: string[];
  waitingFor?: string[];
  pending?: string[];
  decisionVersion?: number;
  paidTotal?: number;
  timeline?: TimelineEvent[];
  snapshot: boolean;
  overlay?: LiveOverlay | null;
}

export interface Answer {
  text: string;
  references: string[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not json */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

export const backend = {
  live: (id: string) => call<LiveState>(`/claims/${id}/live`),
  prepare: (id: string) => call<{ started: string }>(`/claims/${id}/prepare`, { method: "POST" }),
  evidence: (id: string, docIds: string[] = []) =>
    call<{ docIds: string[]; livePayments: boolean }>(`/claims/${id}/evidence`, { method: "POST", body: JSON.stringify({ doc_ids: docIds }) }),
  ask: (id: string, question: string) => call<Answer>(`/claims/${id}/ask`, { method: "POST", body: JSON.stringify({ question }) }),
  reset: (id: string) => call<{ restoredSnapshot: boolean }>(`/demo/reset`, { method: "POST", body: JSON.stringify({ claim_id: id }) }),
};

/** A backend run has finished with a decision the UI can show in place of the mock numbers. */
export function liveDecided(live: LiveState | null): live is LiveState & { overlay: LiveOverlay & { decision: NonNullable<LiveOverlay["decision"]> } } {
  return !!live && !live.running && !!live.overlay?.decision;
}

/** Mock claim with the real backend decision laid over it: amounts, outcomes, checks and the Stripe transfer. */
export function applyLive(claim: Claim, live: LiveState | null): Claim {
  if (!liveDecided(live)) return claim;
  const o = live.overlay;
  const d = o.decision;
  const byLine = new Map(o.lines.map((l) => [l.line, l]));
  const lines: LineItem[] = claim.lines.map((l) => {
    const r = byLine.get(l.line);
    return r ? { ...l, outcome: r.outcome, payable: r.payable, clauses: r.clauses, evidence: r.evidence, reason: r.reason || l.reason } : l;
  });
  const status: ClaimStatus = d.status === "PAID" ? "paid" : d.status === "REFERRED" ? "needs_review" : claim.status;
  const p = d.payment;
  return {
    ...claim,
    status,
    net: o.net,
    route: d.status === "REFERRED" ? "human" : "agent",
    fraudScore: o.fraudScore,
    fraudBand: o.fraudBand,
    lines,
    sections: o.sections.length ? o.sections : claim.sections,
    authority: d.authority.length ? d.authority : claim.authority,
    fraud: o.fraud.length ? o.fraud : claim.fraud,
    payment: p
      ? {
          ...claim.payment,
          id: p.id,
          amount: p.amount,
          status: "succeeded",
          account: p.account,
          idempotencyKey: p.idempotencyKey,
          created: new Date(p.created).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          approvedBy: "agent:T0 (ACA)",
          dashboardUrl: p.dashboardUrl,
        }
      : claim.payment,
  };
}

export type DocKind =
  | "form"
  | "statement"
  | "email"
  | "document"
  | "receipt"
  | "policy"
  | "record"
  | "company";

export interface RawDoc {
  id: string;
  name: string;
  title: string;
  kind: DocKind;
  text: string;
}

/** A pointer into a document. `quote` must appear verbatim in one line of the doc (markdown ** stripped). */
export interface Cite {
  doc: string;
  quote: string;
  tone?: "for" | "against" | "flag" | "neutral";
}

export type ClaimStatus =
  | "awaiting_evidence"
  | "triaging"
  | "needs_review"
  | "auto_settled"
  | "approved"
  | "declined"
  | "paid";

export type Outcome = "PAY" | "PAY_PARTIAL" | "DECLINE" | "PEND";

export interface LineItem {
  line: number;
  section: string;
  description: string;
  date: string;
  claimed: string; // original currency, e.g. "EUR 38.40"
  claimedGbp: number;
  outcome: Outcome;
  payable: number;
  clauses: string[];
  evidence: string[];
  reason: string;
}

export interface Finding {
  id: string;
  /** episode that wrote it (claims with an evidence timeline) */
  episode?: number;
  side: "for" | "against" | "flag";
  title: string;
  detail: string;
  agent: string;
  lines?: number[];
  impact?: string;
  clauses: string[];
  cites: Cite[];
}

export type StepType =
  | "spawn"
  | "read"
  | "retrieve"
  | "extract"
  | "check"
  | "finding"
  | "handoff"
  | "tool"
  | "decision"
  | "memory";

export interface TraceStep {
  /** ms offset from the start of the run */
  t: number;
  type: StepType;
  label: string;
  detail?: string;
  cite?: Cite;
  clause?: string;
  finding?: string;
  result?: "pass" | "fail" | "warn" | "info";
}

export type AgentKind =
  | "orchestrator"
  | "intake"
  | "router"
  | "extractor"
  | "section"
  | "consistency"
  | "calculator"
  | "decision"
  | "payment"
  | "comms";

export interface Agent {
  id: string;
  name: string;
  kind: AgentKind;
  parent?: string;
  model: string;
  /** ms offset when the agent started */
  start: number;
  /** ms duration */
  duration: number;
  tokensIn: number;
  tokensOut: number;
  docs: string[];
  clauses: string[];
  steps: TraceStep[];
  output: Record<string, unknown>;
}

export interface SectionTotal {
  section: string;
  eligible: number;
  limit: string;
  excess: number;
  net: number;
}

export interface AuthorityCheck {
  id: string;
  rule: string;
  pass: boolean;
  note: string;
  /** cannot be checked until the live episode completes */
  pending?: string;
}

export interface FraudIndicator {
  id: string;
  label: string;
  weight: number;
  triggered: boolean;
  note: string;
  pending?: string;
}

export interface Payment {
  id: string;
  amount: number;
  status: "succeeded" | "pending" | "not_created";
  payee: string;
  payeeToken: string;
  account: string;
  reference: string;
  idempotencyKey: string;
  created?: string;
  approvedBy: string;
  /** Stripe Dashboard link for a real test-mode transfer */
  dashboardUrl?: string;
}

export interface LogEvent {
  id: string;
  episode?: number;
  type: string;
  detail: string;
  actor: string;
  at: string;
}

export interface Stance {
  reject: number;
  partial: number;
  full: number;
  low: number;
  high: number;
  note: string;
  blocker?: string;
}

/** One burst of activity on a claim: evidence arrives, agents wake, the orchestrator updates its view. */
export interface Episode {
  id: string;
  at: string;
  trigger: "opened" | "evidence" | "schedule";
  label: string;
  docs: string[];
  agents: Agent[];
  runLength: number;
  summary: string;
  stance: Stance;
  facts: number;
}

export interface EvidenceRequest {
  id: string;
  item: string;
  reason: string;
  clause: string;
  requested: number;
  chased: number[];
  received?: number;
  docs: string[];
}

export interface Email {
  id: string;
  episode: number;
  /** for the live episode: ms into the run when it appears */
  t?: number;
  direction: "out" | "in";
  from: string;
  to: string;
  at: string;
  subject: string;
  body: string;
  auto: boolean;
  requests?: string[];
  attachments?: string[];
}

export interface Claim {
  id: string;
  apiId: string;
  claimant: string;
  email: string;
  policy: string;
  product: string;
  cover: string;
  wording: string;
  heads: string[];
  destination: string;
  tripDates: string;
  lossDate: string;
  reported: string;
  status: ClaimStatus;
  /** amount the claimant asked for, GBP estimate */
  claimed: number;
  /** recommended net payable */
  net: number;
  route: "agent" | "human";
  tier: string;
  recommendation: "SETTLE" | "SETTLE_PARTIAL" | "DECLINE" | "REFER";
  summary: string;
  fraudScore: number;
  fraudBand: "Green" | "Amber" | "Red";
  documents: RawDoc[];
  findings: Finding[];
  lines: LineItem[];
  sections: SectionTotal[];
  authority: AuthorityCheck[];
  fraud: FraudIndicator[];
  agents: Agent[];
  payment: Payment;
  logs: LogEvent[];
  /** for live claims: total run length in ms */
  runLength: number;
  why: { q: string; a: string; cites: Cite[]; clauses: string[] }[];
  /** evidence timeline. The last episode is triggered from the demo and its agents mirror `agents`. */
  episodes?: Episode[];
  requests?: EvidenceRequest[];
  emails?: Email[];
}

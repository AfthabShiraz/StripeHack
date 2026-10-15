import type { Agent, Claim, Finding } from "./types";

export type AgentState = "queued" | "running" | "done";

export function agentState(a: Agent, elapsed: number): AgentState {
  if (elapsed < a.start) return "queued";
  if (elapsed < a.start + a.duration) return "running";
  return "done";
}

export function agentEnd(a: Agent) {
  return a.start + a.duration;
}

/** When a finding first appears: the first "finding" step of the agent that wrote it. */
export function findingTime(claim: Claim, f: Finding) {
  const a = claim.agents.find((x) => x.id === f.agent);
  if (!a) return 0;
  const step = a.steps.find((s) => s.type === "finding");
  return step ? step.t : agentEnd(a);
}

export function visibleFindings(claim: Claim, elapsed: number) {
  return claim.findings.filter((f) => findingTime(claim, f) <= elapsed);
}

export function readyAt(claim: Claim, kind: Agent["kind"]) {
  const a = claim.agents.find((x) => x.kind === kind);
  return a ? agentEnd(a) : 0;
}

export function citationCount(claim: Claim) {
  return claim.findings.reduce((n, f) => n + f.cites.length, 0) + claim.agents.reduce((n, a) => n + a.steps.filter((s) => s.cite).length, 0);
}

export function childrenOf(claim: Claim) {
  const order: Agent["kind"][] = ["orchestrator", "intake", "router", "extractor", "section", "consistency", "calculator", "decision", "payment"];
  return [...claim.agents].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.start - b.start);
}

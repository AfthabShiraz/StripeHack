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
  const live = claim.episodes ? claim.episodes.length - 1 : -1;
  return claim.findings.filter((f) => (claim.episodes && (f.episode ?? 0) < live) || findingTime(claim, f) <= elapsed);
}

/** Findings written in a given episode. */
export function episodeFindings(claim: Claim, episode: number) {
  return claim.findings.filter((f) => (f.episode ?? 0) === episode);
}

export function readyAt(claim: Claim, kind: Agent["kind"]) {
  const a = claim.agents.find((x) => x.kind === kind);
  return a ? agentEnd(a) : 0;
}

export function citationCount(claim: Claim) {
  return claim.findings.reduce((n, f) => n + f.cites.length, 0);
}

export function childrenOf(claim: Claim) {
  const order: Agent["kind"][] = ["orchestrator", "intake", "router", "extractor", "section", "consistency", "calculator", "decision", "payment"];
  return [...claim.agents].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.start - b.start);
}

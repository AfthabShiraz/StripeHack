"use client";

import { useState } from "react";
import { getClaim } from "@/lib/data";
import { citationCount, readyAt, visibleFindings } from "@/lib/live";
import { claimLogs, useClaimState } from "@/lib/store";
import { DocDrawer, type DrawerTarget } from "../doc-drawer";
import { PageBody, Topbar } from "../shell/topbar";
import { Tabs } from "../ui";
import { AgentsTab } from "./agents";
import { EmailsTab } from "./emails";
import { Banner, ClaimHeader, Stepper, SummaryStrip } from "./header";
import { MemoryTab } from "./memory";
import { ReviewTab } from "./review";
import { AuthorityTab, ExplainTab, LinesTab, LogsTab, PaymentTab } from "./tabs";
import { TimelineTab, visibleEmails } from "./timeline";

type Tab = "timeline" | "review" | "agents" | "memory" | "emails" | "lines" | "authority" | "payment" | "logs" | "explain";

export function ClaimView({ id }: { id: string }) {
  const claim = getClaim(id)!;
  const { elapsed, decision, status, done } = useClaimState(claim);
  const hasTimeline = !!claim.episodes;
  const [tab, setTab] = useState<Tab>(hasTimeline ? "timeline" : "review");
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [run, setRun] = useState<number | undefined>(undefined);
  const [email, setEmail] = useState<string | null>(null);

  const findings = visibleFindings(claim, elapsed);
  const linesReady = hasTimeline || elapsed >= readyAt(claim, "calculator");
  const authReady = hasTimeline ? true : elapsed >= readyAt(claim, "decision");
  const logs = claimLogs(claim, elapsed, status, decision);
  const emails = hasTimeline ? visibleEmails(claim, elapsed) : [];

  const openFinding = (fid: string) => {
    setFocus(fid);
    setTab("review");
  };
  const openRun = (i: number) => {
    setRun(i);
    setTab("agents");
  };
  const openEmail = (mid: string) => {
    setEmail(mid);
    setTab("emails");
  };
  const watch = () => {
    setRun(undefined);
    setTab("agents");
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    ...(hasTimeline ? [{ id: "timeline" as Tab, label: "Timeline", count: claim.episodes!.length - (elapsed < 0 ? 1 : 0) }] : []),
    { id: "review", label: "Review", count: findings.length },
    { id: "agents", label: "Agents", count: hasTimeline ? undefined : claim.agents.length },
    ...(hasTimeline ? [{ id: "memory" as Tab, label: "Memory" }, { id: "emails" as Tab, label: "Emails", count: emails.length }] : []),
    { id: "lines", label: "Line items", count: claim.lines.length },
    { id: "authority", label: "Authority" },
    { id: "payment", label: "Payment" },
    { id: "logs", label: "Logs", count: logs.length },
    { id: "explain", label: "Ask why" },
  ];

  return (
    <>
      <Topbar back="/claims" crumbs={[{ label: "Claims", href: "/claims" }, { label: claim.id }]} />
      <PageBody>
        <Banner claim={claim} status={status} elapsed={elapsed} onWatch={watch} />
        <div className="mx-auto max-w-[1440px] space-y-5 px-6 pb-10 pt-6">
          <ClaimHeader claim={claim} status={status} onShowPayment={() => setTab("payment")} />
          <div className="rounded-lg border border-line px-5 py-4">
            <Stepper claim={claim} status={status} elapsed={elapsed} decision={decision} />
          </div>
          <SummaryStrip claim={claim} status={status} done={done} decision={decision} findings={findings.length} citations={done ? citationCount(claim) : findings.reduce((n, f) => n + f.cites.length, 0)} />
          <Tabs<Tab> value={tab} onChange={(t) => { if (t === "agents") setRun(undefined); setTab(t); }} tabs={tabs} />
          <div>
            {tab === "timeline" && <TimelineTab claim={claim} elapsed={elapsed} openDoc={setDrawer} onRun={openRun} onEmail={openEmail} onFinding={openFinding} onMemory={() => setTab("memory")} />}
            {tab === "review" && <ReviewTab claim={claim} findings={findings} status={status} done={done} focus={focus} />}
            {tab === "agents" && <AgentsTab claim={claim} elapsed={elapsed} run={run} onRun={setRun} openDoc={setDrawer} onFinding={openFinding} />}
            {tab === "memory" && <MemoryTab claim={claim} elapsed={elapsed} openDoc={setDrawer} onFinding={openFinding} />}
            {tab === "emails" && <EmailsTab claim={claim} elapsed={elapsed} focus={email} openDoc={setDrawer} onRun={openRun} />}
            {tab === "lines" && <LinesTab claim={claim} ready={linesReady} openDoc={setDrawer} />}
            {tab === "authority" && <AuthorityTab claim={claim} ready={authReady} held={hasTimeline && !done} />}
            {tab === "payment" && <PaymentTab claim={claim} status={status} decision={decision} ready={done} openDoc={setDrawer} />}
            {tab === "logs" && <LogsTab logs={logs} />}
            {tab === "explain" && <ExplainTab claim={claim} ready={done} openDoc={setDrawer} />}
          </div>
        </div>
      </PageBody>
      <DocDrawer claim={claim} target={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

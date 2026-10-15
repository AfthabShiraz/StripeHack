"use client";

import { useState } from "react";
import { getClaim } from "@/lib/data";
import { citationCount, readyAt, visibleFindings } from "@/lib/live";
import { claimLogs, useClaimState } from "@/lib/store";
import { DocDrawer, type DrawerTarget } from "../doc-drawer";
import { PageBody, Topbar } from "../shell/topbar";
import { Tabs } from "../ui";
import { AgentsTab } from "./agents";
import { Banner, ClaimHeader, Stepper, SummaryStrip } from "./header";
import { ReviewTab } from "./review";
import { AuthorityTab, ExplainTab, LinesTab, LogsTab, PaymentTab } from "./tabs";

type Tab = "review" | "agents" | "lines" | "authority" | "payment" | "logs" | "explain";

export function ClaimView({ id }: { id: string }) {
  const claim = getClaim(id)!;
  const { elapsed, decision, status, done } = useClaimState(claim);
  const [tab, setTab] = useState<Tab>(claim.status === "triaging" ? "agents" : "review");
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const findings = visibleFindings(claim, elapsed);
  const linesReady = elapsed >= readyAt(claim, "calculator");
  const authReady = elapsed >= readyAt(claim, "decision");
  const logs = claimLogs(claim, elapsed, status, decision);

  const openFinding = (fid: string) => {
    setFocus(fid);
    setTab("review");
  };

  return (
    <>
      <Topbar back="/claims" crumbs={[{ label: "Claims", href: "/claims" }, { label: claim.id }]} />
      <PageBody>
        <Banner claim={claim} status={status} elapsed={elapsed} onWatch={() => setTab("agents")} />
        <div className="mx-auto max-w-[1440px] space-y-5 px-6 pb-10 pt-6">
          <ClaimHeader claim={claim} status={status} onShowPayment={() => setTab("payment")} />
          <div className="rounded-lg border border-line px-5 py-4">
            <Stepper claim={claim} status={status} elapsed={elapsed} decision={decision} />
          </div>
          <SummaryStrip claim={claim} status={status} done={done} decision={decision} findings={findings.length} citations={done ? citationCount(claim) : findings.reduce((n, f) => n + f.cites.length, 0)} />
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "review", label: "Review", count: findings.length },
              { id: "agents", label: "Agents", count: claim.agents.length },
              { id: "lines", label: "Line items", count: claim.lines.length },
              { id: "authority", label: "Authority" },
              { id: "payment", label: "Payment" },
              { id: "logs", label: "Logs", count: logs.length },
              { id: "explain", label: "Ask why" },
            ]}
          />
          <div>
            {tab === "review" && <ReviewTab claim={claim} findings={findings} status={status} done={done} focus={focus} />}
            {tab === "agents" && <AgentsTab claim={claim} elapsed={elapsed} openDoc={setDrawer} onFinding={openFinding} />}
            {tab === "lines" && <LinesTab claim={claim} ready={linesReady} openDoc={setDrawer} />}
            {tab === "authority" && <AuthorityTab claim={claim} ready={authReady} />}
            {tab === "payment" && <PaymentTab claim={claim} status={status} decision={decision} ready={done} />}
            {tab === "logs" && <LogsTab logs={logs} />}
            {tab === "explain" && <ExplainTab claim={claim} ready={done} openDoc={setDrawer} />}
          </div>
        </div>
      </PageBody>
      <DocDrawer claim={claim} target={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

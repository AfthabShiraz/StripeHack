"use client";

import { ExternalLink, Play, Server } from "lucide-react";
import { useEffect, useRef } from "react";
import { liveDecided } from "@/lib/backend";
import { money } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Card, CardHeader, KV, Pill, cx } from "../ui";

const STEP_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral" | "primary"> = {
  intake: "info",
  reader: "neutral",
  section: "primary",
  checker: "warn",
  money: "primary",
  pack: "info",
  final: "primary",
  gate: "warn",
  payment: "ok",
  letter: "info",
  memory: "neutral",
  waiting: "warn",
  error: "bad",
};

/** The real pipeline run for the live claim, streamed from runs/<claim>/state.json via the API. */
export function LiveRunTab() {
  const { live, backendError, prepare, spawn, spawnedAt } = useStore();
  const end = useRef<HTMLDivElement>(null);
  const events = live?.timeline ?? [];

  useEffect(() => {
    if (live?.running) end.current?.scrollIntoView({ block: "nearest" });
  }, [events.length, live?.running]);

  if (!live) {
    return (
      <Card className="p-6 text-[13.5px] text-ink-2">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <Server className="size-4" /> Claims API not reachable
        </div>
        <p className="mt-2">
          Start it from the repo root with <code className="font-mono">.venv-claims/bin/uvicorn server.app:app --port 8000</code>. The console falls back to
          its recorded demo data meanwhile.
        </p>
      </Card>
    );
  }

  const d = liveDecided(live) ? live.overlay.decision : null;
  const p = d?.payment;
  const statusTone = live.status === "PAID" ? "ok" : live.status === "ERROR" ? "bad" : live.status === "REFERRED" ? "warn" : live.running ? "primary" : "info";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5">
      <Card>
        <CardHeader
          title="Pipeline run log"
          right={
            <span className="flex items-center gap-2">
              {live.running && <Pill tone="primary" dot>Running</Pill>}
              <span>{events.length} events</span>
            </span>
          }
        />
        <div className="max-h-[620px] overflow-y-auto font-mono text-[12px]">
          {events.length === 0 && <div className="px-4 py-10 text-center text-faint">No run yet.</div>}
          {events.map((e, i) => (
            <div key={i} className={cx("flex gap-3 border-b border-line-2 px-4 py-1.5", e.step === "error" && "bg-bad-bg")}>
              <span className="shrink-0 tabular-nums text-faint">{e.at.slice(11, 19)}</span>
              <span className="w-16 shrink-0">
                <Pill tone={STEP_TONE[e.step] ?? "neutral"}>{e.step}</Pill>
              </span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-ink-2">{e.message}</span>
            </div>
          ))}
          <div ref={end} />
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Backend" icon={<Server className="size-4" />} />
          <div className="px-5 py-3">
            <KV k="Status" v={<Pill tone={statusTone} dot={live.running}>{live.exists ? live.status : "not prepared"}</Pill>} />
            <KV k="Documents received" v={live.received?.length ?? 0} />
            <KV k="Still pending" v={(live.pending ?? []).join(", ") || "—"} mono />
            <KV k="Decision version" v={live.decisionVersion ? `v${live.decisionVersion}` : "—"} />
            <KV k="Paid to date" v={money(live.paidTotal ?? 0)} />
            <KV k="Demo snapshot" v={live.snapshot ? "saved (Reset restores it)" : "none yet"} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            {!live.snapshot && (
              <Button onClick={prepare} disabled={live.running}>
                <Play className="size-3.5" /> Prepare claim (full run)
              </Button>
            )}
            {live.status === "WAITING" && spawnedAt === null && (
              <Button onClick={spawn} disabled={live.running}>
                <Play className="size-3.5" /> Send customer reply
              </Button>
            )}
          </div>
          {backendError && <div className="border-t border-line px-5 py-3 text-[12.5px] text-bad-ink">{backendError}</div>}
        </Card>

        {d && (
          <Card>
            <CardHeader title="Decision" />
            <div className="px-5 py-3">
              <KV k="Outcome" v={<Pill tone={d.status === "PAID" ? "ok" : "warn"}>{d.status}</Pill>} />
              <KV k="Final reviewer" v={d.verdict} />
              <KV k="Net payable" v={money(live.overlay!.net)} />
              <KV k="Paid now" v={money(d.paidNow)} />
              <KV k="Fraud score" v={`${live.overlay!.fraudScore} · ${live.overlay!.fraudBand}`} />
              {p && <KV k="Transfer" v={<span className="font-mono">{p.id}</span>} />}
            </div>
            <p className="border-t border-line px-5 py-3 text-[12.5px] leading-relaxed text-ink-2">{d.summary}</p>
            {p?.dashboardUrl && p.id !== "DRY_RUN" && (
              <a href={p.dashboardUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 border-t border-line px-5 py-3 text-[13px] font-medium text-primary-ink hover:underline">
                Open in Stripe Dashboard <ExternalLink className="size-3.5" />
              </a>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

"use client";

import { ArrowRight, CheckCircle2, Clock, ExternalLink, MessageSquareText, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { backend, type Answer } from "@/lib/backend";
import { money } from "@/lib/format";
import { useStore, type Decision } from "@/lib/store";
import type { Claim, ClaimStatus, LogEvent } from "@/lib/types";
import type { DrawerTarget } from "../doc-drawer";
import { Card, CardHeader, Clause, CopyId, KV, OutcomePill, Pill, cx } from "../ui";

function DocChip({ id, onClick }: { id: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-5 rounded-[4px] border border-line bg-white px-1.5 font-mono text-[11px] text-ink-2 hover:border-primary hover:text-primary">
      {id}
    </button>
  );
}

export function LinesTab({ claim, ready, openDoc }: { claim: Claim; ready: boolean; openDoc: (t: DrawerTarget) => void }) {
  const citesFor = (line: number) =>
    claim.findings
      .filter((f) => f.lines?.includes(line))
      .flatMap((f) => f.cites.map((c) => ({ ...c, tone: f.side === "for" ? ("for" as const) : f.side === "against" ? ("against" as const) : ("flag" as const) })));
  const totalClaimed = claim.lines.reduce((n, l) => n + l.claimedGbp, 0);
  const totalNet = claim.sections.reduce((n, s) => n + s.net, 0);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Line items" right={<span>{claim.lines.length} lines</span>} />
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th className="w-12 px-4 py-2 font-medium">Line</th>
              <th className="px-2 py-2 font-medium">Item</th>
              <th className="px-2 py-2 font-medium">Section</th>
              <th className="px-2 py-2 font-medium">Claimed</th>
              <th className="px-2 py-2 text-right font-medium">GBP</th>
              <th className="px-2 py-2 font-medium">Outcome</th>
              <th className="px-2 py-2 text-right font-medium">Payable</th>
              <th className="px-2 py-2 font-medium">Clauses</th>
              <th className="px-4 py-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {claim.lines.map((l) => (
              <tr key={l.line} className="border-b border-line-2 align-top last:border-b-0 hover:bg-canvas/60">
                <td className="px-4 py-2.5 tabular-nums text-muted">{l.line}</td>
                <td className="px-2 py-2.5">
                  <div className="text-ink">{l.description}</div>
                  <div className="text-[12px] text-muted">{ready ? l.reason : l.date}</div>
                </td>
                <td className="px-2 py-2.5 font-mono text-[12px]">{l.section}</td>
                <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-ink-2">{l.claimed}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{money(l.claimedGbp)}</td>
                <td className="px-2 py-2.5">{ready ? <OutcomePill outcome={l.outcome} /> : <OutcomePill outcome="PEND" />}</td>
                <td className={cx("px-2 py-2.5 text-right font-semibold tabular-nums", ready && l.payable === 0 && "text-faint")}>{ready ? money(l.payable) : "—"}</td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1">{ready && l.clauses.map((c) => <Clause key={c} id={c} />)}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {l.evidence.map((e) => (
                      <DocChip key={e} id={e} onClick={() => openDoc({ doc: e, quotes: citesFor(l.line), title: `Line ${l.line} · ${l.description}` })} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader title="Settlement" right={<span>CHG-TRV 7.5</span>} />
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-2 py-2 text-right font-medium">Eligible</th>
              <th className="px-2 py-2 font-medium">Limit</th>
              <th className="px-2 py-2 text-right font-medium">Excess</th>
              <th className="px-4 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {claim.sections.map((s) => (
              <tr key={s.section} className="border-b border-line-2">
                <td className="px-4 py-2.5">{s.section}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{ready ? money(s.eligible) : "—"}</td>
                <td className="px-2 py-2.5 text-muted">{s.limit}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{ready ? (s.excess ? `−${money(s.excess)}` : "nil") : "—"}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{ready ? money(s.net) : "—"}</td>
              </tr>
            ))}
            <tr className="bg-canvas">
              <td className="px-4 py-2.5 font-semibold">Total</td>
              <td className="px-2 py-2.5 text-right text-muted">claimed {money(totalClaimed)}</td>
              <td />
              <td />
              <td className="px-4 py-2.5 text-right text-[15px] font-semibold tabular-nums">{ready ? money(totalNet) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AuthorityTab({ claim, ready, held }: { claim: Claim; ready: boolean; held?: boolean }) {
  const score = claim.fraud.filter((f) => f.triggered && !(held && f.pending)).reduce((n, f) => n + f.weight, 0);
  if (!ready) return <div className="rounded-lg border border-dashed border-line py-16 text-center text-[13px] text-faint">Authority is checked by the Decision agent after the Evidence Pack is complete.</div>;
  const blocked = claim.authority.some((a) => !a.pass || (held && a.pending));
  return (
    <div className="grid grid-cols-2 gap-5">
      <Card>
        <CardHeader
          title="Authority · SAP-01 §3"
          right={held ? <Pill tone="warn">Payment held</Pill> : !blocked ? <Pill tone="ok">T0 may pay</Pill> : <Pill tone="warn">Refer to {claim.tier}</Pill>}
        />
        <div className="divide-y divide-line-2">
          {claim.authority.map((a) => {
            const pending = held && a.pending;
            return (
              <div key={a.id} className={cx("flex items-center gap-3 px-4 py-2.5 text-[13px]", pending && "bg-[#eef9fd]")}>
                {pending ? <Clock className="size-4 shrink-0 text-info-ink" /> : a.pass ? <CheckCircle2 className="size-4 shrink-0 text-[#1ea672]" /> : <XCircle className="size-4 shrink-0 text-bad-ink" />}
                <span className="w-8 shrink-0 font-mono text-[12px] text-muted">{a.id}</span>
                <span className="flex-1 text-ink">{a.rule}</span>
                <span className={cx("text-right text-[12px]", pending ? "font-medium text-info-ink" : a.pass ? "text-muted" : "font-medium text-bad-ink")}>{pending ? a.pending : a.note}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Fraud screen · FRD-03"
          right={
            <span className="flex items-center gap-2">
              <b className="tabular-nums text-ink">{score}</b>
              {held ? <Pill>Incomplete</Pill> : <Pill tone={claim.fraudBand === "Green" ? "ok" : claim.fraudBand === "Amber" ? "warn" : "bad"}>{claim.fraudBand}</Pill>}
            </span>
          }
        />
        <div className="px-4 pt-3">
          <div className="relative h-2 overflow-hidden rounded-full bg-line-2">
            <span className="absolute inset-y-0 left-0 w-[50%] bg-[#d7f7c2]" />
            <span className="absolute inset-y-0 left-[50%] w-[30%] bg-[#fcedb9]" />
            <span className="absolute inset-y-0 left-[80%] right-0 bg-[#ffe7f2]" />
            <span className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-ink transition-all duration-700" style={{ left: `${Math.min(100, (score / 50) * 100)}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>0</span>
            <span className="ml-[22%]">25 Amber</span>
            <span>40 Red</span>
          </div>
        </div>
        <div className="mt-2 divide-y divide-line-2">
          {claim.fraud.map((f) => {
            const pending = held && f.pending;
            return (
              <div key={f.id} className={cx("flex items-center gap-3 px-4 py-2 text-[13px]", pending ? "bg-[#eef9fd]" : f.triggered && "bg-warn-bg/40")}>
                <span className="w-7 shrink-0 font-mono text-[12px] text-muted">{f.id}</span>
                <span className={cx("flex-1", f.triggered && !pending ? "font-medium text-ink" : "text-ink-2")}>{f.label}</span>
                <span className={cx("w-52 truncate text-right text-[12px]", pending ? "text-info-ink" : "text-muted")}>{pending ? f.pending : f.note}</span>
                <span className={cx("w-8 text-right tabular-nums", pending ? "text-info-ink" : f.triggered ? "font-semibold text-warn-ink" : "text-faint")}>{pending ? "?" : f.triggered ? `+${f.weight}` : "0"}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function PaymentTab({ claim, status, decision, ready, openDoc }: { claim: Claim; status: ClaimStatus; decision?: Decision; ready: boolean; openDoc: (t: DrawerTarget) => void }) {
  const p = claim.payment;
  const id = decision?.payoutId ?? (ready && status === "paid" ? p.id : "");
  const amount = decision?.action === "approved" ? decision.amount : p.amount;
  const exists = !!id && decision?.action !== "declined";
  const stateLabel = status === "paid" ? "Paid" : status === "approved" ? "In transit" : status === "declined" ? "Cancelled" : "Not created";
  const tone = status === "paid" ? "ok" : status === "approved" ? "info" : status === "declined" ? "bad" : "neutral";
  const event = {
    id: exists ? id : null,
    object: "transfer",
    amount: Math.round(amount * 100),
    currency: "gbp",
    source: "Strype Assurance · claims balance",
    destination: p.payeeToken,
    status: status === "paid" ? "paid" : status === "approved" ? "in_transit" : "not_created",
    statement_descriptor: p.reference,
    metadata: { claim_id: claim.id, approved_by: decision?.by ?? (claim.route === "agent" ? "agent:T0" : null), evidence_pack: `ep_${claim.id.slice(-4)}_v${claim.episodes?.length ?? 1}` },
    livemode: false,
  };
  const paidLines = claim.lines.filter((l) => l.payable > 0);
  const citesFor = (line: number) =>
    claim.findings.filter((f) => f.lines?.includes(line)).flatMap((f) => f.cites.map((c) => ({ ...c, tone: f.side === "for" ? ("for" as const) : f.side === "against" ? ("against" as const) : ("flag" as const) })));
  const excess = claim.sections.reduce((n, s) => n + s.excess, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <Card>
          <div className="border-b border-line p-5">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Transfer</div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-[28px] font-semibold tabular-nums tracking-tight">{money(amount)}</span>
              <span className="text-[14px] text-muted">GBP</span>
              <Pill tone={tone} dot={status === "approved"}>{stateLabel}</Pill>
            </div>
            {!exists && status === "needs_review" && <div className="mt-1 text-[13px] text-muted">Waiting for {claim.tier} approval.</div>}
            {!exists && (status === "awaiting_evidence" || status === "triaging") && <div className="mt-1 text-[13px] text-muted">Held until the fraud screen is complete.</div>}
            <div className="mt-4 flex items-center gap-3 text-[13px]">
              <div className="min-w-0 flex-1 rounded-md border border-line px-3 py-2">
                <div className="text-[11px] text-muted">From</div>
                <div className="truncate font-medium text-ink">Strype Assurance</div>
                <div className="text-[12px] text-muted">Claims balance</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-faint" />
              <div className="min-w-0 flex-1 rounded-md border border-line px-3 py-2">
                <div className="text-[11px] text-muted">To</div>
                <div className="truncate font-medium text-ink">{p.payee}</div>
                <div className="text-[12px] text-muted">{p.account} · verified</div>
              </div>
            </div>
          </div>
          <div className="px-5 py-3">
            <KV k="ID" v={exists ? <CopyId value={id} /> : "—"} />
            <KV k="Payee token" v={p.payeeToken} mono />
            <KV k="Statement descriptor" v={p.reference} mono />
            <KV k="Idempotency key" v={p.idempotencyKey} mono />
            <KV k="Approved by" v={exists ? (decision?.by ?? p.approvedBy) : "—"} />
            {exists && p.dashboardUrl && p.id !== "DRY_RUN" && (
              <KV
                k="Stripe"
                v={
                  <a href={p.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-ink hover:underline">
                    View transfer in Dashboard <ExternalLink className="size-3" />
                  </a>
                }
              />
            )}
            <KV k="Created" v={exists ? (decision?.at ?? p.created ?? "—") : "—"} />
            {decision?.note && <KV k="Note" v={decision.note} />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Event data" right={<span className="font-mono text-[12px]">{status === "paid" ? "transfer.paid" : exists ? "transfer.created" : "—"}</span>} />
          <div className="p-4">
            <pre className="overflow-x-auto rounded-md bg-[#0a2540] p-4 font-mono text-[12px] leading-relaxed text-[#c1c9d2]">{JSON.stringify(event, null, 2)}</pre>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Every pound" right={<span>{paidLines.length} paid lines · each traced to a clause and a document</span>} />
        <table className="w-full text-[13px]">
          <tbody>
            {paidLines.map((l) => (
              <tr key={l.line} className="border-b border-line-2">
                <td className="w-14 px-4 py-2.5 tabular-nums text-muted">L{l.line}</td>
                <td className="px-2 py-2.5 text-ink">{l.description}</td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {l.clauses.map((c) => (
                      <Clause key={c} id={c} />
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {l.evidence.map((e) => (
                      <DocChip key={e} id={e} onClick={() => openDoc({ doc: e, quotes: citesFor(l.line), title: `Line ${l.line} · ${l.description}` })} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(l.payable)}</td>
              </tr>
            ))}
            {excess > 0 && (
              <tr className="border-b border-line-2">
                <td className="px-4 py-2.5 text-muted">—</td>
                <td className="px-2 py-2.5 text-ink">Excess</td>
                <td className="px-2 py-2.5">
                  <Clause id="C5" />
                </td>
                <td />
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-bad-ink">−{money(excess)}</td>
              </tr>
            )}
            <tr className="bg-canvas">
              <td colSpan={4} className="px-4 py-2.5 font-semibold">
                Total transferred
              </td>
              <td className="px-4 py-2.5 text-right text-[15px] font-semibold tabular-nums">{money(claim.net)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function LogsTab({ logs }: { logs: LogEvent[] }) {
  return (
    <Card>
      <CardHeader title={<span>Logs <span className="ml-1 font-normal text-muted">{logs.length}</span></span>} />
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-muted">
            <th className="px-4 py-2 font-medium">Event</th>
            <th className="px-2 py-2 font-medium">Detail</th>
            <th className="px-2 py-2 font-medium">Actor</th>
            <th className="px-4 py-2 text-right font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="fade-in border-b border-line-2 last:border-b-0">
              <td className="px-4 py-2.5 font-mono text-[12px] text-ink">{l.type}</td>
              <td className="px-2 py-2.5 text-ink-2">{l.detail}</td>
              <td className="px-2 py-2.5 font-mono text-[12px] text-muted">{l.actor}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted">{l.at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AskBox({ claim, openDoc }: { claim: Claim; openDoc: (t: DrawerTarget) => void }) {
  const { live } = useStore();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; a: Answer } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!live) return null;
  const submit = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      setAnswer({ q: question, a: await backend.ask(claim.id, question) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-5">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Ask the agent · answered from Cognee memory</div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Why did you pay £25.09 for the Sintra pharmacy receipt?"
          className="h-9 min-w-0 flex-1 rounded-md border border-line px-3 text-[14px] outline-none focus:border-primary"
        />
        <button type="submit" disabled={busy || !q.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[14px] font-medium text-white disabled:opacity-50">
          <Send className="size-3.5" /> {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      {error && <div className="mt-3 text-[13px] text-bad-ink">{error}</div>}
      {answer && (
        <div className="mt-4">
          <div className="text-[14px] font-semibold">{answer.q}</div>
          <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{answer.a.text}</p>
          {answer.a.references.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {answer.a.references.map((r) =>
                /^(E\d|M\d|0\d)/.test(r) ? (
                  <DocChip key={r} id={r} onClick={() => openDoc({ doc: r, quotes: [], title: answer.q })} />
                ) : (
                  <Clause key={r} id={r} />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ExplainTab({ claim, ready, openDoc }: { claim: Claim; ready: boolean; openDoc: (t: DrawerTarget) => void }) {
  return (
    <div className="space-y-5">
      <AskBox claim={claim} openDoc={openDoc} />
      <CannedWhy claim={claim} ready={ready} openDoc={openDoc} />
    </div>
  );
}

function CannedWhy({ claim, ready, openDoc }: { claim: Claim; ready: boolean; openDoc: (t: DrawerTarget) => void }) {
  const [i, setI] = useState(0);
  if (!ready) return <div className="rounded-lg border border-dashed border-line py-16 text-center text-[13px] text-faint">Available once the Evidence Pack is complete.</div>;
  const w = claim.why[i];
  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-5">
      <div className="space-y-1.5">
        {claim.why.map((q, n) => (
          <button
            key={q.q}
            type="button"
            onClick={() => setI(n)}
            className={cx("flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13.5px]", n === i ? "border-primary bg-primary-soft text-primary-ink" : "border-line text-ink hover:bg-canvas")}
          >
            <MessageSquareText className="size-4 shrink-0" />
            {q.q}
          </button>
        ))}
      </div>
      <Card className="p-5">
        <div className="text-[15px] font-semibold">{w.q}</div>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{w.a}</p>
        <div className="mt-4 flex flex-wrap gap-1">
          {w.clauses.map((c) => (
            <Clause key={c} id={c} />
          ))}
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Evidence</div>
          {w.cites.map((c, n) => (
            <button
              key={n}
              type="button"
              onClick={() => openDoc({ doc: c.doc, quotes: w.cites.map((x) => ({ ...x, tone: "neutral" as const })), active: c.quote, title: w.q })}
              className="flex w-full items-start gap-2 rounded-md border border-line px-2 py-1.5 text-left text-[12.5px] hover:border-primary/50 hover:bg-primary-soft"
            >
              <span className="mt-px shrink-0 rounded bg-white px-1 font-mono text-[11px] font-medium text-ink-2 ring-1 ring-line">{c.doc}</span>
              <span className="text-ink-2">“{c.quote.trim()}”</span>
            </button>
          ))}
        </div>
        <div className="mt-4 text-[12px] text-muted">Answered from Evidence Pack ep_{claim.id.slice(-4)}_v1 in claim memory.</div>
      </Card>
    </div>
  );
}

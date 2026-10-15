"use client";

import { AlertTriangle, CheckCircle2, FileText, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { COMPANY_DOCS } from "@/lib/data";
import { money } from "@/lib/format";
import type { Claim, ClaimStatus, Finding } from "@/lib/types";
import { DocumentViewer, type HL } from "../doc-viewer";
import { Clause, Pill, cx } from "../ui";

const sideTone = { for: "for", against: "against", flag: "flag" } as const;

function FindingCard({ f, claim, selected, activeCite, onSelect, onCite }: { f: Finding; claim: Claim; selected: boolean; activeCite: number; onSelect: () => void; onCite: (i: number) => void }) {
  const agent = claim.agents.find((a) => a.id === f.agent);
  const neg = f.impact?.startsWith("−");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cx(
        "fade-in cursor-pointer rounded-lg border bg-white p-3 text-left transition-shadow",
        selected ? "border-primary shadow-[0_0_0_3px_rgba(99,91,255,0.15)]" : "border-line hover:border-[#c9d1db] hover:shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13.5px] font-semibold leading-snug text-ink">{f.title}</div>
        {f.impact && <span className={cx("shrink-0 text-[13px] font-semibold tabular-nums", neg ? "text-bad-ink" : "text-ok-ink")}>{f.impact}</span>}
      </div>
      <p className={cx("mt-1 text-[12.5px] leading-snug text-muted", !selected && "line-clamp-2")}>{f.detail}</p>
      {selected && (
        <div className="mt-2.5 space-y-1.5">
          {f.cites.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCite(i);
              }}
              className={cx(
                "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors",
                activeCite === i ? "border-primary/40 bg-primary-soft" : "border-line hover:bg-canvas",
              )}
            >
              <span className="mt-px shrink-0 rounded bg-white px-1 font-mono text-[11px] font-medium text-ink-2 ring-1 ring-line">{c.doc}</span>
              <span className="line-clamp-2 text-ink-2">“{c.quote.trim()}”</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {f.clauses.map((c) => (
          <Clause key={c} id={c} />
        ))}
        {f.lines?.length ? <span className="ml-1 text-[11px] text-muted">Line {f.lines.join(", ")}</span> : null}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-faint">
          <FileText className="size-3" />
          {f.cites.length} · {agent?.name}
        </span>
      </div>
    </div>
  );
}

interface ColumnProps {
  title: string;
  icon: React.ReactNode;
  items: Finding[];
  empty: string;
  claim: Claim;
  sel: string | null;
  activeCite: number;
  setSel: (id: string) => void;
  setCite: (i: number) => void;
}

function Column({ title, icon, items, empty, ...rest }: ColumnProps) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2">
        {icon}
        {title}
        <span className="font-normal text-faint">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            claim={rest.claim}
            selected={rest.sel === f.id}
            activeCite={rest.activeCite}
            onSelect={() => rest.setSel(f.id)}
            onCite={rest.setCite}
          />
        ))}
        {!items.length && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">{empty}</div>}
      </div>
    </div>
  );
}

export function ReviewTab({ claim, findings, status, done, focus }: { claim: Claim; findings: Finding[]; status: ClaimStatus; done: boolean; focus?: string | null }) {
  const [sel, setSel] = useState<string | null>(null);
  const [cite, setCite] = useState(0);
  const [docId, setDocId] = useState("CF");

  const forF = findings.filter((f) => f.side === "for");
  const against = findings.filter((f) => f.side === "against");
  const flags = findings.filter((f) => f.side === "flag");

  // default selection: the first finding against, so the viewer opens on a highlight
  useEffect(() => {
    if (sel || !findings.length) return;
    const first = findings.find((f) => f.side === "against") ?? findings[0];
    setSel(first.id);
    setCite(0);
    setDocId(first.cites[0]?.doc ?? "CF");
  }, [findings, sel]);

  useEffect(() => {
    if (!focus) return;
    const f = claim.findings.find((x) => x.id === focus);
    if (!f) return;
    setSel(f.id);
    setCite(0);
    setDocId(f.cites[0]?.doc ?? "CF");
  }, [focus, claim.findings]);

  const selected = findings.find((f) => f.id === sel);

  function choose(id: string) {
    const f = findings.find((x) => x.id === id);
    setSel(id);
    setCite(0);
    if (f?.cites[0]) setDocId(f.cites[0].doc);
  }
  function chooseCite(i: number) {
    setCite(i);
    if (selected?.cites[i]) setDocId(selected.cites[i].doc);
  }

  const highlights: HL[] = useMemo(() => {
    if (!selected) return [];
    return selected.cites
      .map((c, i) => ({ ...c, i }))
      .filter((c) => c.doc === docId)
      .map((c) => ({ quote: c.quote, tone: sideTone[selected.side], active: c.i === cite }));
  }, [selected, docId, cite]);

  const docs = useMemo(() => [...claim.documents, ...COMPANY_DOCS], [claim.documents]);
  const rec = claim.recommendation === "DECLINE" ? "Decline" : claim.recommendation === "SETTLE" ? "Pay in full" : "Pay in part";
  const colProps = { claim, sel, activeCite: cite, setSel: choose, setCite: chooseCite };

  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5">
      <div className="min-w-0 space-y-5">
        <div className="rounded-lg border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Agent recommendation</div>
            {done ? (
              <div className="flex items-center gap-2">
                <Pill tone={claim.recommendation === "DECLINE" ? "bad" : claim.recommendation === "SETTLE" ? "ok" : "info"}>{rec}</Pill>
                <span className="text-[15px] font-semibold tabular-nums">{money(claim.net)}</span>
              </div>
            ) : (
              <Pill tone="primary" dot>
                Agents working
              </Pill>
            )}
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            {done ? claim.summary : "Findings appear here as each agent writes them. The recommendation is made once the Decision agent has checked authority."}
          </p>
          {done && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line-2 pt-3 text-[12px] text-muted">
              <span>
                Route <b className="font-semibold text-ink">{claim.route === "agent" ? "Agent · T0" : `Human · ${claim.tier}`}</b>
              </span>
              <span>
                Status <b className="font-semibold text-ink">{status.replace("_", " ")}</b>
              </span>
              <span>
                Wording <b className="font-semibold text-ink">{claim.wording}</b>
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Column title="For" icon={<CheckCircle2 className="size-3.5 text-ok-ink" />} items={forF} empty="Nothing yet" {...colProps} />
          <Column title="Against" icon={<XCircle className="size-3.5 text-bad-ink" />} items={against} empty="Nothing against" {...colProps} />
        </div>

        {(flags.length > 0 || !done) && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              <AlertTriangle className="size-3.5 text-warn-ink" />
              Flags
              <span className="font-normal text-faint">{flags.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {flags.map((f) => (
                <FindingCard key={f.id} f={f} claim={claim} selected={sel === f.id} activeCite={cite} onSelect={() => choose(f.id)} onCite={chooseCite} />
              ))}
              {!flags.length && <div className="col-span-2 rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12px] text-faint">Nothing yet</div>}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="sticky top-4">
          <DocumentViewer docs={docs} docId={docId} onDocChange={setDocId} highlights={highlights} claimId={claim.id} className="h-[calc(100vh-150px)]" />
        </div>
      </div>
    </div>
  );
}

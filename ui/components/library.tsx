"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { COMPANY_DOCS } from "@/lib/data";
import { DocumentViewer } from "./doc-viewer";
import { Pill, cx } from "./ui";

const META: Record<string, { use: string; status: "current" | "superseded" | "not contractual" }> = {
  POL: { use: "Coverage, limits, exclusions", status: "current" },
  POL24: { use: "Older policies only", status: "superseded" },
  CHG: { use: "How agents assess", status: "current" },
  SAP: { use: "Agent authority, £1,000 limit", status: "current" },
  FRD: { use: "Fraud indicators and bands", status: "current" },
  FX: { use: "Cash conversions", status: "current" },
  LTR: { use: "Customer letters", status: "current" },
  BRO: { use: "Never used for decisions", status: "not contractual" },
};

export function Library() {
  const [sel, setSel] = useState("POL");
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-[400px_minmax(0,1fr)] gap-5 px-6 pb-8 pt-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">Policy library</h1>
        <div className="mt-1 text-[13px] text-muted">Larkspur Assurance · Travel · {COMPANY_DOCS.length} documents</div>
        <div className="mt-5 overflow-hidden rounded-lg border border-line">
          {COMPANY_DOCS.map((d) => {
            const m = META[d.id];
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSel(d.id)}
                className={cx("flex w-full items-start gap-3 border-b border-line-2 px-4 py-3 text-left last:border-b-0", sel === d.id ? "bg-primary-soft" : "hover:bg-canvas")}
              >
                <FileText className={cx("mt-0.5 size-4 shrink-0", sel === d.id ? "text-primary" : "text-muted")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink">{d.title}</span>
                    <span className="font-mono text-[11px] text-muted">{d.id}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-muted">{m?.use}</span>
                    {m && m.status !== "current" && <Pill tone={m.status === "superseded" ? "neutral" : "warn"}>{m.status === "superseded" ? "Superseded" : "Not contractual"}</Pill>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <DocumentViewer docs={COMPANY_DOCS} docId={sel} onDocChange={setSel} highlights={[]} className="h-[calc(100vh-110px)]" />
    </div>
  );
}

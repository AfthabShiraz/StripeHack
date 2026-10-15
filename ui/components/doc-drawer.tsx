"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { COMPANY_DOCS } from "@/lib/data";
import type { Cite, Claim } from "@/lib/types";
import { DocumentViewer } from "./doc-viewer";

export interface DrawerTarget {
  doc: string;
  quotes: Cite[];
  active?: string;
  title?: string;
}

export function DocDrawer({ claim, target, onClose }: { claim: Claim; target: DrawerTarget | null; onClose: () => void }) {
  const [docId, setDocId] = useState(target?.doc ?? "");
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    if (target) setDocId(target.doc);
  }
  useEffect(() => {
    if (!target) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [target, onClose]);
  if (!target) return null;
  const docs = [...claim.documents, ...COMPANY_DOCS];
  const hls = target.quotes
    .filter((q) => q.doc === docId)
    .map((q) => ({ quote: q.quote, tone: q.tone ?? "neutral", active: q.quote === target.active }));
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onMouseDown={onClose}>
      <div className="slide-in flex h-full w-[min(760px,92vw)] flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{target.title ?? "Document"}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 p-3">
          <DocumentViewer docs={docs} docId={docId} onDocChange={setDocId} highlights={hls} claimId={claim.id} className="flex-1" />
        </div>
      </div>
    </div>
  );
}

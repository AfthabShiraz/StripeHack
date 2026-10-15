"use client";

import { ChevronDown, Download, FileText, Minus, Plus } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { type Block, isPlain, paginate, parseBlocks } from "@/lib/doc";
import type { Cite, RawDoc } from "@/lib/types";
import { cx } from "./ui";

export interface HL {
  quote: string;
  tone: NonNullable<Cite["tone"]>;
  active?: boolean;
}

function highlight(text: string, hls: HL[], keyBase: string): React.ReactNode {
  if (!hls.length || !text) return text;
  const ranges: { s: number; e: number; hl: HL }[] = [];
  for (const hl of hls) {
    if (!hl.quote) continue;
    let i = text.indexOf(hl.quote);
    while (i !== -1) {
      ranges.push({ s: i, e: i + hl.quote.length, hl });
      i = text.indexOf(hl.quote, i + hl.quote.length);
    }
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a.s - b.s || Number(b.hl.active) - Number(a.hl.active) || b.e - a.e);
  const out: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach((r, n) => {
    if (r.s < pos) return;
    if (r.s > pos) out.push(text.slice(pos, r.s));
    out.push(
      <mark key={`${keyBase}-${n}`} data-active={r.hl.active ? "1" : undefined} className={cx("hl", `hl-${r.hl.tone}`, r.hl.active && "hl-active")}>
        {text.slice(r.s, r.e)}
      </mark>,
    );
    pos = r.e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function BlockView({ b, hls, k }: { b: Block; hls: HL[]; k: string }) {
  switch (b.type) {
    case "pre":
      return <div className="min-h-[1.55em] whitespace-pre font-mono text-[11.5px] leading-[1.55] text-[#1f2933]">{highlight(b.text, hls, k)}</div>;
    case "h1":
      return <h1 className="mb-3 mt-1 text-[17px] font-bold tracking-tight text-[#111]">{highlight(b.text, hls, k)}</h1>;
    case "h2":
      return <h2 className="mb-2 mt-4 text-[14px] font-bold text-[#111]">{highlight(b.text, hls, k)}</h2>;
    case "h3":
      return <h3 className="mb-1.5 mt-3 text-[13px] font-semibold text-[#111]">{highlight(b.text, hls, k)}</h3>;
    case "li":
      return <div className="mb-1 flex gap-2 pl-2 text-[12.5px] leading-[1.6]"><span>•</span><span>{highlight(b.text, hls, k)}</span></div>;
    case "quote":
      return <div className="mb-1 border-l-2 border-[#ccd2da] pl-3 text-[12.5px] italic leading-[1.6] text-[#4a5361]">{highlight(b.text, hls, k)}</div>;
    case "hr":
      return <hr className="my-4 border-[#d9dee5]" />;
    case "table":
      return (
        <table className="mb-3 mt-1 w-full border-collapse text-[11.5px] leading-snug">
          <tbody>
            {b.rows.map((row, ri) => (
              <tr key={ri} className={cx(ri === 0 && b.header && "bg-[#f1f3f6] font-semibold")}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-[#d9dee5] px-2 py-1 align-top">
                    {highlight(cell, hls, `${k}-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return <p className="mb-2 text-[12.5px] leading-[1.6] text-[#1f2933]">{highlight(b.text, hls, k)}</p>;
  }
}

export function DocumentViewer({
  docs,
  docId,
  onDocChange,
  highlights,
  claimId,
  className,
}: {
  docs: RawDoc[];
  docId: string;
  onDocChange?: (id: string) => void;
  highlights: HL[];
  claimId?: string;
  className?: string;
}) {
  const doc = docs.find((d) => d.id === docId) ?? docs[0];
  const plain = doc ? isPlain(doc) : false;
  const pages = useMemo(() => (doc ? paginate(parseBlocks(doc), plain) : []), [doc, plain]);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const activeKey = highlights.find((h) => h.active)?.quote ?? "";

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      const m = el.querySelector('mark[data-active="1"]') as HTMLElement | null;
      if (m) {
        const top = m.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - el.clientHeight / 3;
        el.scrollTo({ top, behavior: "smooth" });
      } else el.scrollTo({ top: 0 });
    }, 60);
    return () => window.clearTimeout(t);
  }, [docId, activeKey]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const kids = Array.from(el.querySelectorAll("[data-page]")) as HTMLElement[];
    const mid = el.scrollTop + el.clientHeight / 2;
    let p = 1;
    for (const k of kids) if (k.offsetTop <= mid) p = Number(k.dataset.page);
    setPage(p);
  }

  function download() {
    if (!doc) return;
    const blob = new Blob([doc.text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = doc.name.replace(/\.pdf$/, ".txt");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!doc) return null;
  const hlCount = highlights.length;

  return (
    <div className={cx("flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-[#e9edf2]", className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-white px-3">
        <FileText className="size-4 shrink-0 text-muted" />
        <div className="relative min-w-0 flex-1">
          <select
            value={doc.id}
            onChange={(e) => onDocChange?.(e.target.value)}
            disabled={!onDocChange}
            className="h-7 w-full max-w-full cursor-pointer appearance-none truncate rounded-md bg-transparent pr-6 text-[13px] font-medium text-ink hover:bg-canvas focus:outline-none disabled:cursor-default disabled:hover:bg-transparent"
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} · {d.name}
              </option>
            ))}
          </select>
          {onDocChange && <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-muted" />}
        </div>
        {hlCount > 0 && (
          <span className="hidden shrink-0 rounded-[4px] bg-neutral-bg px-1.5 py-0.5 text-[11px] font-medium text-neutral-ink xl:inline">
            {hlCount} cited
          </span>
        )}
        <span className="shrink-0 text-[12px] tabular-nums text-muted">
          {page} / {pages.length}
        </span>
        <div className="flex shrink-0 items-center rounded-md border border-line">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(1)))} className="flex size-6 items-center justify-center text-muted hover:text-ink">
            <Minus className="size-3" />
          </button>
          <span className="w-9 text-center text-[11px] tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))} className="flex size-6 items-center justify-center text-muted hover:text-ink">
            <Plus className="size-3" />
          </button>
        </div>
        <button type="button" onClick={download} title="Download" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
          <Download className="size-3.5" />
        </button>
      </div>
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto px-5 py-5">
        <div style={{ zoom }} className="mx-auto flex max-w-[640px] flex-col gap-5">
          {pages.map((blocks, pi) => (
            <div key={`${doc.id}-${pi}`} data-page={pi + 1} className="paper relative min-h-[400px] bg-white px-10 pb-12 pt-9">
              {blocks.map((b, bi) => (
                <Fragment key={bi}>
                  <BlockView b={b} hls={highlights} k={`${pi}-${bi}`} />
                </Fragment>
              ))}
              <div className="absolute inset-x-10 bottom-4 flex justify-between font-mono text-[9.5px] text-[#9aa3af]">
                <span>{claimId ? `${claimId} · ${doc.id}` : doc.id}</span>
                <span>
                  Page {pi + 1} of {pages.length}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

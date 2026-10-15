"use client";

import { Bot, Inbox, Paperclip, Send } from "lucide-react";
import { useState } from "react";
import type { Claim } from "@/lib/types";
import type { DrawerTarget } from "../doc-drawer";
import { Pill, cx } from "../ui";
import { visibleEmails } from "./timeline";

export function EmailsTab({ claim, elapsed, focus, openDoc, onRun }: { claim: Claim; elapsed: number; focus?: string | null; openDoc: (t: DrawerTarget) => void; onRun: (episode: number) => void }) {
  const emails = visibleEmails(claim, elapsed).slice().reverse();
  const [pick, setPick] = useState<string | null>(focus ?? null);
  const [prevFocus, setPrevFocus] = useState(focus);
  if (focus !== prevFocus) {
    setPrevFocus(focus);
    if (focus) setPick(focus);
  }
  const sel = emails.find((m) => m.id === pick) ?? emails[0];
  const requests = claim.requests ?? [];
  const docTitle = (id: string) => claim.documents.find((d) => d.id === id)?.title ?? id;
  const autoCount = emails.filter((m) => m.auto).length;

  return (
    <div className="grid h-[calc(100vh-150px)] min-h-[520px] grid-cols-[360px_minmax(0,1fr)] overflow-hidden rounded-lg border border-line">
      <div className="flex min-h-0 flex-col border-r border-line">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4 text-[13px]">
          <span className="font-semibold">Correspondence</span>
          <span className="text-muted">
            {emails.length} · {autoCount} sent by agent
          </span>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-line-2 overflow-y-auto">
          {emails.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPick(m.id)}
              className={cx("fade-in block w-full px-4 py-3 text-left", sel?.id === m.id ? "bg-primary-soft" : "hover:bg-canvas")}
            >
              <div className="flex items-center gap-2">
                {m.direction === "out" ? <Send className="size-3.5 shrink-0 text-[#d0478a]" /> : <Inbox className="size-3.5 shrink-0 text-info-ink" />}
                <span className="truncate text-[13px] font-semibold text-ink">{m.direction === "out" ? "To customer" : m.from.split(" <")[0]}</span>
                {m.auto && <Pill tone="primary">Agent</Pill>}
                <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted">{m.at}</span>
              </div>
              <div className="mt-0.5 truncate text-[13px] text-ink-2">{m.subject}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                {m.attachments && (
                  <span className="flex items-center gap-1">
                    <Paperclip className="size-3" />
                    {m.attachments.length}
                  </span>
                )}
                {m.requests && <span>{m.requests.length} requested</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {sel && (
        <div className="min-h-0 overflow-y-auto">
          <div className="border-b border-line px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-[17px] font-semibold text-ink">{sel.subject}</h2>
              {sel.auto && (
                <button type="button" onClick={() => onRun(sel.episode)} className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline">
                  <Bot className="size-3.5" />
                  Written by Customer emails agent
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-[56px_1fr] gap-y-0.5 text-[13px]">
              <span className="text-muted">From</span>
              <span className="text-ink-2">{sel.from}</span>
              <span className="text-muted">To</span>
              <span className="text-ink-2">{sel.to}</span>
              <span className="text-muted">Date</span>
              <span className="text-ink-2">{sel.at}</span>
            </div>
          </div>
          <div className="whitespace-pre-wrap px-6 py-5 text-[14px] leading-relaxed text-ink">{sel.body}</div>
          {sel.attachments && (
            <div className="border-t border-line-2 px-6 py-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Attachments</div>
              <div className="flex flex-wrap gap-2">
                {sel.attachments.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => openDoc({ doc: d, quotes: [], title: docTitle(d) })}
                    className="flex h-8 items-center gap-2 rounded-md border border-line px-2.5 text-[12.5px] text-ink-2 hover:border-primary hover:text-primary"
                  >
                    <Paperclip className="size-3.5" />
                    <span className="font-mono text-[11px] font-medium">{d}</span>
                    {docTitle(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sel.requests && (
            <div className="border-t border-line-2 px-6 py-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Why the agent asked</div>
              <div className="space-y-2">
                {sel.requests.map((rid) => {
                  const r = requests.find((x) => x.id === rid);
                  if (!r) return null;
                  return (
                    <div key={rid} className="flex items-start gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
                      <span className="mt-px font-mono text-[11px] text-muted">{r.id}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink">{r.item}</div>
                        <div className="text-[12.5px] text-muted">{r.reason}</div>
                      </div>
                      <span className="shrink-0 rounded-[4px] border border-line bg-white px-1.5 font-mono text-[11px] text-ink-2">{r.clause}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

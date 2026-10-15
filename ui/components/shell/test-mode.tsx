"use client";

import { Play, RotateCcw, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LIVE_CLAIM_ID } from "@/lib/data";
import { useStore } from "@/lib/store";

export function TestMode() {
  const { spawn, resetDemo, spawnedAt, live, prepare, backendError } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-[4px] bg-[#fff1e0] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#b54708] hover:bg-[#ffe4c4]"
      >
        Test mode
      </button>
      {open && (
        <div className="fade-in absolute right-0 top-8 z-50 w-64 rounded-lg border border-line bg-white p-1 shadow-lg">
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Test data</div>
          <button
            type="button"
            disabled={spawnedAt !== null}
            onClick={() => {
              spawn();
              setOpen(false);
              router.push(`/claims/${LIVE_CLAIM_ID}`);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:text-faint"
          >
            <Zap className="size-3.5" />
            Simulate customer reply
          </button>
          <button
            type="button"
            onClick={() => {
              resetDemo();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas"
          >
            <RotateCcw className="size-3.5" />
            Reset demo
          </button>
          <div className="mx-2 my-1 border-t border-line" />
          <div className="px-3 py-1.5 text-[12px] text-muted">
            Backend: {live ? (live.exists ? `${live.status}${live.running ? " · running" : ""}` : "not prepared") : "offline (mock data)"}
            {live?.snapshot ? " · snapshot saved" : ""}
          </div>
          {live && !live.snapshot && (
            <button
              type="button"
              disabled={live.running}
              onClick={() => {
                prepare();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:text-faint"
            >
              <Play className="size-3.5" />
              Prepare claim (full agent run)
            </button>
          )}
          {backendError && <div className="px-3 pb-2 text-[12px] text-bad-ink">{backendError}</div>}
        </div>
      )}
    </div>
  );
}

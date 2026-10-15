"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClaimStatus, Outcome } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "primary";

const toneCls: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-ink",
  warn: "bg-warn-bg text-warn-ink",
  bad: "bg-bad-bg text-bad-ink",
  info: "bg-info-bg text-info-ink",
  neutral: "bg-neutral-bg text-neutral-ink",
  primary: "bg-primary-soft text-primary-ink",
};

export function Pill({ tone = "neutral", children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1.5 text-[12px] font-medium leading-none", toneCls[tone], className)}>
      {dot && <span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" /><span className="relative inline-flex size-1.5 rounded-full bg-current" /></span>}
      {children}
    </span>
  );
}

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  triaging: "Triaging",
  needs_review: "Needs review",
  auto_settled: "Auto-settled",
  approved: "Paying",
  declined: "Declined",
  paid: "Paid",
};

export function StatusPill({ status }: { status: ClaimStatus }) {
  const tone: Record<ClaimStatus, Tone> = { triaging: "primary", needs_review: "warn", auto_settled: "ok", approved: "info", declined: "bad", paid: "ok" };
  return (
    <Pill tone={tone[status]} dot={status === "triaging" || status === "approved"}>
      {STATUS_LABEL[status]}
    </Pill>
  );
}

export function OutcomePill({ outcome }: { outcome: Outcome }) {
  if (outcome === "PAY") return <Pill tone="ok">Pay</Pill>;
  if (outcome === "PAY_PARTIAL") return <Pill tone="info">Pay part</Pill>;
  if (outcome === "DECLINE") return <Pill tone="bad">Decline</Pill>;
  return <Pill tone="primary" dot>Assessing</Pill>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-line bg-white", className)}>{children}</div>;
}

export function CardHeader({ title, right, icon }: { title: React.ReactNode; right?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        {icon}
        {title}
      </div>
      {right && <div className="flex items-center gap-2 text-[13px] text-muted">{right}</div>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-primary text-white shadow-[0_1px_1px_rgba(0,0,0,0.12),inset_0_-1px_0_rgba(0,0,0,0.12)] hover:bg-primary-hover",
    secondary: "bg-white text-ink-2 border border-line shadow-[0_1px_1px_rgba(10,37,64,0.06)] hover:bg-canvas hover:text-ink",
    danger: "bg-white text-bad-ink border border-line shadow-[0_1px_1px_rgba(10,37,64,0.06)] hover:bg-bad-bg/60",
    ghost: "text-muted hover:text-ink hover:bg-canvas",
  };
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-8 px-3 text-[14px]",
        v[variant],
        className,
      )}
    />
  );
}

export function CopyId({ value, className }: { value: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard?.writeText(value).catch(() => {});
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
      className={cx("group inline-flex items-center gap-1.5 font-mono text-[12px] text-muted hover:text-ink", className)}
      title="Copy"
    >
      {value}
      {done ? <Check className="size-3 text-ok-ink" /> : <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: React.ReactNode; count?: number | string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-6 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px flex h-10 items-center gap-1.5 border-b-2 text-[14px] font-medium transition-colors",
            value === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cx("text-[12px] tabular-nums", value === t.id ? "text-primary" : "text-faint")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cx(
            "h-6 rounded-[5px] px-2.5 text-[13px] font-medium transition-colors",
            value === o ? "bg-white text-ink shadow-[0_1px_2px_rgba(10,37,64,0.12)]" : "text-muted hover:text-ink",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 pt-[14vh]" onMouseDown={onClose}>
      <div className="fade-in w-[480px] max-w-[calc(100vw-32px)] rounded-xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="text-[16px] font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-[14px] text-ink-2">{children}</div>
        <div className="flex justify-end gap-2 rounded-b-xl border-t border-line bg-canvas px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

export function KV({ k, v, mono }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={cx("min-w-0 truncate text-right text-ink", mono && "font-mono text-[12px]")}>{v}</span>
    </div>
  );
}

export function Clause({ id }: { id: string }) {
  return <span className="inline-flex h-5 items-center rounded-[4px] border border-line bg-white px-1.5 font-mono text-[11px] text-ink-2">{id}</span>;
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <defs>
        <linearGradient id="si-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#635bff" />
          <stop offset="0.6" stopColor="#a960ee" />
          <stop offset="1" stopColor="#ff7a59" />
        </linearGradient>
        <clipPath id="si-c">
          <rect width="28" height="28" rx="7" />
        </clipPath>
      </defs>
      <rect width="28" height="28" rx="7" fill="url(#si-g)" />
      <g clipPath="url(#si-c)" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" opacity="0.95">
        <path d="M5 18 L13 10" />
        <path d="M10 22 L22 10" />
        <path d="M17 23 L23 17" />
      </g>
    </svg>
  );
}

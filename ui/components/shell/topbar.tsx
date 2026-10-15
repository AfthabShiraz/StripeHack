import { ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";

export function Topbar({ crumbs, back, right }: { crumbs: { label: string; href?: string }[]; back?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="h-[3px] w-full bg-test" />
      <div className="flex h-[52px] items-center gap-3 px-6">
        {back && (
          <Link href={back} className="flex size-7 items-center justify-center rounded-md border border-line text-muted hover:bg-canvas hover:text-ink">
            <ArrowLeft className="size-3.5" />
          </Link>
        )}
        <nav className="flex min-w-0 items-center gap-2 text-[14px]">
          {crumbs.map((c, i) => (
            <span key={c.label} className="flex items-center gap-2">
              {i > 0 && <span className="text-faint">/</span>}
              {c.href ? (
                <Link href={c.href} className="text-muted hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span className="font-medium text-ink">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {right}
          <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-muted lg:flex">
            <Globe className="size-3" />
            Europe/London · stored UTC
          </span>
          <span className="rounded-[4px] bg-[#fff1e0] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#b54708]">Test mode</span>
        </div>
      </div>
    </header>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 overflow-y-auto">{children}</main>;
}

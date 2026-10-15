"use client";

import { BookOpen, FileStack, Home, Inbox, Landmark, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { REVIEWER, useAllClaimStates } from "@/lib/store";
import { Logo, cx } from "../ui";

function NavItem({ href, icon, label, active, badge, live }: { href: string; icon: React.ReactNode; label: string; active: boolean; badge?: number; live?: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[14px] font-medium transition-colors",
        active ? "bg-white text-primary shadow-[0_1px_2px_rgba(10,37,64,0.08)]" : "text-ink-2 hover:bg-white/70 hover:text-ink",
      )}
    >
      <span className={cx("flex size-4 items-center justify-center", active ? "text-primary" : "text-muted")}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={cx("flex h-[18px] min-w-[18px] items-center justify-center gap-1 rounded-full px-1.5 text-[11px] font-semibold tabular-nums", live ? "bg-primary text-white" : "bg-warn-bg text-warn-ink")}>
          {live && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
          {badge}
        </span>
      )}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Nav() {
  const path = usePathname();
  const params = useSearchParams();
  const view = params.get("view");
  const states = useAllClaimStates();
  const review = states.filter((s) => s.status === "needs_review").length;
  const triaging = states.filter((s) => s.status === "triaging").length;

  return (
    <>
      <Section title="Overview">
        <NavItem href="/" icon={<Home className="size-4" />} label="Home" active={path === "/"} />
      </Section>
      <Section title="Claims">
        <NavItem href="/claims" icon={<FileStack className="size-4" />} label="All claims" active={path.startsWith("/claims") && !view} />
        <NavItem href="/claims?view=review" icon={<Inbox className="size-4" />} label="Review queue" active={path === "/claims" && view === "review"} badge={review} />
        <NavItem href="/claims?view=triaging" icon={<Sparkles className="size-4" />} label="Live triage" active={path === "/claims" && view === "triaging"} badge={triaging} live />
      </Section>
      <Section title="Money">
        <NavItem href="/payouts" icon={<Landmark className="size-4" />} label="Payouts" active={path.startsWith("/payouts")} />
      </Section>
      <Section title="Knowledge">
        <NavItem href="/library" icon={<BookOpen className="size-4" />} label="Policy library" active={path.startsWith("/library")} />
      </Section>
    </>
  );
}

function SearchBox() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/claims?q=${encodeURIComponent(q.trim())}` : "/claims");
        ref.current?.blur();
      }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search claims"
        className="h-8 w-full rounded-md border border-line bg-white pl-8 pr-7 text-[13px] text-ink placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line px-1 font-mono text-[10px] text-faint">/</kbd>
    </form>
  );
}

export function Sidebar() {
  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo className="size-7" />
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-ink">stripe insurance</div>
          <div className="text-[12px] text-muted">Larkspur Assurance</div>
        </div>
      </div>
      <div className="px-3">
        <SearchBox />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Suspense>
          <Nav />
        </Suspense>
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#e3e1ff] text-[12px] font-semibold text-primary-ink">{REVIEWER.initials}</div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-ink">{REVIEWER.name}</div>
            <div className="truncate text-[12px] text-muted">{REVIEWER.level}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

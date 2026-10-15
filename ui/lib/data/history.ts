// Fake settlement history for the dashboard and payouts ledger. Deterministic.

export interface DayStat {
  date: string; // yyyy-mm-dd
  agentCount: number;
  humanCount: number;
  agentPaid: number;
  humanPaid: number;
  declined: number;
  referred: number;
}

export interface LedgerRow {
  id: string;
  claim: string;
  payee: string;
  amount: number;
  by: "agent" | "human";
  approver: string;
  heads: string;
  created: string;
  status: "paid" | "pending" | "in_transit";
  seconds: number; // claim submitted to payout
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TODAY = new Date(Date.UTC(2026, 9, 15));

const iso = (d: Date) => d.toISOString().slice(0, 10);

function build(): DayStat[] {
  const r = rng(4817);
  const out: DayStat[] = [];
  const start = new Date(Date.UTC(2026, 0, 1));
  for (let d = new Date(start); d <= TODAY; d = new Date(d.getTime() + 86400000)) {
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const progress = (d.getTime() - start.getTime()) / (TODAY.getTime() - start.getTime());
    const seasonal = 1 + 0.35 * Math.sin(((d.getUTCMonth() + 1) / 12) * Math.PI * 2 - 1.2);
    const total = Math.round((weekend ? 22 : 44) * seasonal * (0.85 + r() * 0.3));
    const agentShare = 0.42 + 0.34 * Math.min(1, progress * 1.15) + (r() - 0.5) * 0.06;
    const agentCount = Math.round(total * agentShare);
    const humanCount = total - agentCount;
    let agentPaid = 0;
    for (let i = 0; i < agentCount; i++) agentPaid += 60 + r() * 420 + (r() > 0.85 ? r() * 450 : 0);
    let humanPaid = 0;
    for (let i = 0; i < humanCount; i++) humanPaid += 1050 + r() * 1900 + (r() > 0.9 ? r() * 6000 : 0);
    out.push({
      date: iso(d),
      agentCount,
      humanCount,
      agentPaid: Math.round(agentPaid * 100) / 100,
      humanPaid: Math.round(humanPaid * 100) / 100,
      declined: Math.round(total * (0.06 + r() * 0.03)),
      referred: Math.round(total * (0.18 + r() * 0.05) * (1 - progress * 0.3)),
    });
  }
  return out;
}

export const DAYS = build();

export type Range = "MTD" | "30D" | "90D" | "YTD";

export function daysFor(range: Range): DayStat[] {
  const end = iso(TODAY);
  let from: string;
  if (range === "MTD") from = "2026-10-01";
  else if (range === "YTD") from = "2026-01-01";
  else from = iso(new Date(TODAY.getTime() - ((range === "30D" ? 30 : 90) - 1) * 86400000));
  return DAYS.filter((d) => d.date >= from && d.date <= end);
}

const FIRST = ["Amelia", "Oliver", "Isla", "George", "Ava", "Noah", "Mia", "Leo", "Grace", "Arthur", "Freya", "Oscar", "Ruby", "Jack", "Ella", "Harry", "Sofia", "Theo", "Lily", "Finn", "Zara", "Kian", "Maya", "Rohan", "Chloe", "Ibrahim", "Hannah", "Tomasz", "Niamh", "Dev"];
const LAST = ["Hughes", "Patel", "Clarke", "Murphy", "Evans", "Shah", "Wood", "Turner", "Ali", "Brooks", "Kowalski", "Reid", "Hall", "Begum", "Price", "Lewis", "Nolan", "Fraser", "Iqbal", "Doyle", "Walsh", "Moss", "Grant", "Chen", "Ward"];
const HEADS = ["Delayed baggage", "Medical", "Missed excursion", "Personal belongings", "Cancellation", "Curtailment", "Travel delay", "Medical, Delayed baggage", "Personal money"];
const HANDLERS = ["Alex Morgan", "Priya Desai", "Tom Hartley", "Grace Okoye"];

function buildLedger(): LedgerRow[] {
  const r = rng(1380);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const rows: LedgerRow[] = [];
  let t = Date.UTC(2026, 9, 15, 7, 58);
  for (let i = 0; i < 80; i++) {
    t -= Math.round((20 + r() * 160) * 60000);
    const human = r() < 0.27;
    const amount = human ? 1000 + r() * 2600 + (r() > 0.85 ? r() * 5000 : 0) : 40 + r() * 520 + (r() > 0.8 ? r() * 380 : 0);
    let id = "po_1Q";
    for (let k = 0; k < 20; k++) id += chars[Math.floor(r() * chars.length)];
    const created = new Date(t);
    rows.push({
      id,
      claim: `CLM-2026-00${4700 - i * 3 - Math.floor(r() * 3)}`,
      payee: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      amount: Math.round(amount * 100) / 100,
      by: human ? "human" : "agent",
      approver: human ? HANDLERS[Math.floor(r() * HANDLERS.length)] : "Agent (T0)",
      heads: HEADS[Math.floor(r() * HEADS.length)],
      created: created.toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
      status: i < 2 ? "in_transit" : "paid",
      seconds: human ? Math.round((0.6 + r() * 2.8) * 86400) : Math.round(140 + r() * 260),
    });
  }
  return rows;
}

export const LEDGER = buildLedger();

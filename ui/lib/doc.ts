import type { RawDoc } from "./types";

/** Documents rendered verbatim in a monospace page (receipts, csv, json). */
export function isPlain(doc: RawDoc) {
  return /\.(txt|csv|json)$/.test(doc.name) || doc.kind === "receipt" || doc.kind === "record";
}

/** Removes markdown emphasis so quotes can be matched against what is displayed. */
export function stripMd(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=$|[\s.,;:)])/g, "$1$2")
    .replace(/<\/?small>/g, "");
}

export type Block =
  | { type: "h1" | "h2" | "h3" | "p" | "li" | "quote"; text: string }
  | { type: "hr" }
  | { type: "table"; rows: string[][]; header: boolean }
  | { type: "pre"; text: string };

export function parseBlocks(doc: RawDoc): Block[] {
  if (isPlain(doc)) return doc.text.split("\n").map((text) => ({ type: "pre" as const, text }));
  const out: Block[] = [];
  const lines = doc.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      let header = false;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const r = lines[i].trim();
        if (/^\|[\s|:-]+\|$/.test(r)) header = true;
        else rows.push(r.slice(1, -1).split("|").map((c) => stripMd(c.trim())));
        i++;
      }
      i--;
      out.push({ type: "table", rows, header });
      continue;
    }
    if (line === "---") out.push({ type: "hr" });
    else if (line.startsWith("### ")) out.push({ type: "h3", text: stripMd(line.slice(4)) });
    else if (line.startsWith("## ")) out.push({ type: "h2", text: stripMd(line.slice(3)) });
    else if (line.startsWith("# ")) out.push({ type: "h1", text: stripMd(line.slice(2)) });
    else if (line.startsWith("- ")) out.push({ type: "li", text: stripMd(line.slice(2)) });
    else if (line.startsWith("> ")) out.push({ type: "quote", text: stripMd(line.replace(/^>\s?/, "")) });
    else if (line === ">") continue;
    else out.push({ type: "p", text: stripMd(line) });
  }
  return out;
}

function weight(b: Block) {
  if (b.type === "table") return b.rows.length * 1.6 + 1;
  if (b.type === "pre") return 1;
  if (b.type === "hr") return 1;
  if (b.type === "h1") return 3;
  if (b.type === "h2" || b.type === "h3") return 2.4;
  return Math.max(1.6, Math.ceil(b.text.length / 88) * 1.25 + 0.6);
}

/** Splits blocks into A4-ish pages. */
export function paginate(blocks: Block[], plain: boolean): Block[][] {
  const max = plain ? 62 : 46;
  const pages: Block[][] = [[]];
  let used = 0;
  for (const b of blocks) {
    const w = weight(b);
    if (used + w > max && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(b);
    used += w;
  }
  return pages;
}

export function blockText(b: Block): string[] {
  if (b.type === "hr") return [];
  if (b.type === "table") return b.rows.flat();
  return [b.text];
}

/** Page index (0-based) where a quote first appears, or -1. */
export function findPage(pages: Block[][], quote: string) {
  for (let p = 0; p < pages.length; p++) {
    for (const b of pages[p]) if (blockText(b).some((t) => t.includes(quote))) return p;
  }
  return -1;
}

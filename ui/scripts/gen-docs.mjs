// Embeds the synthetic Larkspur documents into ui/lib/data/generated-docs.ts
import fs from "node:fs";
import path from "node:path";

const repo = process.argv[2];
const data = path.join(repo, "data");
const claimDir = path.join(data, "claims", "CLM-2026-004817");
const out = path.join(repo, "ui", "lib", "data", "generated-docs.ts");

// Parody insurer brand for the UI. Afthab's /data stays as Larkspur.
const brand = (t) =>
  t
    .replace(/Larkspur Assurance/g, "Strype Assurance")
    .replace(/LARKSPUR ASSURANCE/g, "STRYPE ASSURANCE")
    .replace(/LARKSPUR/g, "STRYPE")
    .replace(/Larkspur/g, "Strype")
    .replace(/larkspur/g, "strype")
    .replace(/LRK-/g, "STR-");
const read = (p) => brand(fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").trimEnd());

function claimFormToText(j) {
  const L = [];
  L.push("# LARKSPUR ASSURANCE — ONLINE CLAIM FORM");
  L.push("");
  L.push(`**Claim reference:** ${j.claim_id}`);
  L.push(`**Submitted:** ${j.submitted_at.replace("T", " ").replace("Z", " UTC")} · Channel: ${j.channel}`);
  L.push(`**Policy number:** ${j.policy_number}`);
  L.push("");
  L.push("## 1. Claimant");
  L.push("");
  L.push("| Field | Detail |");
  L.push("|---|---|");
  L.push(`| Name | ${j.claimant.name} |`);
  L.push(`| Email | ${j.claimant.email} |`);
  L.push(`| Phone | ${j.claimant.phone} |`);
  L.push("");
  L.push("## 2. Trip");
  L.push("");
  L.push("| Field | Detail |");
  L.push("|---|---|");
  L.push(`| Destination | ${j.trip.destination} |`);
  L.push(`| Departed UK | ${j.trip.departed_uk} |`);
  L.push(`| Returned UK | ${j.trip.returned_uk} |`);
  L.push(`| Travelling with | ${j.trip.travelling_with} |`);
  L.push("");
  L.push("## 3. What you are claiming for");
  for (const s of j.sections_claimed) {
    L.push("");
    L.push(`### ${s.section} — incident date ${s.incident_date}`);
    L.push("");
    L.push(s.summary);
    L.push("");
    L.push("| Line | Description | Date | Amount | Receipt |");
    L.push("|---|---|---|---|---|");
    for (const i of s.items) {
      L.push(`| ${i.line} | ${i.description} | ${i.date} | ${i.currency} ${i.amount.toFixed(2)} | ${i.receipt_ref} |`);
    }
  }
  L.push("");
  L.push("## 4. Other information");
  L.push("");
  L.push(`**Total claimed (estimate):** GBP ${j.total_claimed_estimate_gbp.toFixed(2)}`);
  L.push(`**Other insurance:** ${j.other_insurance}`);
  L.push(`**Compensation received from carrier:** ${j.carrier_compensation_received}`);
  L.push("");
  L.push("## 5. Payment details");
  L.push("");
  L.push("| Field | Detail |");
  L.push("|---|---|");
  L.push(`| Account name | ${j.payment_details.account_name} |`);
  L.push(`| Sort code | ${j.payment_details.sort_code} |`);
  L.push(`| Account number | ${j.payment_details.account_number} |`);
  L.push("");
  L.push("## 6. Declaration");
  L.push("");
  L.push(j.declaration.text);
  L.push("");
  L.push(`Signed: ${j.declaration.signed_name} · ${j.declaration.signed_at.replace("T", " ").replace("Z", " UTC")}`);
  return brand(L.join("\n"));
}

const claimDocs = [];
// Demo timeline: the claim opens two weeks before the app's "today" (15 Oct 2026).
const form = JSON.parse(read(path.join(claimDir, "00_claim_form.json")));
form.submitted_at = "2026-10-01T08:47:19Z";
form.declaration.signed_at = "2026-10-01T08:47:02Z";
claimDocs.push({ id: "CF", name: "00_claim_form.pdf", title: "Claim form", kind: "form", text: claimFormToText(form) });
claimDocs.push({ id: "ST", name: "01_claimant_statement.pdf", title: "Claimant statement", kind: "statement", text: read(path.join(claimDir, "01_claimant_statement.md")).replace("23 September 2026", "30 September 2026") });

const evDir = path.join(claimDir, "evidence");
for (const f of fs.readdirSync(evDir).sort()) {
  const id = f.slice(0, 3);
  const base = f.replace(/\.(md|txt)$/, "");
  const title = base.slice(4).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  claimDocs.push({ id, name: `${base}.pdf`, title, kind: f.endsWith(".txt") ? "receipt" : "document", text: read(path.join(evDir, f)) });
}

const pr = path.join(data, "company", "policy_records");
claimDocs.push({ id: "CERT", name: "STR-TRV-26-0071934_certificate.pdf", title: "Certificate of insurance", kind: "policy", text: read(path.join(pr, "LRK-TRV-26-0071934_certificate_of_insurance.md")) });
claimDocs.push({ id: "ADM", name: "STR-TRV-26-0071934_admin_record.json", title: "Policy admin record", kind: "record", text: read(path.join(pr, "LRK-TRV-26-0071934_policy_admin_record.json")) });

const co = path.join(data, "company");
const companyDocs = [
  { id: "POL", file: "01_policy_wording_TRV-2026-v1.md", name: "TRV-2026-v1_policy_wording.pdf", title: "Policy wording TRV-2026 v1" },
  { id: "POL24", file: "02_policy_wording_TRV-2024-v3_SUPERSEDED.md", name: "TRV-2024-v3_policy_wording_SUPERSEDED.pdf", title: "Policy wording TRV-2024 v3 (superseded)" },
  { id: "CHG", file: "03_claims_handling_guidelines_v4.2.md", name: "CHG-TRV_v4.2.pdf", title: "Claims handling guidelines v4.2" },
  { id: "SAP", file: "04_settlement_authority_and_payment_controls.md", name: "SAP-01_v2.1.pdf", title: "Settlement authority & payment controls" },
  { id: "FRD", file: "05_fraud_indicators_and_SIU_referral.md", name: "FRD-03_v3.0.pdf", title: "Fraud indicators & SIU referral" },
  { id: "FX", file: "06_fx_reference_rates_2026-09.csv", name: "FX-REF_2026-09.csv", title: "FX reference rates Sep 2026" },
  { id: "LTR", file: "07_customer_decision_letter_standards.md", name: "LTR-02.pdf", title: "Decision letter standards" },
  { id: "BRO", file: "08_marketing_brochure_travel_2026.md", name: "brochure_travel_2026.pdf", title: "Marketing brochure 2026 (not contractual)" },
].map((d) => ({ id: d.id, name: d.name, title: d.title, kind: "company", text: read(path.join(co, d.file)) }));

const body = `// Generated from /data by gen-docs.mjs. Synthetic documents only.
import type { RawDoc } from "../types";

export const DOCS_004817: RawDoc[] = ${JSON.stringify(claimDocs, null, 1)};

export const COMPANY_DOCS: RawDoc[] = ${JSON.stringify(companyDocs, null, 1)};
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log("wrote", out, claimDocs.length, companyDocs.length, body.length);

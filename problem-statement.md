# Problem statement: autonomous, explainable claims settlement

Working draft, 15 October 2026. This covers what we're solving and why. Architecture comes next.

## Summary

For software to settle an insurance claim on its own, it has to read the whole claim file, check it against the customer's policy, prove every finding, stay inside an explicit authority limit, and explain every pound afterwards. We're building an agent system that does this for routine claims, pays them through Stripe, and hands everything else to a person with the case already made. Every pound it pays traces back to a clause and the evidence that satisfied it.

## How a claim is decided today

1. **Notification.** The customer reports a loss and sends evidence: a claim form, photos, receipts, reports, letters.
2. **Coverage.** A claims handler checks the customer's policy. Was it in force? Is this kind of loss covered? Does an exclusion apply? Did the customer meet the conditions, such as reporting a theft to the police?
3. **Investigation.** The handler checks that the evidence is consistent across documents and looks for fraud indicators.
4. **Amount.** The handler works out what's payable: the amount claimed, less anything over a limit, less the excess, less any depreciation or excluded items.
5. **Authority.** If the amount is within the handler's authority limit, they settle it. If not, they write a recommendation for someone more senior to sign off.
6. **Payment and explanation.** The insurer pays the customer or a supplier and explains the outcome, especially any deduction or decline.

Two sets of rules apply at once. The **insurance policy** decides what the customer is owed. The **authority rules** decide who may approve paying it. Our agent has to follow both, and its explanations have to cite both.

## The problem

**Deciding a claim is reading and cross-checking.** Even a small claim means reading a policy wording that runs to dozens of pages, the customer's schedule and endorsements, the insurer's claims guidelines, and the evidence. Large claims run to hundreds of pages. The facts that decide a claim are often spread across documents: the date on the claim form has to match the police report, and the item on the receipt has to match the item claimed.

**People do this slowly and inconsistently.** Handlers spend much of their time reading and cross-checking. Two handlers can read the same clause differently. Quality checks sample files after the decision has been made. Simple claims wait in the same queue as complex ones.

**Every decision has to be explainable.** In the UK, the FCA's claims-handling rules (ICOBS 8) require insurers to handle claims promptly and fairly and not to reject them unreasonably. Customers can take a decision to the Financial Ombudsman Service, so the insurer has to be able to show which clause and which evidence led to the outcome.

**Every payment has to stay inside authority.** Handlers can only settle up to their limit. Payments must go to the right person, once. Any automation has to respect the same controls, or no insurer will switch it on.

**Today's automation doesn't close the gap.**
- Rules-based automation handles simple claims with structured data, but can't help when the answer is in a PDF, a letter or a photo.
- AI tools cover individual steps, such as assessing damage from photos, scoring fraud risk and pulling data from documents.
- General-purpose AI assistants can summarise a claim file, but they can invent facts or clauses, miss contradictions in long files, and leave nothing an auditor would accept.
- Automating decisions badly backfires. US health insurers Cigna and UnitedHealth have faced lawsuits over algorithm-driven claim denials.

Reading documents is no longer the hard part. Reading a whole claim file reliably, proving every finding and staying inside limits is, and an insurer needs all three before it lets software pay.

### Problem statement

> Routine insurance claims usually still need a person to settle them. Deciding one means reading many documents, checking them against each other and against a specific policy, and keeping every payment inside an authority limit and explainable clause by clause. People do this slowly and inconsistently. Current automation either can't read the documents reliably or can't prove why it decided, so insurers can't trust it to pay.

## Why it matters

Claims are an insurer's biggest outgoing, and the moment it keeps (or breaks) its promise to the customer.

| Who | What they need | What goes wrong today |
|---|---|---|
| Claimants | Fast payment and a clear reason | Simple claims wait behind complex ones, and reasons for deductions aren't always clear |
| Claims handlers | Time for the claims that need judgement | Much of their day goes on reading and cross-checking routine claims |
| Claims managers | Consistent decisions inside authority | The same clause gets read differently, and problems show up in file reviews after the decision |
| Finance | Every payment authorised, correct, made once to the right payee, and traceable | Overpayments ("leakage") and payments to the wrong account are found late, if at all |
| Compliance and audit | Proof that each decision was fair and followed the policy | Reasons are buried in notes and emails, so reconstructing a decision takes time |
| MGAs and outsourced claims handlers (TPAs) | Proof to the insurer that every settlement stayed inside the authority it delegated | The proof comes from periodic reports and audits, after the money has gone |

**Why now.** Language models can now read policy wordings, letters, receipts and photos well enough to pull out the facts. Lemonade has shown that simple claims can be paid in seconds, for its own policies. What's missing is an agent that's controlled and accountable enough that any insurer would let it pay.

## What we're solving

Given a claim, the system must:

1. **Read everything relevant, however much there is:** every evidence document, the customer's policy (wording, schedule, endorsements) and the insurer's claims guidelines.
2. **Establish the facts and check them against each other:** dates, amounts, items, people and places. Contradictions between documents get flagged.
3. **Decide coverage:** was the policy in force, is the event covered, does an exclusion apply, were the conditions met?
4. **Calculate the amount:** from what was claimed, through limits, excess and other deductions, to what's payable.
5. **Write the evidence document.** Every finding cites the document it came from (and where in it) and the clause it relates to. Nothing goes in without a source.
6. **Decide within the authority rules:** pay in full, pay in part, or escalate to a person with the evidence document and the reason. Whether the agent may also decline on its own is an open decision.
7. **Pay** the verified payee through Stripe in test mode, with the payment linked to the claim.
8. **Remember and explain.** Keep every decision with its evidence and the clauses relied on, so anyone can later ask "why did you pay this?" or "why not?" and get the clause and the evidence.

### The authority rules

These are the "written policy" the hackathon brief asks for. First draft, to agree:

- A maximum the agent may pay on one claim without a person (amount to be set).
- Payment only to the named policyholder, to verified payment details.
- No payment on a claim that duplicates an earlier one.
- Always escalate on contradictions between documents, fraud indicators, missing required evidence, or an exclusion that needs judgement.

## Scope

**In scope**
- One line of personal insurance (to choose; see open decisions).
- A fictional insurer with its own policy wording, schedules and claims guidelines.
- Synthetic claims, from clean to messy.
- The full path: claim in, evidence document, decision, then a Stripe payment or an escalation, then an explanation on request.

**Out of scope**
- Underwriting, pricing and collecting premiums.
- Complex lines such as injury, liability and commercial claims.
- Recovering money from third parties, setting reserves, litigation.
- Proving fraud. We flag indicators and escalate; we don't accuse anyone.
- Real customer data, or a real insurer's documents or brand.
- Integration with real claims platforms.

## What success looks like

One judge scores each project from the demo video, and the top three then demo live, so everything below has to be visible on video.

| Criterion (points) | What we must show |
|---|---|
| Works end to end (35) | A claim goes in and, with no person involved, money reaches the claimant in Stripe test mode |
| Autonomy with control (25) | Claims inside the authority rules are paid without a person; claims outside them are stopped and escalated, and the demo shows a guardrail firing |
| Explains every pound (20) | For any payment, the agent shows the clause that made it payable, the evidence behind it, the calculation, and the authority rule that let it pay without a person |
| Product and creativity (20) | A claims or finance lead would want to switch it on: fast routine payouts, consistent decisions, and an audit trail that would satisfy a regulator |
| Cognee side quest | The agent can't decide or explain without its Cognee memory, and it answers "why?" from that memory |

The demo should include at least:
- A clean claim, paid automatically.
- A claim paid in part, with each deduction (excess, limit, excluded item) explained.
- A claim with a contradiction between documents, caught and escalated.
- A claim above the authority threshold, escalated with the case made.
- A later question, "why did you pay this?", answered with the clause and the evidence.

## Open decisions

**Product (these change what we're solving)**

1. **Line of business.**
   - *Travel:* lost or delayed baggage, cancellation, medical costs abroad. Many document types, and clear limits and exclusions.
   - *Home contents:* theft or accidental damage. Police references, receipts and photos; single-item limits; conditions such as forced entry.
   - *Pet:* vet fees. Invoices and clinical history; pre-existing-condition exclusions depend on the animal's history over time.
   - *Gadget:* phone or laptop damage or theft. Simple and relatable, with fewer documents.
2. **Can the agent decline claims on its own, or only pay and escalate?** Declining shows more autonomy. A wrong decline is also the costliest mistake, and the one regulators and courts focus on.
3. **The authority threshold and the other guardrails.**
4. **Who can be paid:** the policyholder only, or suppliers such as repairers too.

**For the architecture discussion**

- How money reaches the claimant in Stripe test mode, given our account's country.
- What lives in Cognee (the claim's facts, the policy and guidelines, past claims and decisions) and how the agents use it.
- How work is split across agents so large files are read completely and each check stays narrow.
- How contradictions between documents are found.
- How we stop invented evidence or clauses from reaching the decision.
- What the evidence document looks like, and exactly what the deciding agent sees.
- How a claim arrives (upload, email, form) and how we drive the demo.

**Ideas from brainstorming, still to evaluate**

- An orchestrator assigns agents to individual documents or groups of documents, to improve quality and reduce hallucination.
- Cognee builds a knowledge graph of each claim, which the orchestrator uses.
- The agent that builds the case is separate from the agent that decides.
- The deciding agent only acts under a value threshold.

## Glossary

- **Policy wording:** the standard contract: what's covered, exclusions and conditions.
- **Schedule:** the customer-specific part: who's covered, the dates, the limits and the excess.
- **Endorsement:** a change to one customer's policy.
- **Excess:** the part of each claim the customer pays themselves (a deductible, in the US).
- **Limit:** the most the policy pays, overall, per section or per item.
- **Exclusion:** something the policy doesn't cover.
- **Condition:** something the customer must do for cover to apply.
- **Authority limit:** the most a handler, or our agent, may settle without sign-off.
- **Escalation:** passing a claim to someone with more authority, or to the fraud team.
- **Leakage:** money lost through overpayment, mistakes or fraud.
- **MGA / TPA:** firms that sell policies or handle claims on an insurer's behalf, under authority the insurer delegates.

# Claims console UI

Frontend only. All data is mock. The demo claim and policy documents come from Afthab's synthetic case in `/data`, rebranded to the parody insurer Strype Assurance ("Powered by Streak").

```bash
cd ui
npm install
npm run dev
```

## Demo flow (matches the script)

1. Open **CLM-2026-004817** (top of Claims, or Home → Waiting on customers). It opened 1 Oct with a few documents and now has over twenty.
2. **Timeline** tab: six agent runs over two weeks. Each shows the evidence that arrived, the agents that woke, the emails sent to the customer, and the orchestrator's view (reject / partial / full).
3. Payment is held: every line is decided at £390.20, but the fraud screen needs the original police report.
4. Click **Simulate customer reply** (orange Test button, or Test mode menu in the top bar). The police report arrives and run 7 starts (~48s).
5. **Agents** tab: the evidence reader quotes the report verbatim, the orchestrator checks the Cognee graph, decides it is enough to pay, and pays.
6. **Payment** tab: Stripe transfer from Strype Assurance to the customer, with every pound traced to a clause and a document.
7. Test mode menu → **Reset demo** to run it again.

Claims over £1,000 (CLM-2026-004861, CLM-2026-004791) sit in the Review queue for a person.

## Pages

- `/` Home: paid out by agents vs people, waiting on customers, review queue
- `/claims` Claims list with Awaiting evidence, Triaging, Needs review views
- `/claims/[id]` Timeline, Review (For/Against with highlighted citations), Agents (per run traces), Memory (Cognee graph), Emails, Line items, Authority, Payment, Logs, Ask why
- `/payouts` Payout ledger
- `/library` Policy documents

## Running with the real backend

The live demo claim (CLM-2026-004817) is wired to the Python pipeline and Stripe test mode through `server/app.py`. Next.js proxies `/api/*` to it (`next.config.ts`, override with `BACKEND_URL`).

```bash
# terminal 1, repo root: the claims API (pipeline + Cognee + Stripe)
.venv-claims/bin/uvicorn server.app:app --port 8000
# terminal 2
cd ui && npm run dev
```

1. **Once:** Test mode → **Prepare claim (full agent run)**. The real agents read every document except the held-back evidence and stop at WAITING. A snapshot of that state is saved under `runs/_demo_snapshots/`.
2. **Simulate customer reply** sends the held-back documents to the pipeline. The replay animation plays but holds at the end until the real run finishes. Then line items, authority checks, fraud score and the Payment tab switch to the real decision and the real Stripe transfer (with a Dashboard link).
3. **Live run** tab: the pipeline's own event log, streamed. **Ask why** has a free-text box answered from Cognee memory.
4. **Reset demo** reverses the claim's Stripe transfers (`scripts/reset_demo_payments.py`) and restores the WAITING snapshot, so the next take pays fresh.

If the API is down, the console falls back to the mock data below.

## Where to plug in the backend

- `lib/types.ts` is the shape the UI expects: claims, episodes (evidence arrivals), agent runs and trace steps, findings, citations, evidence requests, emails.
- `lib/data/` holds the mock claims. Replace `getClaim` / `CLAIMS` with API calls.
- `lib/store.tsx` holds the demo clock and reviewer decisions. Swap for real events and a Stripe transfer.
- A citation is `{ doc, quote }`. The viewer highlights `quote` wherever it appears verbatim in document `doc`.
- `lib/data/generated-docs.ts` is generated from `/data` by `node scripts/gen-docs.mjs <repo root>`.

# Claims console UI

Frontend only. All data is mock, built from the synthetic Larkspur case in `/data`.

```bash
cd ui
npm install
npm run dev
```

## Pages

- `/` Home: paid out by agents vs people, review queue, live run
- `/claims` Claims list, with Review queue and Live triage views
- `/claims/[id]` Claim review: For/Against findings with cited highlights, agent waterfall and traces, line items, authority, payout, logs, Ask why
- `/payouts` Payout ledger
- `/library` Policy documents

## Mock claims

| Claim | Outcome |
|---|---|
| CLM-2026-004833 | Paid in full by agent |
| CLM-2026-004817 | Paid in part by agent (from `/data`) |
| CLM-2026-004791 | Decline recommended, needs a person |
| CLM-2026-004861 | Live: agents run on page load (~84s), then needs a person to approve over £1,000 |

## Where to plug in the backend

- `lib/types.ts` is the shape the UI expects for a claim, its agents, trace steps, findings and citations.
- `lib/data/` holds the mock claims. Replace `getClaim` / `CLAIMS` with API calls.
- `lib/store.tsx` holds the live-run clock and reviewer decisions. Swap for real events and a Stripe payout call.
- A citation is `{ doc, quote }`. The viewer highlights `quote` wherever it appears verbatim in document `doc`.
- `lib/data/generated-docs.ts` is generated from `/data`.

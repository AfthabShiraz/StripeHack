"""Clear a claim's Stripe payment history before a demo take, so the next run pays fresh.

    .venv-claims/bin/python scripts/reset_demo_payments.py CLM-2026-004817          # show what would change
    .venv-claims/bin/python scripts/reset_demo_payments.py CLM-2026-004817 --yes    # do it

`payments/` treats Stripe as the payment ledger: it finds a claim's earlier payments by the
transfer metadata `claim_id`. After a rehearsal, those transfers make the next run return
ALREADY_PAID (no money moves) or REFER under SAP-01 5.8. For each of the claim's transfers this:

1. reverses whatever hasn't been reversed yet, returning the money to the claims float;
2. renames metadata `claim_id` to `<claim_id>#rehearsal`, so the claim's ledger starts empty and
   `explain_payments` no longer shows rehearsal payments. The original ID stays in `rehearsal_of`.

Test mode only (the payments client refuses live keys). The payee account is kept. Local pipeline
state (`runs/<claim_id>/`) is cleared by the pipeline itself on a fresh start; Cognee memory is not
touched by either.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from payments import stripe_payout as sp  # noqa: E402


def reset_claim_payments(claim_id: str, apply: bool) -> dict:
    """Reverse and re-tag every transfer on the claim (dry run unless apply). Returns a summary."""
    transfers = sorted(sp.claim_transfers(claim_id), key=lambda t: t.created)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows, total = [], 0
    for t in transfers:
        outstanding = t.amount - (t.amount_reversed or 0)
        total += outstanding
        rows.append({"transfer_id": t.id, "version": sp._meta(t).get("decision_version"),
                     "amount_gbp": sp.g.gbp(t.amount), "reversed_now_gbp": sp.g.gbp(outstanding)})
        if not apply:
            continue
        if outstanding > 0:
            sp.client().v1.transfers.reversals.create(
                t.id,
                {"amount": outstanding, "metadata": {"reason": "demo reset"}},
                {"idempotency_key": f"demo-reset-{t.id}-{outstanding}"},
            )
        sp.client().v1.transfers.update(t.id, {"metadata": {
            "claim_id": f"{claim_id}#rehearsal",
            "rehearsal_of": claim_id,
            "reset_at": stamp,
        }})
    return {"claim_id": claim_id, "applied": apply, "transfers": rows, "returned_gbp": sp.g.gbp(total)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("claim_id")
    parser.add_argument("--yes", action="store_true", help="apply the changes (default: dry run)")
    args = parser.parse_args()

    out = reset_claim_payments(args.claim_id, args.yes)
    if not out["transfers"]:
        print(f"{args.claim_id}: no transfers in Stripe; nothing to reset.")
        return
    for r in out["transfers"]:
        print(f"{r['transfer_id']}  v{r['version'] or '?'}  £{r['amount_gbp']}  to reverse £{r['reversed_now_gbp']}")
    if not args.yes:
        print(f"\nDry run: {len(out['transfers'])} transfer(s), £{out['returned_gbp']} to return to the float. "
              "Re-run with --yes to apply.")
        return
    left = sp.claim_transfers(args.claim_id)
    print(f"\nReset {len(out['transfers'])} transfer(s); £{out['returned_gbp']} returned to the float. "
          f"Transfers still on {args.claim_id}: {len(left)}. "
          f"Float available: £{sp.g.gbp(sp.float_available_pence())}")


if __name__ == "__main__":
    main()

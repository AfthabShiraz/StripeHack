"""Exact money maths (CHG-TRV §7) and fraud score total. OWNER: core subagent.

All arithmetic is Decimal; each line is rounded half-up to the penny before anything is summed (CHG-TRV
7.1.3, 7.2.2). Missing or inconsistent figures raise MoneyError naming the line: money is never guessed.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path

from .config import FRAUD_AMBER_THRESHOLD, FRAUD_RED_THRESHOLD
from .documents import FX_CSV
from .schemas import Indicator, LineDecision, LineMoney, SectionAssessment, SectionMoney, Settlement

PENNY = Decimal("0.01")
ZERO = Decimal("0")
NO_PAY_OUTCOMES = {"DECLINE", "PEND", "REFER"}

# FRD-03 v3.0 §3. Code owns the score: a known indicator ID always scores its table weight.
FRD03_WEIGHTS = {"F1": 20, "F2": 15, "F3": 15, "F4": 10, "F5": 5, "F6": 15, "F7": 10, "F8": 30, "F9": 25, "F10": 10, "F11": 20}


class MoneyError(ValueError):
    """A line or section can't be calculated exactly (missing or inconsistent figures)."""


def _dec(value, what: str) -> Decimal:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError) as e:
        raise MoneyError(f"{what}: {value!r} is not a number") from e
    if not d.is_finite() or d < 0:
        raise MoneyError(f"{what}: {value!r} must be a non-negative number")
    return d


def _penny(x: Decimal) -> Decimal:
    return x.quantize(PENNY, rounding=ROUND_HALF_UP)


def _num(x: Decimal) -> str:
    return f"{x:,.2f}" if x == x.quantize(PENNY) else f"{x:,}"


def _gbp(x: Decimal) -> str:
    return f"£{x:,.2f}"


def _rate(x: Decimal) -> str:
    q = Decimal("0.0001")
    return f"{x:.4f}" if x == x.quantize(q) else str(x)


def _currency(c: str | None) -> str:
    c = (c or "").strip().upper()
    return {"€": "EUR", "EURO": "EUR", "EUROS": "EUR", "£": "GBP", "STERLING": "GBP"}.get(c, c)


def _iso_date(s: str | None) -> str | None:
    s = (s or "").strip()
    if m := re.match(r"\d{4}-\d{2}-\d{2}", s):
        return m.group(0)
    if m := re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s):  # DD/MM/YYYY
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def _head(h: str) -> str:
    return re.sub(r"^SECTION\s+", "", (h or "").strip().upper())


def _code(c: str) -> str:
    c = _head(c)
    return c.split()[0].replace(".", "").rstrip(":") if c else ""


# ---------------------------------------------------------------- FX


def load_fx_rates(path: Path | str | None = None) -> dict[str, float]:
    """FX-REF table (data/company/06_fx_reference_rates_2026-09.csv) as {"YYYY-MM-DD": gbp_per_eur}."""
    path = Path(path or FX_CSV)
    rows = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    rates = {
        row["date"].strip(): float(row["gbp_per_unit"])
        for row in csv.DictReader(rows)
        if (row.get("currency") or "").strip().upper() == "EUR"
    }
    if not rates:
        raise MoneyError(f"no EUR rates in {path}")
    return rates


# ---------------------------------------------------------------- lines


def _line_amount(d: LineDecision, fx: dict[str, float]) -> tuple[Decimal, str]:
    n = f"line {d.line}"
    if d.outcome in NO_PAY_OUTCOMES:
        return ZERO, f"{d.outcome}: nothing payable = £0.00"
    if d.basis == "NONE":
        return ZERO, f"{d.outcome} with money basis NONE: nothing payable = £0.00"

    claimed = _dec(d.claimed_amount, f"{n} claimed_amount")
    if d.eligible_amount is not None:
        eligible = _dec(d.eligible_amount, f"{n} eligible_amount")
    elif d.outcome == "PAY":
        eligible = claimed  # paid in full: the whole claimed amount is eligible
    else:
        raise MoneyError(f"{n}: {d.outcome} needs eligible_amount (the eligible part, in the receipt's currency)")
    cur = _currency(d.claimed_currency)

    if d.basis == "GBP_DEBITED":  # CHG-TRV 7.1.1 / 7.2.2
        if d.gbp_debited is None:
            raise MoneyError(f"{n}: GBP_DEBITED needs gbp_debited (the GBP on the card/bank statement)")
        debited = _dec(d.gbp_debited, f"{n} gbp_debited")
        total = _dec(d.receipt_total, f"{n} receipt_total") if d.receipt_total is not None else claimed
        if total <= 0:
            raise MoneyError(f"{n}: receipt_total must be more than 0")
        if eligible > total:
            raise MoneyError(f"{n}: eligible {eligible} is more than the receipt total {total}")
        amount = _penny(debited * eligible / total)
        if eligible == total:
            return amount, f"{_gbp(debited)} debited for {cur} {_num(total)} (whole receipt) = {_gbp(amount)}"
        return amount, f"{_gbp(debited)} × {_num(eligible)} / {_num(total)} = {_gbp(amount)}"

    if d.basis == "FX_REFERENCE":  # CHG-TRV 7.1.2
        if cur == "GBP":
            amount = _penny(eligible)
            return amount, f"{_gbp(eligible)} already in GBP (no conversion) = {_gbp(amount)}"
        if cur != "EUR":
            raise MoneyError(f"{n}: FX-REF has EUR rates only, not {cur or 'no currency'}")
        date = _iso_date(d.fx_date)
        if not date:
            raise MoneyError(f"{n}: FX_REFERENCE needs fx_date (YYYY-MM-DD the cost was incurred)")
        if date not in fx:
            raise MoneyError(f"{n}: no FX-REF rate for {date} (table has {min(fx)} to {max(fx)})")
        rate = _dec(fx[date], f"FX-REF rate {date}")
        amount = _penny(eligible * rate)
        return amount, f"EUR {_num(eligible)} × {_rate(rate)} (FX-REF {date}) = {_gbp(amount)}"

    if d.basis == "GBP_NATIVE":
        if cur and cur != "GBP":
            raise MoneyError(f"{n}: basis GBP_NATIVE but the claimed currency is {cur}")
        amount = _penny(eligible)
        return amount, f"{_gbp(eligible)} (already GBP) = {_gbp(amount)}"

    raise MoneyError(f"{n}: unknown money basis {d.basis!r}")


def line_gbp(decision: LineDecision, fx: dict[str, float]) -> LineMoney:
    """Eligible GBP for one line, rounded half-up to the penny, with a readable calculation."""
    amount, calc = _line_amount(decision, fx)
    return LineMoney(line=decision.line, head=decision.head, outcome=decision.outcome, eligible_gbp=float(amount), calculation=calc)


# ---------------------------------------------------------------- fraud


def _indicator_id(raw: str) -> str:
    m = re.search(r"F\s*-?\s*0*(\d+)", (raw or "").upper())
    return f"F{int(m.group(1))}" if m else (raw or "").strip().upper()


def fraud_score(indicators: list[Indicator]) -> int:
    """Sum of the weights of triggered indicators, each ID once (FRD-03 §2), using the FRD-03 table weight."""
    weights: dict[str, int] = {}
    for ind in indicators:
        if ind.triggered:
            fid = _indicator_id(ind.id)
            weights[fid] = max(weights.get(fid, 0), FRD03_WEIGHTS.get(fid, max(int(ind.weight), 0)))
    return sum(weights.values())


def fraud_band(score: int) -> str:
    if score >= FRAUD_RED_THRESHOLD:
        return "RED"
    if score >= FRAUD_AMBER_THRESHOLD:
        return "AMBER"
    return "GREEN"


def triggered_ids(indicators: list[Indicator]) -> list[str]:
    ids = {_indicator_id(i.id) for i in indicators if i.triggered}
    return sorted(ids, key=lambda x: (not re.fullmatch(r"F\d+", x), int(x[1:]) if re.fullmatch(r"F\d+", x) else 0, x))


# ---------------------------------------------------------------- sections


def _section(s: SectionAssessment, members: list[tuple[LineDecision, Decimal]]) -> tuple[SectionMoney, Decimal]:
    eligible = sum((a for _, a in members), ZERO)
    paid = [f"line {ld.line} {_gbp(a)}" for ld, a in members if a > 0]
    steps = [(" + ".join(paid) + (f" = {_gbp(eligible)}" if len(paid) > 1 else "")) if paid else "no payable lines: £0.00"]

    caps: dict[str, Decimal] = {}
    for sl in s.sub_limits:
        code, limit = _code(sl.code), _dec(sl.limit_gbp, f"section {s.head} sub-limit {sl.code}")
        caps[code] = min(limit, caps.get(code, limit))
    groups: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for ld, a in members:
        if ld.sub_limit and ld.sub_limit.strip():
            groups[_code(ld.sub_limit)] += a
    after = eligible
    for code, total in groups.items():
        if code not in caps:
            raise MoneyError(f"section {s.head}: lines count toward sub-limit {code} but the section lists no limit for it")
        if total > caps[code]:
            after -= total - caps[code]
            steps.append(f"{code} {_gbp(total)} capped at {_gbp(caps[code])}")
        else:
            steps.append(f"{code} {_gbp(total)} within the {_gbp(caps[code])} sub-limit")

    limit = _dec(s.section_limit_gbp, f"section {s.head} section_limit_gbp")
    if after > limit:
        steps.append(f"capped at the section limit {_gbp(limit)}")
        after = limit
    elif eligible > 0:
        steps.append(f"section limit {_gbp(limit)} not reached")

    policy_excess = _dec(s.excess_gbp, f"section {s.head} excess_gbp")
    excess = ZERO
    if after <= 0:
        steps.append("no excess (nothing eligible)")
    elif s.excess_waived:
        steps.append(f"excess {_gbp(policy_excess)} waived" if policy_excess else "excess waived")
    elif policy_excess == 0:
        steps.append("no excess")
    else:
        excess = policy_excess
        steps.append(f"minus excess {_gbp(excess)}")
    net = max(after - excess, ZERO)
    if after - excess < 0:
        steps.append("floored at £0.00")
    calc = f"{s.head}: " + "; ".join(steps) + f" → net {_gbp(net)}"
    money = SectionMoney(
        head=s.head,
        eligible_gbp=float(eligible),
        after_limits_gbp=float(after),
        excess_gbp=float(excess),
        net_gbp=float(net),
        calculation=calc,
    )
    return money, net


def settle(
    lines: list[LineDecision],
    sections: list[SectionAssessment],
    indicators: list[Indicator],
    *,
    fx: dict[str, float] | None = None,
) -> Settlement:
    """Per section: sum lines, apply sub-limits and section limit, deduct excess once (unless waived), floor at 0.
    Fraud score = sum of weights of triggered indicators (each once); band GREEN <25, AMBER 25-39, RED 40+.

    `lines` are the final line decisions (after checker overrides); `sections` supply limits and excess only.
    Raises MoneyError if a line can't be calculated or a paying line has no section assessment."""
    fx = load_fx_rates() if fx is None else fx
    amounts = [_line_amount(ld, fx) for ld in lines]
    by_head: dict[str, list[tuple[LineDecision, Decimal]]] = defaultdict(list)
    for ld, (amount, _) in zip(lines, amounts):
        by_head[_head(ld.head)].append((ld, amount))

    section_money: list[SectionMoney] = []
    total = ZERO
    seen: set[str] = set()
    for s in sections:
        head = _head(s.head)
        if head in seen:
            raise MoneyError(f"two section assessments for head {s.head}")
        seen.add(head)
        money, net = _section(s, by_head.pop(head, []))
        section_money.append(money)
        total += net
    for head, members in by_head.items():
        stray = [ld.line for ld, a in members if a > 0]
        if stray:
            raise MoneyError(f"lines {stray} (head {head}) have no section assessment, so no limit or excess is known")

    score = fraud_score(indicators)
    return Settlement(
        lines=[
            LineMoney(line=ld.line, head=ld.head, outcome=ld.outcome, eligible_gbp=float(a), calculation=calc)
            for ld, (a, calc) in zip(lines, amounts)
        ],
        sections=section_money,
        net_total_gbp=float(total),
        fraud_score=score,
        fraud_band=fraud_band(score),
    )

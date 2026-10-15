"""Paths, model names and settlement limits. Import from here; don't read env vars elsewhere."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATA_DIR = ROOT / "data"
COMPANY_DIR = DATA_DIR / "company"
POLICY_RECORDS_DIR = COMPANY_DIR / "policy_records"
CLAIMS_DIR = DATA_DIR / "claims"
ANSWER_KEY_DIR = DATA_DIR / "answer_key"  # ground truth for evals only; never ingest or show to agents
RUNS_DIR = ROOT / "runs"  # all pipeline output: state, notes, packs, letters, payee mapping

# LLM (Gemini). Reliability over speed: the strongest model for every agent.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gemini-3.1-pro-preview")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "gemini-embedding-001")
LLM_RETRIES = 3

# Stripe (test mode only). Without a key, payments run in DRY_RUN mode.
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

# Cognee datasets
KB_DATASET = "larkspur_kb"
DECISIONS_DATASET = "larkspur_decisions"


def claim_dataset(claim_id: str) -> str:
    return "claim_" + claim_id.replace("-", "_").lower()


# Hard limits enforced in code by gate.py (from SAP-01 v2.1, Settlement Authority & Payment Controls)
ACA_CLAIM_LIMIT_GBP = 1000.00  # P1: net settlement per claim
ACA_SINGLE_PAYMENT_CAP_GBP = 1000.00  # §5.4
ACA_DAILY_CAP_GBP = 25000.00  # §5.4
FRAUD_RED_THRESHOLD = 40  # P6 / FRD-03: 40+ is Red
FRAUD_AMBER_THRESHOLD = 25  # FRD-03: 25-39 is Amber (pay, flag for QA)
BANK_CHANGE_COOLING_DAYS = 14  # P8
PAYMENT_REFERENCE_PREFIX = "LARKSPUR"  # §5.3: reference is "LARKSPUR {claim_id}"

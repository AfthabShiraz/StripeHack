"""Load the Larkspur company knowledge base into Cognee memory.

Usage: .venv-claims/bin/python scripts/load_kb.py [--force]
"""

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from claims_agent import config, memory  # noqa: E402


async def main(force: bool) -> None:
    t = time.time()
    await memory.load_kb(force=force)
    sections = await memory._kb_sections()
    docs = sorted({s["doc_id"] for s in sections})
    print(f"KB dataset {config.KB_DATASET}: {len(sections)} sections from {len(docs)} documents "
          f"({', '.join(docs)}) in {time.time() - t:.1f}s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="forget the KB dataset and reload it")
    asyncio.run(main(parser.parse_args().force))

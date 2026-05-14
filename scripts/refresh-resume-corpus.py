#!/usr/bin/env python3
"""Re-read public/Kaustubh-Dutta-Resume.pdf and refresh data/resume-corpus.json."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "public" / "Kaustubh-Dutta-Resume.pdf"
OUT = ROOT / "data" / "resume-corpus.json"


def main() -> None:
    try:
        import pypdf
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pypdf", "-q"])
        import pypdf

    r = pypdf.PdfReader(str(PDF))
    full = "".join((p.extract_text() or "") for p in r.pages).strip()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"resumeText": full}, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(full)} chars to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

"""Check that every Must security requirement names at least one test, and that every named
abuse (AB-nn) or simulation (SIM-nn) test ID exists in the test plan.

Run: make trace
"""
import re
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
REQS = PROJECT / "06_requirements_register.md"
PLAN = PROJECT / "04_tool_spec_and_test_plan.md"

ID_RE = re.compile(r"\b(?:AB|SIM)-\d{2}\b")


def must_security_rows(text: str):
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 5 and re.fullmatch(r"R-S\d{2}", cells[0]) and cells[2] == "Must":
            yield cells[0], cells[4]


def main() -> int:
    known = set(ID_RE.findall(PLAN.read_text(encoding="utf-8")))
    problems = []
    rows = list(must_security_rows(REQS.read_text(encoding="utf-8")))
    for req_id, tests in rows:
        if not tests:
            problems.append(f"{req_id}: no tests listed")
        for tid in ID_RE.findall(tests):
            if tid not in known:
                problems.append(f"{req_id}: unknown test id {tid}")
    for p in problems:
        print("GAP", p)
    print(f"checked {len(rows)} Must security requirements, {len(problems)} gaps")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

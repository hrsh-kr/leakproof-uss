"""Generate src/leakproof/iam/matrix.json from the table in 04_tool_spec_and_test_plan.md.

The spec table is the single source of truth. A test checks the JSON matches the spec.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT.parent / "04_tool_spec_and_test_plan.md"
OUT = ROOT / "src" / "leakproof" / "iam" / "matrix.json"


def parse_cell(cell: str) -> dict:
    cell = cell.strip()
    if cell == "Y":
        return {"allow": True, "scopes": []}
    if cell == "N":
        return {"allow": False, "scopes": []}
    m = re.fullmatch(r"Y\((S\d(?:,S\d)*)\)", cell)
    if m:
        return {"allow": True, "scopes": m.group(1).split(",")}
    raise ValueError(f"unrecognised matrix cell: {cell!r}")


def parse_spec(text: str) -> dict:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("| Action |"))
    header = [c.strip() for c in lines[start].strip().strip("|").split("|")]
    roles = header[1:]
    actions = {}
    for line in lines[start + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        name, values = cells[0], cells[1:]
        if len(values) != len(roles):
            raise ValueError(f"row {name!r} has {len(values)} cells, expected {len(roles)}")
        actions[name] = {r: parse_cell(v) for r, v in zip(roles, values)}
    return {"roles": roles, "actions": actions}


def main() -> int:
    data = parse_spec(SPEC.read_text(encoding="utf-8"))
    OUT.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(data['actions'])} actions, {len(data['roles'])} roles)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

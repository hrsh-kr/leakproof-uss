"""Permission matrix loader. Default deny: anything not in the matrix is refused (rule S7)."""
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_MATRIX_PATH = Path(__file__).with_name("matrix.json")


@dataclass(frozen=True)
class Decision:
    allowed: bool
    scopes: tuple[str, ...] = ()


DENY = Decision(False)


@lru_cache(maxsize=1)
def load_matrix() -> dict:
    return json.loads(_MATRIX_PATH.read_text(encoding="utf-8"))


def lookup(role: str, action: str) -> Decision:
    """Return the matrix decision for (role, action). Unknown role or action is a denial."""
    cell = load_matrix()["actions"].get(action, {}).get(role)
    if cell is None:
        return DENY
    return Decision(bool(cell["allow"]), tuple(cell["scopes"]))

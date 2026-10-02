import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_every_must_security_requirement_has_a_known_test():
    out = subprocess.run([sys.executable, str(ROOT / "scripts" / "trace_requirements.py")],
                         capture_output=True, text=True, check=False)
    assert out.returncode == 0, out.stdout

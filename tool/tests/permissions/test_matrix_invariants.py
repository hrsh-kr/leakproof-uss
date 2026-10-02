"""Security invariants on the permission matrix itself (data-level checks).

These hold regardless of how the web app is built. If one fails, the spec table in
04_tool_spec_and_test_plan.md has drifted into an unsafe state.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from leakproof.iam import matrix as m
from leakproof.iam.matrix import lookup

pytestmark = pytest.mark.permissions

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import gen_matrix

DATA = m.load_matrix()
ROLES = DATA["roles"]
ACTIONS = DATA["actions"]

EXPECTED_ROLES = {
    "anon", "setter", "reviewer", "admin", "custodian", "centre", "investigator", "auditor",
}

# Actions no human role may ever perform.
NEVER = [
    "Read any question text in bulk",
    "Read the drawn paper in plaintext",
    "Write or delete audit entries directly",
    "Delete any record",
]

# Actions allowed without any scoping rule (everything else must be scoped or role-restricted).
UNSCOPED_OK = {
    "Log in, log out",
    "Read public log head hash",
    "Create or edit exam profile and blueprint",
    "Assign setters and reviewers",
    "Lock the pool",
    "Start a draw",
    "See balance report (counts only)",
    "Start sealing ceremony",
    "Approve sealing (signature)",
    "Read full audit log",
    "Verify the audit chain",
    # Reviewed 2026-10-02: the auditor already reads the full log, so this row adds no power.
    # Open question (R-P01): limit what log details an auditor sees (e.g. candidate seat data).
    "Read log entries for a case",
}


def test_roles_are_exactly_the_expected_set():
    assert set(ROLES) == EXPECTED_ROLES


def test_every_action_has_a_cell_for_every_role():
    for action, row in ACTIONS.items():
        assert set(row) == set(ROLES), action


@pytest.mark.parametrize("action", NEVER)
def test_forbidden_actions_are_denied_to_every_role(action):
    for role in ROLES:
        assert not lookup(role, action).allowed, f"{role} may {action}"


def test_default_deny_for_unknown_action_and_unknown_role():
    assert not lookup("admin", "Launch missiles").allowed
    assert not lookup("root", "Log in, log out").allowed
    assert not lookup("", "").allowed


def test_anonymous_may_only_log_in_and_read_public_head():
    allowed = {a for a in ACTIONS if lookup("anon", a).allowed}
    assert allowed == {"Log in, log out", "Read public log head hash"}


def test_admin_cannot_do_custodian_or_content_actions():
    for action in [
        "Approve sealing (signature)",
        "Provide a key share at release",
        "Submit question",
        "Read own question content",
        "Read another person's question",
        "Submit a review",
        "Print a copy",
        "Request release for a centre",
    ]:
        assert not lookup("admin", action).allowed, action


def test_only_admin_can_start_draw_lock_pool_or_manage_users():
    for action in ["Start a draw", "Lock the pool", "Create users, assign roles",
                   "Start sealing ceremony"]:
        who = {r for r in ROLES if lookup(r, action).allowed}
        assert who == {"admin"}, (action, who)


def test_only_custodians_approve_sealing_or_provide_shares():
    for action in ["Approve sealing (signature)", "Provide a key share at release"]:
        who = {r for r in ROLES if lookup(r, action).allowed}
        assert who == {"custodian"}, (action, who)


def test_user_management_is_bound_by_separation_of_duties():
    d = lookup("admin", "Create users, assign roles")
    assert d.allowed and "S6" in d.scopes


def test_content_and_centre_actions_carry_the_right_scopes():
    assert "S1" in lookup("setter", "Submit question").scopes
    assert "S4" in lookup("setter", "Submit question").scopes
    assert "S2" in lookup("reviewer", "Read another person's question").scopes
    assert "S2" in lookup("reviewer", "Submit a review").scopes
    for action in ["Request release for a centre", "Print a copy", "Submit seating report",
                   "View candidate seat list"]:
        assert "S3" in lookup("centre", action).scopes, action
    assert "S4" in lookup("centre", "Print a copy").scopes
    assert "S4" in lookup("custodian", "Provide a key share at release").scopes


def test_investigator_actions_are_case_scoped():
    for action in ["Upload leak evidence, run matcher", "View suspect list",
                   "Confirm or dismiss a suspect", "Read log entries for a case",
                   "View candidate seat list"]:
        assert "S5" in lookup("investigator", action).scopes, action


def test_least_privilege_unscoped_grants_are_an_explicit_short_list():
    """Any allowed cell without a scope must be on the reviewed list, or it is a new broad grant."""
    for action, row in ACTIONS.items():
        for role, cell in row.items():
            if cell["allow"] and not cell["scopes"] and action not in UNSCOPED_OK:
                pytest.fail(f"unscoped grant not reviewed: {role} -> {action}")


def test_only_admin_and_auditor_read_full_log():
    who = {r for r in ROLES if lookup(r, "Read full audit log").allowed}
    assert who == {"admin", "auditor"}


def test_no_role_can_both_alter_history_and_read_it():
    """Reading the log is allowed to some; changing it is allowed to none."""
    for role in ROLES:
        assert not lookup(role, "Write or delete audit entries directly").allowed


def test_matrix_json_matches_the_spec_table():
    spec = gen_matrix.parse_spec(gen_matrix.SPEC.read_text(encoding="utf-8"))
    assert spec == DATA, "matrix.json is out of date: run `make matrix`"


def test_every_cell_value_parses_and_only_known_scopes_appear():
    for action, row in ACTIONS.items():
        for role, cell in row.items():
            assert isinstance(cell["allow"], bool)
            assert set(cell["scopes"]) <= {"S1", "S2", "S3", "S4", "S5", "S6"}, (role, action)
            if not cell["allow"]:
                assert cell["scopes"] == [], (role, action)


def test_generator_rejects_a_malformed_cell():
    with pytest.raises(ValueError):
        gen_matrix.parse_cell("maybe")
    with pytest.raises(ValueError):
        gen_matrix.parse_cell("Y(S9x)")


def test_json_file_is_valid_json_on_disk():
    path = Path(m.__file__).with_name("matrix.json")
    json.loads(path.read_text(encoding="utf-8"))


def test_generator_script_runs(tmp_path):
    out = subprocess.run([sys.executable, str(ROOT / "scripts" / "gen_matrix.py")],
                         capture_output=True, text=True, check=True)
    assert "wrote" in out.stdout

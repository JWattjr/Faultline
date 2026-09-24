import json
import pytest

from .conftest import as_wallet, set_tx_time
from .helpers import (
    case_data, create_args, create_case, file_hash, seal_case, submit_pipeline,
    url,
)


@pytest.fixture
def wallets(direct_alice, direct_bob, direct_charlie):
    return [direct_alice, direct_bob, direct_charlie]


def assert_expired_accounting(record, case):
    accounting = record["accounting"]
    agent_ids = [agent["agent_id"] for agent in case["agents"]]
    assert record["state"] == "EXPIRED"
    assert accounting["escrow_status"] == "REFUNDED_DEMO_EXPIRED"
    assert accounting["escrow_locked_units"] == 0
    assert accounting["escrow_released_units"] == 0
    assert accounting["escrow_refunded_units"] == case["escrow_units"]
    assert accounting["agent_bonds_locked_units"] == 0
    assert accounting["agent_rewards"] == {agent_id: 0 for agent_id in agent_ids}
    assert accounting["bonds_returned"] == {
        agent["agent_id"]: agent["bond_units"] for agent in case["agents"]
    }
    assert accounting["bonds_slashed"] == {agent_id: 0 for agent_id in agent_ids}
    assert accounting["forfeiture_credited_units"] == 0


def test_deployment_version_and_empty_stats(faultline):
    version = json.loads(faultline.get_contract_version())
    stats = json.loads(faultline.get_stats())
    assert version["version"] == "faultline/1.1.0"
    assert version["runner"].endswith("1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6")
    assert version["accounting_unit"] == "DEMO"
    assert stats["total_charters"] == 0
    assert stats["states"]["DRAFT"] == 0


def test_create_and_get_sealed_charter(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    direct_vm.sender = direct_owner
    faultline.seal_charter(case["charter_id"])
    record = json.loads(faultline.get_charter(case["charter_id"]))
    agent = json.loads(faultline.get_agent(case["charter_id"], "AGENT-RESEARCH"))
    assert record["state"] == "SEALED"
    assert record["accounting"]["escrow_status"] == "LOCKED_DEMO"
    assert record["accounting"]["escrow_locked_units"] == 100000
    assert agent["wallet"] == as_wallet(wallets[0])
    assert agent["responsibility_clause_ids"] == ["C1"]


def test_only_requester_can_seal(faultline, direct_vm, direct_owner, direct_bob, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the requester"):
        faultline.seal_charter(case["charter_id"])


def test_charter_id_is_unique(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("already exists"):
        faultline.create_charter(*create_args(case, wallets))


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("charter_id", "x", "charter ID"),
        ("title", " ", "title"),
        ("purpose", "short", "purpose"),
        ("document_url", "http://evidence.example.org/evidence/charter.html", "HTTPS"),
        ("document_hash", "not-a-hash", "SHA-256"),
        ("evidence_base_url", "https://localhost/evidence", "public DNS"),
        ("max_retries", -1, "retry count"),
        ("max_retries", 4, "retry count"),
        ("escrow_units", 100001, "multiple of 10000"),
        ("primary_slash_bps", 10001, "PRIMARY slash"),
        ("contributing_slash_bps", 5001, "CONTRIBUTING slash"),
        ("settlement_version", "future-version", "unsupported settlement version"),
        ("expires_at", 1790164800, "future Unix timestamp"),
    ],
)
def test_create_charter_validation(faultline, direct_vm, direct_owner, wallets, field, value, message):
    case = case_data("accepted")
    args = create_args(case, wallets)
    positions = {
        "charter_id": 0, "title": 1, "purpose": 2, "document_url": 3,
        "document_hash": 4, "evidence_base_url": 5, "clauses_json": 6,
        "max_retries": 7, "agents_json": 8, "escrow_units": 9,
        "primary_slash_bps": 10, "contributing_slash_bps": 11,
        "expires_at": 12, "settlement_version": 13,
    }
    args[positions[field]] = value
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert(message):
        faultline.create_charter(*args)


def test_reward_basis_points_must_total_10000(faultline, direct_vm, direct_owner, wallets):
    case = case_data("accepted")
    args = create_args(case, wallets)
    agents = json.loads(args[8])
    agents[0]["reward_bps"] = 4999
    args[8] = json.dumps(agents)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("total exactly 10000"):
        faultline.create_charter(*args)


def test_unknown_assigned_clause_and_bad_agent_order_rejected(faultline, direct_vm, direct_owner, wallets):
    case = case_data("accepted")
    args = create_args(case, wallets)
    agents = json.loads(args[8])
    agents[0]["responsibility_clause_ids"] = ["C99"]
    args[8] = json.dumps(agents)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("unknown clause"):
        faultline.create_charter(*args)
    args = create_args(case, wallets)
    agents = json.loads(args[8])
    agents[0], agents[1] = agents[1], agents[0]
    args[8] = json.dumps(agents)
    with direct_vm.expect_revert("fixed pipeline order"):
        faultline.create_charter(*args)


def test_invalid_and_duplicate_clauses_rejected(faultline, direct_vm, direct_owner, wallets):
    case = case_data("accepted")
    args = create_args(case, wallets)
    clauses = json.loads(args[6])
    clauses[1]["id"] = "C1"
    args[6] = json.dumps(clauses)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("unique"):
        faultline.create_charter(*args)


def test_cancel_only_before_sealing(faultline, direct_vm, direct_owner, direct_bob, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the requester"):
        faultline.cancel_charter(case["charter_id"])
    direct_vm.sender = direct_owner
    faultline.cancel_charter(case["charter_id"])
    assert json.loads(faultline.get_charter(case["charter_id"]))["state"] == "CANCELLED"
    with direct_vm.expect_revert("only a draft charter"):
        faultline.seal_charter(case["charter_id"])


def test_handoff_sender_must_be_assigned_agent(faultline, direct_vm, direct_owner, direct_bob, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    seal_case(faultline, direct_vm, direct_owner, case)
    fixture_agent = case["agents"][0]
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("assigned agent"):
        faultline.submit_handoff(case["charter_id"], 1, "AGENT-RESEARCH", url(fixture_agent["evidence"]), file_hash(fixture_agent["evidence"]), url(fixture_agent["artifact"]), file_hash(fixture_agent["artifact"]), "")


def test_handoffs_must_follow_pipeline_order(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    seal_case(faultline, direct_vm, direct_owner, case)
    fixture_agent = case["agents"][1]
    direct_vm.sender = wallets[1]
    with direct_vm.expect_revert("fixed pipeline order"):
        faultline.submit_handoff(case["charter_id"], 1, "AGENT-ANALYSIS", url(fixture_agent["evidence"]), file_hash(fixture_agent["evidence"]), url(fixture_agent["artifact"]), file_hash(fixture_agent["artifact"]), "a" * 64)


def test_previous_hash_chain_and_final_artifact(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    seal_case(faultline, direct_vm, direct_owner, case)
    research = case["agents"][0]
    direct_vm.sender = wallets[0]
    faultline.submit_handoff(case["charter_id"], 1, "AGENT-RESEARCH", url(research["evidence"]), file_hash(research["evidence"]), url(research["artifact"]), file_hash(research["artifact"]), "")
    analysis = case["agents"][1]
    direct_vm.sender = wallets[1]
    with direct_vm.expect_revert("does not match"):
        faultline.submit_handoff(case["charter_id"], 1, "AGENT-ANALYSIS", url(analysis["evidence"]), file_hash(analysis["evidence"]), url(analysis["artifact"]), file_hash(analysis["artifact"]), "0" * 64)
    submit_pipeline(faultline, direct_vm, case, wallets, start_index=1)
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    record = json.loads(faultline.get_charter(case["charter_id"]))
    assert attempt["handoffs_received"] == 3
    assert attempt["state"] == "READY_FOR_REVIEW"
    assert record["state"] == "READY_FOR_REVIEW"
    assert record["final_artifact"]["hash"] == file_hash(case["agents"][2]["artifact"])
    delivery = json.loads(faultline.get_handoff(case["charter_id"], 1, "AGENT-DELIVERY"))
    assert delivery["previous_output_hash"] == file_hash(case["agents"][1]["artifact"])


def test_each_handoff_stores_passed_edge_check_on_both_getters(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    seal_case(faultline, direct_vm, direct_owner, case)
    submit_pipeline(faultline, direct_vm, case, wallets)

    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    expected = {
        "hash_chain_ok": True,
        "on_time": True,
        "inside_evidence_base": True,
        "status": "PASSED",
    }
    for index, agent_id in enumerate(("AGENT-RESEARCH", "AGENT-ANALYSIS", "AGENT-DELIVERY")):
        assert attempt["handoffs"][index]["edge_check"] == expected
        handoff = json.loads(faultline.get_handoff(case["charter_id"], 1, agent_id))
        assert handoff["edge_check"] == expected


def test_evidence_hash_url_attempt_and_duplicate_handoff_validation(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    seal_case(faultline, direct_vm, direct_owner, case)
    agent = case["agents"][0]
    direct_vm.sender = wallets[0]
    base = (case["charter_id"], 1, "AGENT-RESEARCH")
    with direct_vm.expect_revert("outside the sealed evidence base"):
        faultline.submit_handoff(*base, "https://other.example.org/evidence.html", file_hash(agent["evidence"]), url(agent["artifact"]), file_hash(agent["artifact"]), "")
    with direct_vm.expect_revert("SHA-256"):
        faultline.submit_handoff(*base, url(agent["evidence"]), "bad", url(agent["artifact"]), file_hash(agent["artifact"]), "")
    with direct_vm.expect_revert("not current"):
        faultline.submit_handoff(case["charter_id"], 2, "AGENT-RESEARCH", url(agent["evidence"]), file_hash(agent["evidence"]), url(agent["artifact"]), file_hash(agent["artifact"]), "")
    faultline.submit_handoff(*base, url(agent["evidence"]), file_hash(agent["evidence"]), url(agent["artifact"]), file_hash(agent["artifact"]), "")
    with direct_vm.expect_revert("duplicate handoff"):
        faultline.submit_handoff(*base, url(agent["evidence"]), file_hash(agent["evidence"]), url(agent["artifact"]), file_hash(agent["artifact"]), "")


def test_bounded_getters_counters_and_pagination(faultline, direct_vm, direct_owner, wallets):
    first = create_case(faultline, direct_vm, direct_owner, wallets, key="accepted")
    second = create_case(faultline, direct_vm, direct_owner, wallets, key="remediation")
    page = json.loads(faultline.list_charters(0, 1))
    stats = json.loads(faultline.get_stats())
    assert page["total"] == 2
    assert page["items"][0]["charter_id"] == first["charter_id"]
    assert stats["states"]["DRAFT"] == 2
    with direct_vm.expect_revert("limit must be"):
        faultline.list_charters(0, 51)


def test_expire_only_after_deadline(faultline, direct_vm, direct_owner, direct_bob, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets)
    seal_case(faultline, direct_vm, direct_owner, case)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("deadline has not passed"):
        faultline.expire_charter(case["charter_id"])
    set_tx_time(direct_vm, "2027-01-01T00:00:00Z")
    faultline.expire_charter(case["charter_id"])
    record = json.loads(faultline.get_charter(case["charter_id"]))
    assert_expired_accounting(record, case)


def test_ready_for_review_charter_can_expire_without_settlement(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets, key="accepted")
    seal_case(faultline, direct_vm, direct_owner, case)
    submit_pipeline(faultline, direct_vm, case, wallets)
    assert json.loads(faultline.get_charter(case["charter_id"]))["state"] == "READY_FOR_REVIEW"

    set_tx_time(direct_vm, "2027-01-01T00:00:00Z")
    faultline.expire_charter(case["charter_id"])
    record = json.loads(faultline.get_charter(case["charter_id"]))
    assert_expired_accounting(record, case)

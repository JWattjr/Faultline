import json
import pytest

from .conftest import EVIDENCE, set_tx_time
from .helpers import (
    case_data, create_case, decision, file_hash, install_adjudication_mocks,
    register_fixture_mocks, submit_pipeline, submit_sealed_pipeline, url,
    breach_roles,
)


@pytest.fixture
def wallets(direct_alice, direct_bob, direct_charlie):
    return [direct_alice, direct_bob, direct_charlie]


def test_accepted_settlement_uses_frozen_integer_basis_points(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "accepted")
    install_adjudication_mocks(direct_vm, case, decision("ACCEPTED"))
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "ACCEPTED"
    assert direct_vm.run_validator() is True
    assert direct_vm.run_validator(
        leader_result=decision("BREACHED", ["C1", "C2"], breach_roles())
    ) is False
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    receipt = json.loads(faultline.get_receipt(case["charter_id"]))
    assert charter["state"] == "SETTLED_ACCEPTED"
    assert charter["accounting"]["escrow_released_units"] == 100000
    assert charter["accounting"]["agent_rewards"] == {
        "AGENT-RESEARCH": 50000, "AGENT-ANALYSIS": 30000, "AGENT-DELIVERY": 20000,
    }
    assert charter["accounting"]["bonds_returned"] == {
        "AGENT-RESEARCH": 1000, "AGENT-ANALYSIS": 1000, "AGENT-DELIVERY": 1000,
    }
    assert receipt["receipt_hash"]
    assert receipt["settlement_version"] == "faultline-settlement/1.0"
    assert receipt["outcome"] == "ACCEPTED"


def test_clause_disagreement_does_not_reach_consensus(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "breached")
    result = decision("BREACHED", ["C1", "C2"], breach_roles())
    install_adjudication_mocks(direct_vm, case, result)
    direct_vm.sender = direct_owner
    faultline.adjudicate(case["charter_id"], 1)
    assert direct_vm.run_validator() is True

    # Outcome and roles agree, but the validator also finds C3 violated.
    # Every normalized substantive field must match before settlement.
    divergent = decision("BREACHED", ["C1", "C2", "C3"], breach_roles())
    assert direct_vm.run_validator(leader_result=divergent) is False


def test_remediation_records_clause_without_roles_or_accounting_movement(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "remediation")
    install_adjudication_mocks(direct_vm, case, decision("REMEDIATION_REQUIRED", ["C3"]))
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "REMEDIATION_REQUIRED"
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    first = json.loads(faultline.get_attempt(case["charter_id"], 1))
    second = json.loads(faultline.get_attempt(case["charter_id"], 2))
    assert charter["state"] == "AWAITING_REMEDIATION"
    assert charter["current_attempt"] == 2
    assert charter["violated_clause_ids"] == ["C3"]
    assert charter["responsibility"] == []
    assert first["responsibility"] == []
    assert second["state"] == "OPEN"
    assert second["handoffs_received"] == 0
    assert charter["accounting"]["escrow_locked_units"] == 100000
    assert charter["accounting"]["agent_bonds_locked_units"] == 3000
    assert charter["accounting"]["escrow_released_units"] == 0
    assert charter["accounting"]["escrow_refunded_units"] == 0
    assert charter["accounting"]["bonds_slashed"] == {}
    assert faultline.get_receipt(case["charter_id"]) == "{}"


def test_opened_retry_accepts_current_attempt_and_rejects_previous_number(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "remediation")
    install_adjudication_mocks(direct_vm, case, decision("REMEDIATION_REQUIRED", ["C3"]))
    direct_vm.sender = direct_owner
    faultline.adjudicate(case["charter_id"], 1)
    research = case["agents"][0]
    direct_vm.sender = wallets[0]
    with direct_vm.expect_revert("attempt number"):
        faultline.submit_handoff(case["charter_id"], 1, "AGENT-RESEARCH", url(research["evidence"]), file_hash(research["evidence"]), url(research["artifact"]), file_hash(research["artifact"]), "")
    submit_pipeline(faultline, direct_vm, case, wallets, attempt=2)
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 2))
    assert attempt["state"] == "READY_FOR_REVIEW"
    assert attempt["handoffs_received"] == 3


def test_final_attempt_cannot_be_remediation(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "remediation")
    install_adjudication_mocks(direct_vm, case, decision("REMEDIATION_REQUIRED", ["C3"]))
    direct_vm.sender = direct_owner
    faultline.adjudicate(case["charter_id"], 1)
    submit_pipeline(faultline, direct_vm, case, wallets, attempt=2)
    install_adjudication_mocks(direct_vm, case, decision("REMEDIATION_REQUIRED", ["C3"]))
    with direct_vm.expect_revert("remediation requires"):
        faultline.adjudicate(case["charter_id"], 2)
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    assert charter["state"] == "READY_FOR_REVIEW"
    assert charter["accounting"]["escrow_locked_units"] == 100000


def test_breached_settlement_assigns_one_primary_and_credits_frozen_slashes(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "breached")
    result = decision("BREACHED", ["C1", "C2"], breach_roles())
    install_adjudication_mocks(direct_vm, case, result)
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "BREACHED"
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    receipt = json.loads(faultline.get_receipt(case["charter_id"]))
    assert charter["state"] == "SETTLED_BREACHED"
    assert [(entry["agent_id"], entry["role"]) for entry in charter["responsibility"]] == [
        ("AGENT-RESEARCH", "PRIMARY"), ("AGENT-ANALYSIS", "CONTRIBUTING"), ("AGENT-DELIVERY", "CLEAR"),
    ]
    assert charter["accounting"]["escrow_refunded_units"] == 100000
    assert charter["accounting"]["agent_rewards"] == {
        "AGENT-RESEARCH": 0, "AGENT-ANALYSIS": 0, "AGENT-DELIVERY": 0,
    }
    assert charter["accounting"]["bonds_slashed"] == {
        "AGENT-RESEARCH": 500, "AGENT-ANALYSIS": 250, "AGENT-DELIVERY": 0,
    }
    assert charter["accounting"]["bonds_returned"] == {
        "AGENT-RESEARCH": 500, "AGENT-ANALYSIS": 750, "AGENT-DELIVERY": 1000,
    }
    assert charter["accounting"]["forfeiture_credited_units"] == 750
    assert receipt["accounting"]["forfeiture_beneficiary"] == "REQUESTER"
    assert receipt["receipt_hash"]


@pytest.mark.parametrize(
    "bad_decision",
    [
        {"outcome": "NOT_AN_OUTCOME", "violated_clause_ids": [], "responsibility": []},
        {"outcome": "ACCEPTED", "violated_clause_ids": ["C1"], "responsibility": []},
        {"outcome": "ACCEPTED", "violated_clause_ids": [], "responsibility": breach_roles()},
        {"outcome": "REMEDIATION_REQUIRED", "violated_clause_ids": [], "responsibility": []},
        {"outcome": "REMEDIATION_REQUIRED", "violated_clause_ids": ["C3"], "responsibility": breach_roles()},
        {"outcome": "BREACHED", "violated_clause_ids": ["C99"], "responsibility": breach_roles()},
        {"outcome": "BREACHED", "violated_clause_ids": ["C1", "C2"], "responsibility": breach_roles()[:2]},
        {"outcome": "BREACHED", "violated_clause_ids": ["C1", "C2"], "responsibility": [
            {"agent_id": "AGENT-RESEARCH", "role": "PRIMARY", "clause_ids": ["C1"]},
            {"agent_id": "AGENT-ANALYSIS", "role": "PRIMARY", "clause_ids": ["C2"]},
            {"agent_id": "AGENT-DELIVERY", "role": "CLEAR", "clause_ids": []},
        ]},
        {"outcome": "BREACHED", "violated_clause_ids": ["C1", "C2"], "responsibility": [
            {"agent_id": "AGENT-RESEARCH", "role": "PRIMARY", "clause_ids": ["C1"]},
            {"agent_id": "AGENT-ANALYSIS", "role": "CONTRIBUTING", "clause_ids": ["C1"]},
            {"agent_id": "AGENT-DELIVERY", "role": "CLEAR", "clause_ids": []},
        ]},
        {"outcome": "BREACHED", "violated_clause_ids": ["C1", "C2"], "responsibility": [
            {"agent_id": "AGENT-RESEARCH", "role": "PRIMARY", "clause_ids": ["C1"]},
            {"agent_id": "UNKNOWN", "role": "CONTRIBUTING", "clause_ids": ["C2"]},
            {"agent_id": "AGENT-DELIVERY", "role": "CLEAR", "clause_ids": []},
        ]},
        {"outcome": "BREACHED", "violated_clause_ids": ["C1", "C2"], "responsibility": [
            {"agent_id": "AGENT-RESEARCH", "role": "PRIMARY", "clause_ids": ["C1"]},
            {"agent_id": "AGENT-ANALYSIS", "role": "CONTRIBUTING", "clause_ids": ["C2"]},
            {"agent_id": "AGENT-DELIVERY", "role": "UNKNOWN_ROLE", "clause_ids": []},
        ]},
    ],
)
def test_invalid_canonical_model_results_revert(faultline, direct_vm, direct_owner, wallets, bad_decision):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "breached")
    install_adjudication_mocks(direct_vm, case, bad_decision)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("LLM_ERROR"):
        faultline.adjudicate(case["charter_id"], 1)
    assert json.loads(faultline.get_charter(case["charter_id"]))["state"] == "READY_FOR_REVIEW"


def test_malformed_llm_json_is_not_accepted(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "accepted")
    install_adjudication_mocks(direct_vm, case, "{not valid JSON")
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("LLM_ERROR"):
        faultline.adjudicate(case["charter_id"], 1)
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    assert charter["state"] == "READY_FOR_REVIEW"
    assert charter["accounting"]["escrow_locked_units"] == 100000


@pytest.mark.parametrize(("status", "prefix"), [(404, "EXTERNAL"), (503, "TRANSIENT"), (429, "TRANSIENT")])
def test_evidence_http_errors_are_classified_and_do_not_settle(faultline, direct_vm, direct_owner, wallets, status, prefix):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "accepted")
    document = case["charter_document"]
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*charter-accepted\.html$", {"response": {"status": 200, "headers": {"content-type": b"text/html"}, "body": (EVIDENCE / document).read_bytes()}, "method": "GET"})
    research_evidence = case["agents"][0]["evidence"]
    direct_vm.mock_web(rf".*{research_evidence}$", {"response": {"status": status, "headers": {}, "body": b"unavailable"}, "method": "GET"})
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert(prefix):
        faultline.adjudicate(case["charter_id"], 1)
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    assert charter["state"] == "READY_FOR_REVIEW"
    assert charter["accounting"]["escrow_locked_units"] == 100000


def test_empty_evidence_is_a_business_error_and_does_not_settle(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "accepted")
    document = case["charter_document"]
    research_evidence = case["agents"][0]["evidence"]
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*charter-accepted\.html$", {"response": {"status": 200, "headers": {}, "body": (EVIDENCE / document).read_bytes()}, "method": "GET"})
    direct_vm.mock_web(rf".*{research_evidence}$", {"response": {"status": 200, "headers": {}, "body": b""}, "method": "GET"})
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("empty evidence"):
        faultline.adjudicate(case["charter_id"], 1)
    assert json.loads(faultline.get_charter(case["charter_id"]))["state"] == "READY_FOR_REVIEW"


def test_contradictory_evidence_is_available_to_the_judgment(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "remediation")
    contradictory = (
        b"<main>Source card X says the observed count is 620. Source card Y says the same observed count is 418. "
        b"The records disagree about the count and do not identify which card is current.</main>"
    )
    research_evidence = case["agents"][0]["evidence"]
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*charter-remediation\.html$", {"response": {"status": 200, "headers": {}, "body": (EVIDENCE / case["charter_document"]).read_bytes()}, "method": "GET"})
    direct_vm.mock_web(rf".*{research_evidence}$", {"response": {"status": 200, "headers": {}, "body": contradictory}, "method": "GET"})
    for agent in case["agents"]:
        if agent["agent_id"] == "AGENT-RESEARCH":
            continue
        for field in ("evidence", "artifact"):
            name = agent[field]
            direct_vm.mock_web(rf".*{name}$", {"response": {"status": 200, "headers": {}, "body": (EVIDENCE / name).read_bytes()}, "method": "GET"})
    # The submitted hash is immutable, so a changed response is rejected before
    # an LLM can turn the contradictory page into an accepted outcome.
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("content hash mismatch"):
        faultline.adjudicate(case["charter_id"], 1)
    assert json.loads(faultline.get_charter(case["charter_id"]))["accounting"]["escrow_locked_units"] == 100000


def test_repeated_terminal_adjudication_reverts(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "accepted")
    install_adjudication_mocks(direct_vm, case, decision("ACCEPTED"))
    direct_vm.sender = direct_owner
    faultline.adjudicate(case["charter_id"], 1)
    with direct_vm.expect_revert("not ready for adjudication"):
        faultline.adjudicate(case["charter_id"], 1)
    assert json.loads(faultline.get_stats())["outcomes"]["ACCEPTED"] == 1


def test_getters_show_attempt_chain_and_receipt(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "breached")
    install_adjudication_mocks(direct_vm, case, decision("BREACHED", ["C1", "C2"], breach_roles()))
    direct_vm.sender = direct_owner
    faultline.adjudicate(case["charter_id"], 1)
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    receipt = json.loads(faultline.get_receipt(case["charter_id"]))
    assert [item["agent_id"] for item in attempt["handoffs"]] == ["AGENT-RESEARCH", "AGENT-ANALYSIS", "AGENT-DELIVERY"]
    assert attempt["outcome"] == "BREACHED"
    assert receipt["artifact_hashes"]["AGENT-DELIVERY"] == charter["final_artifact"]["hash"]

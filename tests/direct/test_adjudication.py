import hashlib
import json
import pytest

from .conftest import EVIDENCE, set_tx_time
from .helpers import (
    assessment_result, case_data, create_case, decision, file_hash, install_adjudication_mocks,
    register_fixture_mocks, seal_case, submit_pipeline, submit_sealed_pipeline, url,
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
        leader_result=assessment_result(decision("BREACHED", ["C1", "C2"], breach_roles()))
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


def test_validator_compares_outcome_and_roles_but_allows_clause_differences(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "breached")
    result = decision("BREACHED", ["C1", "C2"], breach_roles())
    install_adjudication_mocks(direct_vm, case, result)
    direct_vm.sender = direct_owner
    faultline.adjudicate(case["charter_id"], 1)
    assert direct_vm.run_validator() is True

    # The leader and validator agree on outcome and role assignments. Clause
    # citations remain visible in the records but do not change settlement.
    divergent = decision("BREACHED", ["C1", "C2", "C3"], breach_roles())
    assert direct_vm.run_validator(leader_result=assessment_result(divergent)) is True

    different_roles = decision("BREACHED", ["C1", "C2"], breach_roles(primary="AGENT-ANALYSIS", contributing="AGENT-RESEARCH"))
    assert direct_vm.run_validator(leader_result=assessment_result(different_roles)) is False


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
    assert charter["accounting"]["forfeiture_credits"] == {}
    assert charter["accounting"]["forfeiture_burned_units"] == 0
    assert receipt["accounting"]["forfeiture_beneficiary"] == "REQUESTER"
    assert receipt["forfeiture_credits"] == {}
    assert receipt["forfeiture_burned_units"] == 0
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
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    assert charter["state"] == "READY_FOR_REVIEW"
    assert charter["accounting"]["escrow_locked_units"] == 100000
    assert attempt["basis"] == ""
    assert attempt["tampered_sources"] == []


def test_network_error_during_adjudication_is_retryable_and_leaves_state_unchanged(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "accepted")
    direct_vm.clear_mocks()
    for filename in [case["charter_document"]]:
        direct_vm.mock_web(rf".*{filename}$", {"response": {"status": 200, "headers": {}, "body": (EVIDENCE / filename).read_bytes()}, "method": "GET"})
    missing_source = case["agents"][0]["evidence"]
    for agent in case["agents"]:
        for field in ("evidence", "artifact"):
            filename = agent[field]
            if filename == missing_source:
                continue
            direct_vm.mock_web(rf".*{filename}$", {"response": {"status": 200, "headers": {}, "body": (EVIDENCE / filename).read_bytes()}, "method": "GET"})
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("TRANSIENT"):
        faultline.adjudicate(case["charter_id"], 1)
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    assert charter["state"] == "READY_FOR_REVIEW"
    assert charter["accounting"]["escrow_locked_units"] == 100000
    assert attempt["state"] == "READY_FOR_REVIEW"
    assert attempt["basis"] == ""
    assert attempt["tampered_sources"] == []


def test_empty_http_200_with_changed_hash_is_evidence_tampering(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "accepted")
    research_evidence = case["agents"][0]["evidence"]
    direct_vm.clear_mocks()
    register_fixture_mocks(direct_vm, case, {research_evidence: b""})
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "BREACHED"
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    assert attempt["basis"] == "EVIDENCE_TAMPERED"
    assert attempt["tampered_sources"][0]["fetched_hash"] == hashlib.sha256(b"").hexdigest()


def test_changed_evidence_settles_deterministic_breach_without_llm(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "remediation")
    contradictory = (
        b"<main>Source card X says the observed count is 620. Source card Y says the same observed count is 418. "
        b"The records disagree about the count and do not identify which card is current.</main>"
    )
    research_evidence = case["agents"][0]["evidence"]
    direct_vm.clear_mocks()
    register_fixture_mocks(direct_vm, case, {research_evidence: contradictory})
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "BREACHED"
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    actual_hash = hashlib.sha256(contradictory).hexdigest()
    assert attempt["basis"] == "EVIDENCE_TAMPERED"
    assert attempt["tampered_sources"] == [{
        "agent_id": "AGENT-RESEARCH", "source_kind": "EVIDENCE",
        "url": url(research_evidence),
        "submitted_hash": file_hash(research_evidence), "fetched_hash": actual_hash,
    }]
    assert attempt["violated_clause_ids"] == ["C1"]
    assert [(row["agent_id"], row["role"]) for row in attempt["responsibility"]] == [
        ("AGENT-RESEARCH", "PRIMARY"), ("AGENT-ANALYSIS", "CLEAR"), ("AGENT-DELIVERY", "CLEAR"),
    ]
    assert charter["state"] == "SETTLED_BREACHED"
    assert charter["accounting"]["escrow_refunded_units"] == 100000
    assert direct_vm.run_validator() is True


def test_tamper_forfeiture_is_split_between_clear_agents_with_remainder_burned(faultline, direct_vm, direct_owner, wallets):
    case = create_case(faultline, direct_vm, direct_owner, wallets, "remediation", primary_slash_bps=5010)
    seal_case(faultline, direct_vm, direct_owner, case)
    submit_pipeline(faultline, direct_vm, case, wallets)
    changed = {case["agents"][0]["evidence"]: b"Research evidence changed after submission."}
    direct_vm.clear_mocks()
    register_fixture_mocks(direct_vm, case, changed)
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "BREACHED"
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    receipt = json.loads(faultline.get_receipt(case["charter_id"]))
    accounting = charter["accounting"]
    assert json.loads(faultline.get_attempt(case["charter_id"], 1))["basis"] == "EVIDENCE_TAMPERED"
    assert accounting["bonds_slashed"]["AGENT-RESEARCH"] == 501
    assert accounting["forfeiture_beneficiary"] == "CLEAR_AGENTS"
    assert accounting["forfeiture_credits"] == {"AGENT-ANALYSIS": 250, "AGENT-DELIVERY": 250}
    assert accounting["forfeiture_credited_units"] == 500
    assert accounting["forfeiture_burned_units"] == 1
    assert accounting["escrow_refunded_units"] == 100000
    assert receipt["forfeiture_credits"] == accounting["forfeiture_credits"]
    assert receipt["forfeiture_burned_units"] == 1
    assert receipt["accounting"]["forfeiture_credits"] == accounting["forfeiture_credits"]


def test_tamper_forfeiture_is_fully_burned_when_no_agent_is_clear(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "breached")
    changed = {agent["evidence"]: f"Changed {agent['agent_id']} evidence".encode() for agent in case["agents"]}
    direct_vm.clear_mocks()
    register_fixture_mocks(direct_vm, case, changed)
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "BREACHED"
    charter = json.loads(faultline.get_charter(case["charter_id"]))
    receipt = json.loads(faultline.get_receipt(case["charter_id"]))
    accounting = charter["accounting"]
    assert json.loads(faultline.get_attempt(case["charter_id"], 1))["basis"] == "EVIDENCE_TAMPERED"
    assert all(item["role"] != "CLEAR" for item in charter["responsibility"])
    assert accounting["forfeiture_beneficiary"] == "BURNED"
    assert accounting["forfeiture_credits"] == {}
    assert accounting["forfeiture_credited_units"] == 0
    assert accounting["forfeiture_burned_units"] == sum(accounting["bonds_slashed"].values())
    assert accounting["escrow_refunded_units"] == 100000
    assert receipt["forfeiture_credits"] == {}
    assert receipt["forfeiture_burned_units"] == accounting["forfeiture_burned_units"]


def test_multiple_changed_sources_use_pipeline_order_for_roles(faultline, direct_vm, direct_owner, wallets):
    case = submit_sealed_pipeline(faultline, direct_vm, direct_owner, wallets, "breached")
    changed = {
        case["agents"][0]["evidence"]: b"Research evidence changed after submission.",
        case["agents"][2]["artifact"]: b"Delivery artifact changed after submission.",
    }
    direct_vm.clear_mocks()
    filenames = [case["charter_document"]]
    for agent in case["agents"]:
        filenames.extend([agent["evidence"], agent["artifact"]])
    for filename in filenames:
        body = changed.get(filename, (EVIDENCE / filename).read_bytes())
        direct_vm.mock_web(
            rf".*{filename}$",
            {"response": {"status": 200, "headers": {}, "body": body}, "method": "GET"},
        )
    direct_vm.sender = direct_owner
    assert faultline.adjudicate(case["charter_id"], 1) == "BREACHED"
    attempt = json.loads(faultline.get_attempt(case["charter_id"], 1))
    assert attempt["basis"] == "EVIDENCE_TAMPERED"
    assert attempt["violated_clause_ids"] == ["C1", "C3"]
    assert [(row["agent_id"], row["role"]) for row in attempt["responsibility"]] == [
        ("AGENT-RESEARCH", "PRIMARY"), ("AGENT-ANALYSIS", "CLEAR"), ("AGENT-DELIVERY", "CONTRIBUTING"),
    ]
    assert [source["agent_id"] for source in attempt["tampered_sources"]] == ["AGENT-RESEARCH", "AGENT-DELIVERY"]


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

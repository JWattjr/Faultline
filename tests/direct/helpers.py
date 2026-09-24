import hashlib
import json
import re
from pathlib import Path

from .conftest import BASE_URL, EVIDENCE, as_wallet

MANIFEST = json.loads((EVIDENCE / "manifest.json").read_text(encoding="utf-8"))


def case_data(key):
    return next(item for item in MANIFEST["cases"] if item["key"] == key)


def file_hash(name):
    return hashlib.sha256((EVIDENCE / name).read_bytes()).hexdigest()


def url(name):
    return f"{BASE_URL}/{name}"


def create_args(case, wallets, **overrides):
    agents = []
    for fixture_agent, wallet in zip(case["agents"], wallets, strict=True):
        agent = {key: fixture_agent[key] for key in (
            "agent_id", "slot", "role", "bond_units", "reward_bps", "responsibility_clause_ids"
        )}
        agent["wallet"] = as_wallet(wallet)
        agents.append(agent)
    values = {
        "charter_id": case["charter_id"],
        "title": case["title"],
        "purpose": case["purpose"],
        "document_url": url(case["charter_document"]),
        "document_hash": file_hash(case["charter_document"]),
        "evidence_base_url": BASE_URL,
        "clauses_json": json.dumps(case["clauses"]),
        "max_retries": case["max_retries"],
        "agents_json": json.dumps(agents),
        "escrow_units": case["escrow_units"],
        "primary_slash_bps": case["primary_slash_bps"],
        "contributing_slash_bps": case["contributing_slash_bps"],
        "expires_at": 1790251200,
        "settlement_version": "faultline-settlement/1.0",
    }
    values.update(overrides)
    return [values[key] for key in (
        "charter_id", "title", "purpose", "document_url", "document_hash",
        "evidence_base_url", "clauses_json", "max_retries", "agents_json",
        "escrow_units", "primary_slash_bps", "contributing_slash_bps",
        "expires_at", "settlement_version",
    )]


def create_case(contract, vm, requester, agents, key="accepted", **overrides):
    case = case_data(key)
    vm.sender = requester
    contract.create_charter(*create_args(case, agents, **overrides))
    return case


def register_fixture_mocks(vm, case, overrides=None):
    overrides = overrides or {}
    filenames = [case["charter_document"]]
    for agent in case["agents"]:
        filenames.extend([agent["evidence"], agent["artifact"]])
    for name in filenames:
        raw = overrides.get(name, (EVIDENCE / name).read_bytes())
        vm.mock_web(
            rf".*{re.escape(name)}$",
            {"response": {
                "status": 200,
                "headers": {"content-type": b"text/html; charset=utf-8"},
                "body": raw,
            }, "method": "GET"},
        )


def submit_pipeline(contract, vm, case, wallets, attempt=1, start_index=0):
    if start_index == 0:
        vm.sender = wallets[0]
        contract.submit_handoff(
            case["charter_id"], attempt, "AGENT-RESEARCH",
            url(case["agents"][0]["evidence"]), file_hash(case["agents"][0]["evidence"]),
            url(case["agents"][0]["artifact"]), file_hash(case["agents"][0]["artifact"]), "",
        )
    previous = file_hash(case["agents"][max(start_index - 1, 0)]["artifact"])
    for index in range(max(start_index, 1), 3):
        agent_id = ("AGENT-RESEARCH", "AGENT-ANALYSIS", "AGENT-DELIVERY")[index]
        wallet = wallets[index]
        vm.sender = wallet
        agent = case["agents"][index]
        contract.submit_handoff(
            case["charter_id"], attempt, agent_id,
            url(agent["evidence"]), file_hash(agent["evidence"]),
            url(agent["artifact"]), file_hash(agent["artifact"]), previous,
        )
        previous = file_hash(agent["artifact"])


def seal_case(contract, vm, requester, case):
    vm.sender = requester
    contract.seal_charter(case["charter_id"])


def submit_sealed_pipeline(contract, vm, requester, wallets, key="accepted", attempt=1):
    case = create_case(contract, vm, requester, wallets, key)
    seal_case(contract, vm, requester, case)
    submit_pipeline(contract, vm, case, wallets, attempt)
    return case


def decision(outcome, violated=None, roles=None):
    return {
        "outcome": outcome,
        "violated_clause_ids": violated or [],
        "responsibility": roles or [],
    }


def assessment_result(value, basis="VALIDATOR_JUDGMENT", tampered_sources=None):
    return {
        "decision": value,
        "basis": basis,
        "tampered_sources": tampered_sources or [],
    }


def breach_roles(primary="AGENT-RESEARCH", contributing="AGENT-ANALYSIS"):
    role_by_agent = {
        "AGENT-RESEARCH": ("PRIMARY", ["C1"]),
        "AGENT-ANALYSIS": ("CONTRIBUTING", ["C2"]),
        "AGENT-DELIVERY": ("CLEAR", []),
    }
    if primary != "AGENT-RESEARCH" or contributing != "AGENT-ANALYSIS":
        role_by_agent = {
            "AGENT-RESEARCH": ("PRIMARY" if primary == "AGENT-RESEARCH" else "CONTRIBUTING" if contributing == "AGENT-RESEARCH" else "CLEAR", ["C1"] if primary == "AGENT-RESEARCH" or contributing == "AGENT-RESEARCH" else []),
            "AGENT-ANALYSIS": ("PRIMARY" if primary == "AGENT-ANALYSIS" else "CONTRIBUTING" if contributing == "AGENT-ANALYSIS" else "CLEAR", ["C2"] if primary == "AGENT-ANALYSIS" or contributing == "AGENT-ANALYSIS" else []),
            "AGENT-DELIVERY": ("PRIMARY" if primary == "AGENT-DELIVERY" else "CONTRIBUTING" if contributing == "AGENT-DELIVERY" else "CLEAR", ["C3"] if primary == "AGENT-DELIVERY" or contributing == "AGENT-DELIVERY" else []),
        }
    return [
        {"agent_id": agent_id, "role": role_by_agent[agent_id][0], "clause_ids": role_by_agent[agent_id][1]}
        for agent_id in ("AGENT-RESEARCH", "AGENT-ANALYSIS", "AGENT-DELIVERY")
    ]


def install_adjudication_mocks(vm, case, result):
    vm.clear_mocks()
    register_fixture_mocks(vm, case)
    vm.mock_llm(r".*FAULTLINE_CANONICAL_ADJUDICATION.*", result)

import atexit
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = str(ROOT / "contracts" / "faultline.py")
EVIDENCE = ROOT / "public" / "evidence"
BASE_URL = "https://evidence.example.org/evidence"
GENVM_RUNNER_HASH = "5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng"
os.environ["GENVM_VERSION"] = "v0.6.0-rc5"

if sys.platform == "win32":
    # genlayer-test 0.30.0rc2 unlinks an open stdin temporary file on Windows.
    from gltest.direct import loader

    _pending = []
    _original_inject = loader._inject_message_to_fd0

    def _deferred_unlink_factory(real_unlink):
        def unlink(path, *args, **kwargs):
            try:
                real_unlink(path, *args, **kwargs)
            except PermissionError:
                _pending.append(path)

        return unlink

    def _inject_windows_safe(vm):
        real_unlink = os.unlink
        os.unlink = _deferred_unlink_factory(real_unlink)
        try:
            _original_inject(vm)
        finally:
            os.unlink = real_unlink

    def _cleanup_pending():
        for path in _pending:
            try:
                os.unlink(path)
            except OSError:
                pass

    loader._inject_message_to_fd0 = _inject_windows_safe
    atexit.register(_cleanup_pending)

# The v0.3 runner expects mocked response_format=json payloads as source text.
from gltest.direct.vm import VMContext  # noqa: E402

_original_mock_llm = VMContext.mock_llm


def _mock_llm_as_text(self, prompt_pattern, response):
    # This genlayer-test release parses JSON strings once before returning
    # them. Double-encode so response_format="json" receives raw JSON text.
    raw_text = json.dumps(response)
    return _original_mock_llm(self, prompt_pattern, json.dumps(raw_text))


VMContext.mock_llm = _mock_llm_as_text

if GENVM_RUNNER_HASH not in Path(CONTRACT).read_text(encoding="utf-8").splitlines()[0]:
    raise RuntimeError("The direct-test runner hash does not match the contract header")


def as_wallet(value):
    address = getattr(value, "as_hex", None)
    if callable(address):
        address = address()
    if address:
        return str(address).lower()
    return str(value).lower()


def set_tx_time(vm, iso_time):
    vm.warp(iso_time)
    import genlayer.message as message

    message.raw["datetime"] = iso_time


@pytest.fixture
def faultline(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    contract = direct_deploy(CONTRACT)
    set_tx_time(direct_vm, "2026-09-23T12:00:00Z")
    return contract

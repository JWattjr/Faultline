import atexit
import io
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = str(ROOT / "contracts" / "faultline.py")
EVIDENCE = ROOT / "public" / "evidence"
BASE_URL = "https://evidence.example.org/evidence"
GENVM_RUNNER_HASH = "1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"
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

    _original_file_io = io.FileIO
    _stdin_payload = b""

    def _file_io_windows_safe(file, *args, **kwargs):
        if file == 0:
            class MessageInput(io.BytesIO):
                def readall(self):
                    return self.read()
            return MessageInput(_stdin_payload)
        return _original_file_io(file, *args, **kwargs)

    _original_safe_inject = loader._inject_message_to_fd0

    def _inject_and_capture(vm):
        global _stdin_payload
        _original_safe_inject(vm)
        from genlayer.py import calldata
        from genlayer.py.types import Address
        from gltest.direct import wasi_mock

        loader.import_calldata = lambda: calldata
        wasi_mock.import_calldata = lambda: calldata

        def address(value):
            return Address(value) if isinstance(value, bytes) else value

        _stdin_payload = calldata.encode({
            "contract_address": address(vm._contract_address),
            "sender_address": address(vm.sender),
            "origin_address": address(vm.origin),
            "stack": [], "value": vm._value, "datetime": vm._datetime,
            "is_init": False, "chain_id": vm._chain_id, "entry_kind": 0,
            "entry_data": b"", "entry_stage_data": None,
        })

    loader._inject_message_to_fd0 = _inject_and_capture
    io.FileIO = _file_io_windows_safe

    def _allocate_contract_with_pinned_sdk(contract_cls, vm, *args, **kwargs):
        from genlayer.py.storage import ROOT_SLOT_ID
        from genlayer.py.storage._internal.generate import ORIGINAL_INIT_ATTR, Lit, _storage_build

        descriptor = _storage_build(contract_cls, {})
        if isinstance(descriptor, Lit):
            raise TypeError("Contract storage descriptor was not generated")
        instance = descriptor.get(vm._storage.get_store_slot(ROOT_SLOT_ID), 0)
        init = getattr(descriptor, "cls", None)
        init = getattr(init or contract_cls, "__init__", None)
        if init is not None:
            init = getattr(init, ORIGINAL_INIT_ATTR, init)
            init(instance, *args, **kwargs)
        return instance

    loader._allocate_contract = _allocate_contract_with_pinned_sdk

    from gltest.direct import vm as direct_vm_module
    from gltest.direct.vm import VMContext

    def _refresh_pinned_message(self):
        if "genlayer._internal.msg" not in sys.modules:
            return
        from genlayer._internal import msg
        from genlayer.py.types import Address, u256

        def address(value):
            if value is None or isinstance(value, Address):
                return value
            return Address(value) if isinstance(value, bytes) else Address(value.as_bytes)

        msg.message_raw.update({
            "sender_address": address(self.sender),
            "origin_address": address(self.origin),
            "value": u256(self._value),
            "datetime": self._datetime,
            "chain_id": u256(self._chain_id),
        })
        import genlayer.gl as gl_module

        gl_module.message = gl_module.MessageType(
            contract_address=msg.message_raw["contract_address"],
            sender_address=msg.message_raw["sender_address"],
            origin_address=msg.message_raw["origin_address"],
            value=u256(self._value),
            chain_id=u256(self._chain_id),
        )

    VMContext._refresh_gl_message = _refresh_pinned_message

    def _run_validator_with_pinned_sdk(self, *, leader_result=direct_vm_module._sentinel, leader_error=None, index=-1):
        if not self._captured_validators:
            raise RuntimeError("No validator captured by a direct comparative call")
        stored_result, _, validator_fn = self._captured_validators[index]
        import genlayer.gl.vm as gl_vm

        if leader_error is not None:
            wrapped = gl_vm.UserError(str(leader_error))
        elif leader_result is not direct_vm_module._sentinel:
            wrapped = gl_vm.Return(calldata=leader_result)
        else:
            wrapped = gl_vm.Return(calldata=stored_result)
        return validator_fn(wrapped)

    VMContext.run_validator = _run_validator_with_pinned_sdk
    _original_match_web_mock = VMContext._match_web_mock

    def _match_web_mock_with_sdk_url(self, url, method="GET"):
        return _original_match_web_mock(self, str(url), method)

    VMContext._match_web_mock = _match_web_mock_with_sdk_url
    _original_patch_run_nondet = loader._patch_run_nondet_for_direct_mode

    def _patch_pinned_run_nondet_for_direct_mode():
        _original_patch_run_nondet()
        import genlayer.gl.vm as gl_vm
        from gltest.direct import wasi_mock

        if hasattr(gl_vm, "run_nondet_unsafe"):
            delattr(gl_vm, "run_nondet_unsafe")

        def direct_run_nondet(leader_fn, validator_fn, /, **kwargs):
            vm = wasi_mock.get_vm()
            if vm._check_pickling:
                loader._validate_pickling(leader_fn, "leader_fn")
                loader._validate_pickling(validator_fn, "validator_fn")
            vm._in_nondet = True
            try:
                result = leader_fn()
            finally:
                vm._in_nondet = False
            vm._captured_validators.append((result, leader_fn, validator_fn))
            return result

        gl_vm.run_nondet = direct_run_nondet
        gl_vm._direct_mode_patched = True

    loader._patch_run_nondet_for_direct_mode = _patch_pinned_run_nondet_for_direct_mode
    atexit.register(_cleanup_pending)

# The pinned runner parses mocked JSON text in the direct WASI adapter.
from gltest.direct.vm import VMContext  # noqa: E402

_original_mock_llm = VMContext.mock_llm


def _mock_llm_as_text(self, prompt_pattern, response):
    return _original_mock_llm(self, prompt_pattern, json.dumps(response))


VMContext.mock_llm = _mock_llm_as_text

if GENVM_RUNNER_HASH not in Path(CONTRACT).read_text(encoding="utf-8").splitlines()[0]:
    raise RuntimeError("The direct-test runner hash does not match the contract header")


def as_wallet(value):
    if isinstance(value, bytes):
        return "0x" + value.hex()
    address = getattr(value, "as_hex", None)
    if callable(address):
        address = address()
    if address:
        result = str(address).lower()
        return result if result.startswith("0x") else "0x" + result
    return str(value).lower()


def set_tx_time(vm, iso_time):
    vm.warp(iso_time)
    from genlayer._internal import msg

    msg.message_raw["datetime"] = iso_time


@pytest.fixture
def faultline(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    contract = direct_deploy(CONTRACT)
    set_tx_time(direct_vm, "2026-09-23T12:00:00Z")
    return contract

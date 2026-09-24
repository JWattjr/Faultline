# Portal submission — Faultline

- **Product name:** Faultline
- **One-liner:** Faultline is a GenLayer-native accountability layer that adjudicates an autonomous-agent pipeline, assigns coarse responsibility roles, and executes settlement rules frozen in its charter.
- **Problem:** A pipeline can fail even when individual handoffs appear compliant. Teams need one auditable charter and a way to assess causal responsibility across the complete Research → Analysis → Delivery trace.
- **Why GenLayer is essential:** Validators independently retrieve web evidence and interpret natural-language charter clauses. Their normalized decisions must agree before the contract applies a deterministic settlement transition.
- **Live app:** [faultline-sandy.vercel.app](https://faultline-sandy.vercel.app)
- **Repository:** [github.com/JWattjr/Faultline](https://github.com/JWattjr/Faultline)
- **Network:** Studio Net, chain ID `61999`
- **Contract:** `0x70B335af04A62e956856A4b5a3aDBEe1EbB5DF11` ([Studio Net explorer](https://explorer-studio.genlayer.com))
- **Deployment transaction:** [FINALIZED on Studio Net](https://explorer-studio.genlayer.com/tx/0x64bca079a17de999f8bf67086b145d40132c39ae2a73e9ef19344d0a12d21c4b)
- **Public proof record:** [Verified demo proof JSON](https://faultline-sandy.vercel.app/demo-proof.json)
- **Evidence manifest:** [Four public synthetic cases](https://faultline-sandy.vercel.app/evidence/manifest.json)

## Verified demo outcomes

All scenario transactions reached `FINALIZED` with successful GenVM execution, and the proof verifier confirmed the resulting contract state. The proof record includes each scenario's transaction hashes and explorer links.

| Case | Outcome | Basis | Final state | Adjudication transaction |
|---|---|---|---|---|
| `FLT-ACCEPT-001` | `ACCEPTED` | `VALIDATOR_JUDGMENT` | `SETTLED_ACCEPTED` | [View transaction](https://explorer-studio.genlayer.com/tx/0xdc46ca447a6f597d5ad83ecbd0b8b5b564f75be98bf50cc06e89ddcfca779308) |
| `FLT-REMED-001` | `REMEDIATION_REQUIRED` | `VALIDATOR_JUDGMENT` | `AWAITING_REMEDIATION` | [View transaction](https://explorer-studio.genlayer.com/tx/0xfd2c27640d5e2c4fee053717ad1cefeb7854a5e5c2a84264162f36d9bc5bbd37) |
| `FLT-BREACH-001` | `BREACHED` | `VALIDATOR_JUDGMENT` | `SETTLED_BREACHED` | [View transaction](https://explorer-studio.genlayer.com/tx/0x69b6fad92537b2150cbb6bb93d5473f15e3bed6808d84132c4bc78ed44271857) |
| `FLT-TAMPER-001` | `BREACHED` | `EVIDENCE_TAMPERED` | `SETTLED_BREACHED` | [View transaction](https://explorer-studio.genlayer.com/tx/0xd2cad862c83e734faa08b1843186c32373bb8cc9b59b61cf942d6dc8e3ac8ba5) |

- **Demo:** Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md); it is designed for under 60 seconds.
- **Architecture:** See [ARCHITECTURE.md](../ARCHITECTURE.md). GenLayer interprets evidence; deterministic contract code enforces the frozen state and accounting rules.
- **Checks:** Contract lint/schema validation, ESLint, TypeScript checks, production build, UI flows, and responsive checks at 1440, 1280, and 375 px passed. The production deployment and proof verifier passed for all four cases. `npm run check` does not fully pass on this Windows setup: the direct-test harness reports 56 setup errors while GenLayer's runtime tries to decode an empty stdin message. This is a test-harness setup failure; live Studio Net flows exercised all four adjudication paths. The separate `npm run test:integration` command and fee profile were not run.
- **Limitations:** Synthetic fixtures and DEMO units; not production escrow or real funds; self-hosted fixture evidence; no independent third-party audit or guarantee of correctness.
- **Tags:** Intelligent Contract, autonomous agents, agent accountability, natural-language charter, web evidence, validator consensus, subjective adjudication, deterministic settlement, Studio Net.

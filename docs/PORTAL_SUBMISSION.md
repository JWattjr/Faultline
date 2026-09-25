# Portal submission — Faultline

- **Product name:** Faultline
- **One-liner:** Faultline is a GenLayer-native accountability layer that adjudicates an autonomous-agent pipeline, assigns coarse responsibility roles, and executes settlement rules frozen in its charter.
- **Problem:** A pipeline can fail even when individual handoffs appear compliant. Teams need one auditable charter and a way to assess causal responsibility across the complete Research → Analysis → Delivery trace.
- **Why GenLayer is essential:** Validators independently retrieve web evidence and interpret natural-language charter clauses. Their normalized decisions must agree before the contract applies a deterministic settlement transition.
- **Live app:** [faultline-sandy.vercel.app](https://faultline-sandy.vercel.app)
- **Repository:** [github.com/JWattjr/Faultline](https://github.com/JWattjr/Faultline)
- **Network:** Studio Net, chain ID `61999`
- **Contract:** `0xbCC233eF24884386259259dc2e2acC8947761ed9` ([Studio Net explorer](https://explorer-studio.genlayer.com))
- **Deployment transaction:** [FINALIZED on Studio Net](https://explorer-studio.genlayer.com/tx/0x3f2184fac07cae0ba2c12997d7fc454ce3bdb59c6891418b5938f53892942ecb)
- **Public proof record:** [Verified demo proof JSON](https://faultline-sandy.vercel.app/demo-proof.json)
- **Evidence manifest:** [Four public synthetic cases](https://faultline-sandy.vercel.app/evidence/manifest.json)

## Verified demo outcomes

All scenario transactions reached `FINALIZED` with successful GenVM execution, and the proof verifier confirmed the resulting contract state. The proof record includes each scenario's transaction hashes and explorer links.

| Case | Outcome | Basis | Final state | Adjudication transaction |
|---|---|---|---|---|
| `FLT-ACCEPT-001` | `ACCEPTED` | `VALIDATOR_JUDGMENT` | `SETTLED_ACCEPTED` | [View transaction](https://explorer-studio.genlayer.com/tx/0xbbc9249f7ee002c84cdde43ebe5a17d79afd005e7f943f2566aefa99390c295a) |
| `FLT-REMED-001` | `REMEDIATION_REQUIRED` | `VALIDATOR_JUDGMENT` | `AWAITING_REMEDIATION` | [View transaction](https://explorer-studio.genlayer.com/tx/0x40a44c7bf83f3db9b668334fb3d937c2be6d0ec8874d64d0c6de0742a4c03ce4) |
| `FLT-BREACH-001` | `BREACHED` | `VALIDATOR_JUDGMENT` | `SETTLED_BREACHED` | [View transaction](https://explorer-studio.genlayer.com/tx/0xde993dbe518a78583101578963624f3239a3e60c939858fa3e4e90702b287a18) |
| `FLT-TAMPER-001` | `BREACHED` | `EVIDENCE_TAMPERED` | `SETTLED_BREACHED` | [View transaction](https://explorer-studio.genlayer.com/tx/0x2bddc565ee8aaf5847b9d046cb36532802c3ac94c4a0c854ff93d70fac415054) |

- **Demo:** Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md); it is designed for under 60 seconds.
- **Architecture:** See [ARCHITECTURE.md](../ARCHITECTURE.md). GenLayer interprets evidence; deterministic contract code enforces the frozen state and accounting rules.
- **Checks:** 58 direct tests, contract lint, ESLint, TypeScript checks, and production build passed. The production deployment and proof verifier passed for all four cases. The separate `npm run test:integration` command and fee profile were not run.
- **Limitations:** Synthetic fixtures and DEMO units; not production escrow or real funds; self-hosted fixture evidence; no independent third-party audit or guarantee of correctness.
- **Tags:** Intelligent Contract, autonomous agents, agent accountability, natural-language charter, web evidence, validator consensus, subjective adjudication, deterministic settlement, Studio Net.

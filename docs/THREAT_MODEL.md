# Fault model and mitigations

| Threat | Mitigation and remaining limit |
|---|---|
| Malicious requester | The requester can choose a charter and evidence base, but cannot edit it after sealing. The UI and submission package label the prototype and synthetic accounting. A malicious charter can still be unfair before an agent accepts it. |
| Malicious agent submission | Only the assigned address may submit its slot. Slot order, attempt number, URL allowlist, hash shape, duplicate prevention, and previous-output hash chaining are deterministic checks. Validators still interpret the submitted content. |
| Mutable evidence | Submitted content hashes are frozen and validators refetch and verify them. A changed page fails the hash check. Hashes do not prove that the original publisher was truthful. |
| Inaccessible evidence | HTTP 4xx errors are classified as external client errors; network/5xx/429 failures are transient. Neither is converted into a favorable verdict. A transaction may need to be retried when sources recover. |
| Malformed LLM output | Strict parsing and canonical validation reject unknown fields and values. A malformed leader result cannot receive validator approval; the transaction must rotate or fail. |
| Leader manipulation | Validators independently retrieve the charter, handoffs, evidence, and final artifact, run their own assessment, normalize the result, and compare the outcome and ordered agent responsibility roles. Clause citation differences do not change the comparison key. |
| Submitted source changed later | HTTP 200 agent evidence/artifact hash mismatches deterministically record `EVIDENCE_TAMPERED` and breach without model judgment. The UI and attempt record retain both digests; charter mismatches remain strict errors. |
| Validator disagreement | The comparative validator returns disagreement for different normalized outcomes or responsibility roles, or invalid responses. Network-level rotation/appeal behavior depends on Studio Net. |
| Replay or repeated adjudication | Attempt and state checks bind submissions to a single charter attempt; terminal state rejects a second adjudication. Receipt IDs are charter-scoped. |
| Unauthorized handoffs | The contract compares the sender address to the sealed slot address and checks the pipeline order. |
| False wallet success | The UI distinguishes wallet submission, transaction lifecycle, GenVM execution result, and read-back state. `FINALIZED` alone is never labeled successful execution. |
| Studio Net reset | Generated deployment/proof files are versioned as evidence only after live verification. The reset script performs a fresh deploy, reseed, proof rewrite, and frontend rebuild; a reset invalidates old addresses and transaction links. |
| Synthetic fixtures | Every fixture states its charter/attempt and that it is not evidence of a real customer or incident. Self-hosted fixture pages are not described as independent verification. |
| Simulated accounting | DEMO units are stored as contract state but no real assets are held, escrowed, or transferred. They demonstrate deterministic transitions only. |

## Out of scope

Production custody, agent key management, signed off-chain attestations, appeals UX, real-world identity, independent evidence hosting, universal reputation, and financial guarantees are not implemented.

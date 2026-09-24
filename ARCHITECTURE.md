# Faultline architecture

## Decision boundary

```text
Requester or assigned agent action
        ↓
Sealed charter + public, hash-pinned evidence URLs
        ↓
Leader retrieves the charter document, three handoffs, evidence, and final artifact
        ↓
Leader applies the frozen natural-language clauses
        ↓
Each validator independently refetches and reassesses the same material
        ↓
Canonical outcome comparison (outcome, clause IDs, and responsibility roles)
        ↓
Contract validates the normalized result and current retry/state constraints
        ↓
Deterministic integer settlement from charter-frozen basis points
        ↓
Stored receipt → wallet-free live UI and explorer proof
```

## Components

- `contracts/faultline.py` owns charter state, agent authorization, attempt ordering, output-hash chaining, validator comparison, lifecycle transitions, and DEMO accounting. It stores identifiers, bounded policy text, URLs, hashes, normalized decisions, and receipts; evidence bodies stay off-chain.
- `public/evidence/` contains synthetic reviewer fixtures. Each charter, artifact, and evidence page identifies its charter and attempt and states that it is not a real customer or production incident.
- `scripts/` provisions a Studio Next-only deployer and three demonstration agent keys in the gitignored `.env`, deploys and seeds in sequence, waits for transaction finality and successful execution, and writes deployment/proof files only after read-back verification.
- `app/`, `components/`, and `lib/` render the current contract state. Public reads do not require a wallet. Wallet interaction is required only to send transactions.
- `deployments/` holds generated, machine-readable deployment and proof records. Missing or unreadable deployment data is shown as unavailable; it is never replaced with invented live state.

## Consensus boundary

Both leader and validators retrieve the same frozen URLs and verify content hashes before assessment. They return only canonical fields. The custom comparative validator compares normalized fields exactly and never compares free-form reasoning. Malformed model output or an evidence retrieval failure cannot be accepted as an adjudication.

## Settlement boundary

The model returns no amount, reward, refund, slash, or percentage. After consensus, contract code checks the current state and computes each amount using integer arithmetic and the frozen basis points. `REMEDIATION_REQUIRED` records clause IDs, opens the next predeclared attempt, and leaves all accounting locked. Terminal decisions produce a reusable receipt.

## Trust boundaries

Validators independently retrieve evidence, but the demo fixtures are self-hosted and synthetic. Consensus is not a guarantee that an interpretation is correct. The contract tracks simulated accounting units only and has no token adapter or custody capability.

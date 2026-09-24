# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router, React, strict TypeScript, and stable `genlayer-js` on Node.js 22 or newer. Contract and proof scripts use the pinned GenLayer Python toolchain. No database, conventional backend, paid service, or authentication system is in scope.

## Users

- A requester who needs one charter to govern a fixed Research → Analysis → Delivery agent pipeline.
- A reviewer who needs to inspect the charter, source material, validator decision, finality, execution result, and settlement without connecting a wallet.
- A wallet holder who creates, seals, submits to, or adjudicates a charter through Studio Net.

## Product Purpose

Faultline records a natural-language charter and its evidence, asks GenLayer validators to independently judge the complete three-agent pipeline, and applies the charter's frozen retry, responsibility, and settlement rules through ordinary deterministic contract code. Success means a reviewer can follow that chain from source evidence to a finalized receipt.

## Positioning

Faultline adjudicates the pipeline as a whole. It does not assign percentage blame or ask a model to choose money amounts. Responsibility roles appear only on terminal `BREACHED` outcomes; the contract calculates every simulated accounting effect from values sealed in advance.

## Operating Context

The MVP is an authorization and settlement demonstration on GenLayer Studio Net, chain 61999. It uses public HTTPS evidence pages and wallet interaction for transactions. Review is wallet-free. Four clearly marked synthetic reviewer cases demonstrate acceptance, repair, validator-judged breach, and deterministic breach when submitted agent evidence has changed.

## Capabilities and Constraints

- Exactly three fixed slots: `RESEARCH`, `ANALYSIS`, and `DELIVERY`.
- A requester-authored charter is sealed before pipeline evidence is submitted and cannot then be changed.
- Ordered handoffs bind attempt numbers, output hashes, evidence URLs, and the previous output hash.
- Each accepted handoff records edge checks for the output hash chain, submission time, and evidence-base URL. Validators independently retrieve the charter and submitted artifacts, reassess the clauses, normalize the result, and agree on outcome plus agent responsibility roles; clause-citation differences do not change that settlement comparison.
- A fetched HTTP 200 agent evidence or artifact whose SHA-256 differs from its submitted digest deterministically settles as `BREACHED` with basis `EVIDENCE_TAMPERED`, outside the LLM judgment. The mismatched submitted and fetched hashes remain inspectable. Charter document mismatches and transient network/HTTP failures retain their strict/retryable behavior.
- The contract owns lifecycle transitions and integer basis-point accounting. No real assets are held or transferred.
- Every balance, reward, escrow, and bond is a simulated `DEMO` accounting unit.
- Studio Net is the only target network. Bradbury is out of scope.
- The product is an authorization prototype. Evidence, accounting, and seeded histories are synthetic; it is not production escrow, a reputation oracle, or financial advice.
- The current public review deployment is available at `https://faultline-sandy.vercel.app`; the deployed Studio Net contract and seeded fixture proofs are recorded in `deployments/`. Fee profiling and the separate integration command remain operational follow-ups.

## Brand Commitments

Faultline uses an original friendly filing-desk world: a sky-blue surround, a cream paper docket with a thick irregular dark edge, folder tabs that jump to real sections, dashed dividers, capsule summary labels, and three original SVG agent mascots. Handwritten lowercase display headings pair with IBM Plex Mono for body text, controls, and data. Accepted, repair, breach, and verification states use readable green, amber, red, and blue surfaces alongside explicit labels. The page stays evidence-first and never borrows franchise art or presents synthetic material as live proof.

## Evidence on Hand

There is no real customer or production-incident evidence. The three evidence flows are synthetic reviewer fixtures and must be labeled on every page and in every public description. Self-hosted fixtures are not independent third-party verification.

## Product Principles

1. Show source facts, validator interpretation, consensus finality, GenVM execution, and deterministic settlement as separate things.
2. Freeze policy and accounting inputs before evidence submission.
3. Keep responsibility coarse, clause-cited, and limited to terminal breach.
4. Make the public proof reviewable without a wallet.
5. Label synthetic evidence and simulated accounting where they appear.

## Accessibility & Inclusion

Support keyboard navigation, visible focus, semantic controls, accessible contrast, reduced motion, and touch targets of at least 44px. Support 1440px and 1280px desktop/laptop layouts and a 375px mobile viewport without horizontal overflow. A keyboard-operable **Plain numbers** view exposes responsibility and accounting as text and tables without mascots or visual bars.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router, React, strict TypeScript, `genlayer-js`, and Transaction Kit on Node.js 22 or newer. Contract and proof scripts use the pinned GenLayer Python toolchain. No database, conventional backend, paid service, or authentication system is in scope.

## Users

- A requester who needs one charter to govern a fixed Research → Analysis → Delivery agent pipeline.
- A reviewer who needs to inspect the charter, source material, validator decision, finality, execution result, and settlement without connecting a wallet.
- A wallet holder who creates, seals, submits to, or adjudicates a charter through Studio Next.

## Product Purpose

Faultline records a natural-language charter and its evidence, asks GenLayer validators to independently judge the complete three-agent pipeline, and applies the charter's frozen retry, responsibility, and settlement rules through ordinary deterministic contract code. Success means a reviewer can follow that chain from source evidence to a finalized receipt.

## Positioning

Faultline adjudicates the pipeline as a whole. It does not assign percentage blame or ask a model to choose money amounts. Responsibility roles appear only on terminal `BREACHED` outcomes; the contract calculates every simulated accounting effect from values sealed in advance.

## Operating Context

The MVP is an authorization and settlement demonstration on GenLayer Studio Next, chain 61997. It uses public HTTPS evidence pages and wallet interaction for transactions. Review is wallet-free. Three clearly marked synthetic reviewer cases demonstrate acceptance, repair, and terminal breach.

## Capabilities and Constraints

- Exactly three fixed slots: `RESEARCH`, `ANALYSIS`, and `DELIVERY`.
- A requester-authored charter is sealed before pipeline evidence is submitted and cannot then be changed.
- Ordered handoffs bind attempt numbers, output hashes, evidence URLs, and the previous output hash.
- Validators independently retrieve the charter and submitted artifacts, reassess the same clauses, normalize the result, and compare substantive fields.
- The contract owns lifecycle transitions and integer basis-point accounting. No real assets are held or transferred.
- Every balance, reward, escrow, and bond is a simulated `DEMO` accounting unit.
- Studio Next is the only target network. Bradbury is out of scope.
- The product is an authorization prototype. Evidence, accounting, and seeded histories are synthetic; it is not production escrow, a reputation oracle, or financial advice.
- Integration consensus, public deployment, and production hosting depend on the availability of Studio Next and deployment credentials in the environment.

## Brand Commitments

The product is named Faultline. Its interface follows the supplied forensic trace dossier direction: warm paper-like surfaces, graphite text, restrained red/orange for breaches, a cool verification color for accepted outcomes, editorial technical typography, precise rules and evidence marks, and no neon, glass, gradients, generic crypto dashboard, or node-graph clone. It should feel fun, friendly, and lightly cute through its voice and small interface details while keeping the evidence readable and avoiding fabricated scene illustrations.

## Evidence on Hand

There is no real customer or production-incident evidence. The three evidence flows are synthetic reviewer fixtures and must be labeled on every page and in every public description. Self-hosted fixtures are not independent third-party verification.

## Product Principles

1. Show source facts, validator interpretation, consensus finality, GenVM execution, and deterministic settlement as separate things.
2. Freeze policy and accounting inputs before evidence submission.
3. Keep responsibility coarse, clause-cited, and limited to terminal breach.
4. Make the public proof reviewable without a wallet.
5. Label synthetic evidence and simulated accounting where they appear.

## Accessibility & Inclusion

Support keyboard navigation, visible focus, semantic controls, accessible contrast, reduced motion, and touch targets of at least 44px. Support 1440px and 1280px desktop/laptop layouts and a 390px mobile viewport without horizontal overflow.

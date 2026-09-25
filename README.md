# Faultline

Faultline is a GenLayer application for adjudicating a fixed three-agent pipeline against one sealed natural-language charter. It separates fetched source evidence, validator interpretation, consensus/finality, GenVM execution, and deterministic DEMO accounting.

Handoffs that break the hash chain, deadline, or evidence-base rules are rejected at submission. Every recorded handoff was admitted under the charter's rules.

This is an authorization prototype. It does not custody or transfer real assets. All four evidence cases and every DEMO accounting balance are synthetic. One fixture intentionally changes an agent's published evidence after submission to demonstrate deterministic evidence-tamper settlement.

## Requirements

- Node.js 22 or newer.
- Python 3.12 or newer (the setup script locates a supported interpreter and creates `.venv`).
- Studio Net access only for deploy, seed, integration, and proof commands.

## Setup and offline checks

```powershell
npm ci
npm run setup:python
npm run check
```

`check` runs fixture generation, contract lint and schema generation, direct tests, frontend lint, both TypeScript projects, a production build, and the local UI/responsive checks. It does not claim validator consensus. Use `test:integration` for the separate full network run.

## Studio Net lifecycle

First publish the synthetic evidence pages so validators can retrieve them over HTTPS:

```powershell
npm run build
npm run deploy:frontend
```

`deploy:frontend` verifies that the production homepage is the Faultline app and that `/evidence/manifest.json` is JSON containing all four synthetic cases before saving the origin in `.env`. The current public deployment is [faultline-sandy.vercel.app](https://faultline-sandy.vercel.app). The live Studio Net deployment and four verified demo outcomes are recorded in `deployments/studionet.json` and `deployments/demo-proof.json`; the public proof is served at `/demo-proof.json`.

For a fresh deployment, deploy, seed, verify, and publish the live contract proof:

```powershell
npm run deploy
npm run seed:demo
npm run verify:proof
npm run profile:fees
npm run build
npm run deploy:frontend
```

Transactions run sequentially. Deployment and seeding check both finality and successful execution, then read the contract state back before writing generated proof files. The Studio Net deployer and three agent keys are kept in the gitignored `.env`; scripts never print private keys. Do not use Bradbury.

Seeding verifies that every hosted charter, evidence, and artifact page returns HTTPS 200 and matches its submitted SHA-256 hash, except for the single declared `FLT-TAMPER-001` evidence mismatch. That mismatch is required by the case: the manifest records both the originally submitted digest and the fetched digest. A self-hosted fixture is not independent third-party evidence.

## Trust assumptions

In this demo, all evidence is served from one host (the evidence base URL). Whoever controls that host could alter an agent's page. Tamper forfeitures therefore never go to the requester: slashed bond units go equally to CLEAR agents, with any remainder burned; if none are CLEAR, all are burned. In production, each agent should serve evidence from storage it controls or content-addressed storage (for example, IPFS), so a changed page can only be that agent's doing.

Run the network integration flow separately when Studio Net is reachable and the evidence host is configured. It deploys a fresh temporary contract, runs all four proof cases sequentially, waits for finalized successful execution, and verifies fresh contract reads. It does not replace the seeded public contract:

```powershell
npm run test:integration
```

Network-dependent proof reads are explicit and separate from offline quality gates:

```powershell
npm run verify:proof
```

## Studio Net reset

If Studio Net has reset, run `npm run reset:studio`. It redeploys, reseeds all four cases, verifies proof records, rebuilds the frontend, and republishes to the configured public host. Every new contract address and proof replaces the generated files only after the new deployment succeeds.

## Frontend hosting

For Vercel, keep the project root at `.` and the framework preset set to **Next.js** with its default output directory. The `Other` preset can publish `public/evidence/` while leaving the `/` app route unavailable.

Configure the existing hosting provider with `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_DEPLOYMENT_FILE`, and `NEXT_PUBLIC_FIXTURE_BASE_URL` as appropriate, then deploy the production build. The interface uses actual reads and reports unavailable state when RPC or deployment data cannot be read.

## Documentation

- [Product truth](PRODUCT.md)
- [Implemented design system](DESIGN.md)
- [Architecture](ARCHITECTURE.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Reviewer demo](docs/DEMO_SCRIPT.md)
- [Portal submission](docs/PORTAL_SUBMISSION.md)
- [Decisions](docs/DECISIONS.md)

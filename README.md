# Faultline

Faultline is a GenLayer application for adjudicating a fixed three-agent pipeline against one sealed natural-language charter. It separates fetched source evidence, validator interpretation, consensus/finality, GenVM execution, and deterministic DEMO accounting.

This is an authorization prototype. It does not custody or transfer real assets. The three evidence cases and every DEMO accounting balance are synthetic.

## Requirements

- Node.js 22 or newer.
- Python 3.12 or newer (the setup script locates a supported interpreter and creates `.venv`).
- Studio Next access only for deploy, seed, integration, and proof commands.

## Setup and offline checks

```powershell
npm ci
npm run setup:python
npm run check
```

`check` runs fixture generation, contract lint and schema generation, direct tests, frontend lint, both TypeScript projects, a production build, and the local UI/responsive checks. It does not claim validator consensus. The direct suite exercises contract business logic; use `test:integration` for full Studio Next validator execution.

## Studio Next lifecycle

First publish the synthetic evidence pages so validators can retrieve them over HTTPS:

```powershell
npm run build
npm run deploy:frontend
```

`deploy:frontend` verifies that the production homepage is the Faultline app and that `/evidence/manifest.json` is JSON containing all three synthetic cases before saving the origin in `.env`. Vercel currently protects generated deployment URLs with team authentication, so public hosting must be enabled for this project before the evidence host can be recorded or used by Studio Next validators. Then deploy, seed, verify, and publish the live contract proof:

```powershell
npm run deploy
npm run seed:demo
npm run verify:proof
npm run profile:fees
npm run build
npm run deploy:frontend
```

Transactions run sequentially. Deployment and seeding check both finality and successful execution, then read the contract state back before writing generated proof files. The Studio Next deployer and three agent keys are kept in the gitignored `.env`; scripts never print private keys. Do not use Bradbury.

Seeding verifies that all 21 hosted charter, evidence, and artifact pages return HTTPS 200 and match their manifest SHA-256 hashes. A self-hosted fixture is not independent third-party evidence.

Run the network integration flow separately when Studio Next is reachable and the evidence host is configured. It deploys a fresh temporary contract, runs all three flows sequentially, waits for finalized successful execution, and verifies fresh contract reads. It does not replace the seeded public contract:

```powershell
npm run test:integration
```

Network-dependent proof reads are explicit and separate from offline quality gates:

```powershell
npm run verify:proof
```

## Studio Next reset

If Studio Next has reset, run `npm run reset:studio`. It redeploys, reseeds all three cases, verifies proof records, rebuilds the frontend, and republishes when Vercel authentication and a publicly reachable evidence host are available. Every new contract address and proof replaces the generated files only after the new deployment succeeds.

## Frontend hosting

Configure the existing hosting provider with `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_DEPLOYMENT_FILE`, and `NEXT_PUBLIC_FIXTURE_BASE_URL` as appropriate, then deploy the production build. The interface uses actual reads and reports unavailable state when RPC or deployment data cannot be read.

## Documentation

- [Product truth](PRODUCT.md)
- [Implemented design system](DESIGN.md)
- [Architecture](ARCHITECTURE.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Reviewer demo](docs/DEMO_SCRIPT.md)
- [Portal submission](docs/PORTAL_SUBMISSION.md)
- [Decisions](docs/DECISIONS.md)

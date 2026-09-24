# Portal submission — Faultline

- **Product name:** Faultline
- **One-liner:** Faultline is a GenLayer-native accountability layer that adjudicates an entire autonomous-agent pipeline, assigns coarse responsibility roles, and executes settlement rules frozen in its charter.
- **Problem:** A pipeline can fail even when its individual handoffs appear compliant. Teams need one auditable charter and a way to assess causal responsibility across the complete Research → Analysis → Delivery trace.
- **Why GenLayer is essential:** The contract requires validators to independently retrieve web evidence and interpret natural-language charter clauses. Their substantive normalized decisions must agree before the contract applies any settlement transition.
- **Live app URL:** Vercel production deployment is [ready](https://faultline-o51u4npxs-wattxs-projects.vercel.app), but its generated URL currently shows Vercel Authentication. It is not yet a public review URL.
- **Repository URL:** https://github.com/JWattjr/Faultline
- **Studio Next contract:** Pending verified deployment (chain 61997).
- **Explorer:** Pending verified deployment.
- **Proof links:** Accepted — pending; Remediation — pending; Breached — pending. These fields are populated only from finalized transactions with successful execution and matching on-chain state.
- **Demo:** Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md); designed for under 60 seconds.
- **Architecture:** See [ARCHITECTURE.md](../ARCHITECTURE.md). GenLayer interprets evidence; deterministic contract code enforces frozen state and accounting rules.
- **Offline checks:** `npm run check` passed: fixture generation (3 cases, 18 evidence pages), GenVM lint (3 checks), direct contract suite (53 passed), ESLint, TypeScript app/scripts checks, production build, UI flow checks, and responsive checks at 1440, 1280, and 390 px.
- **Network checks:** Studio Next deploy, integration flows, public proof verification, and fee profiling have not run. The required public evidence origin is blocked by the new Vercel project's team SSO policy; no chain transaction or proof is claimed.
- **Limitations:** Synthetic fixtures and DEMO units; not production escrow or real funds; no independent third-party verification; no claim of guaranteed correctness, audited security, or universal reputation.
- **Reset:** After a publicly reachable evidence host is configured, run `npm run deploy` → `npm run seed:demo` → `npm run verify:proof` → `npm run build`; follow [README.md](../README.md).
- **Tags:** Intelligent Contract, autonomous agents, agent accountability, natural-language charter, web evidence, AI-validator consensus, subjective adjudication, deterministic settlement, Studio Next.

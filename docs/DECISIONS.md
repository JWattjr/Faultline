# Implementation decisions

| Decision | Rationale |
|---|---|
| One single-file contract with the pinned Studio Net runner | Keeps deployment and ABI review simple and follows the supplied accepted runner baseline. |
| The third `DELIVERY` output is also the explicit final artifact | Avoids a redundant write while making the final artifact URL/hash part of the third ordered handoff. |
| DEMO units are simulated contract accounting, with no token transfers | The MVP demonstrates state changes without custody or real assets. |
| Escrow amounts are multiples of 10,000 DEMO units | This makes every basis-point reward an exact integer and avoids hidden rounding policy. |
| A terminal breach credits forfeited bond units to the requester | This is a simple, deterministic rule that can be frozen in the charter and reproduced in the receipt. |
| A remediation result advances to the next attempt only when a retry remains | The retry count is fixed before handoffs; at the final attempt only acceptance or breach can be returned. |
| The evidence base URL must be HTTPS and all submitted artifact/evidence URLs must remain below it | Gives the charter an explicit fetch boundary and keeps the synthetic demo reviewable. |
| The interface reads only contract-backed state and generated deployment proof | Avoids presenting fixture defaults or fabricated zero values as live. |
| Product truth and the visual direction are taken from the user brief and Faultline shortlist | No customer, production, security, or real-money claims are inferred. |

Verified deployment: [Faultline on Vercel](https://faultline-sandy.vercel.app), Studio Net chain `61999`, contract `0x70B335af04A62e956856A4b5a3aDBEe1EbB5DF11`. Deployment and all four demo outcomes reached finality and passed proof verification; see `deployments/demo-proof.json` for transaction links. The separate integration command and fee profile have not been run. The Windows direct-test harness currently reports setup errors while GenLayer runtime decodes empty stdin; this does not affect the successful live Studio Net scenario checks. Local responsive screenshots are in `.impeccable/review/`.

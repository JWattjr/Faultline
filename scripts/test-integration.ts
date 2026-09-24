import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import {
  CHAIN_ID, EXPLORER_URL, RPC_URL, ROOT, assertPublicFixtures, checkNetwork,
  ensureFunded, estimateFees, fixtureBaseUrl, loadFixtureManifest, loadOrCreateKey,
  readContract, waitOutcome, withRetry, writeJson,
  type Deployment, type Hex,
} from "./lib.ts";
import { seedCase } from "./seed-demo.ts";

const INTEGRATION_FILE = resolve(ROOT, "deployments", "integration-studio-next.json");
const AGENT_KEYS = ["RESEARCH_AGENT_PRIVATE_KEY", "ANALYSIS_AGENT_PRIVATE_KEY", "DELIVERY_AGENT_PRIVATE_KEY"] as const;

async function main(): Promise<void> {
  const host = fixtureBaseUrl();
  const manifest = await loadFixtureManifest();
  await checkNetwork();
  await assertPublicFixtures(host, manifest);
  console.log(`Verified public HTTPS fixture hashes, including the one declared tamper fixture, at ${host}.`);

  const ownerAccount = createAccount(loadOrCreateKey("DEPLOYER_PRIVATE_KEY"));
  const ownerClient = createClient({ chain: studioDevnet, endpoint: RPC_URL, account: ownerAccount });
  const reader = createClient({ chain: studioDevnet, endpoint: RPC_URL });
  const agentAccounts = AGENT_KEYS.map((name) => createAccount(loadOrCreateKey(name)));
  const agentClients = agentAccounts.map((account) => createClient({ chain: studioDevnet, endpoint: RPC_URL, account }));
  for (const account of [ownerAccount, ...agentAccounts]) await ensureFunded(account.address);

  const source = readFileSync(resolve(ROOT, "contracts", "faultline.py"), "utf8");
  const fees = await estimateFees(ownerClient);
  const deployHash = await withRetry("deploy integration contract", () => ownerClient.deployContract({ code: source, args: [], fees: fees as never })) as Hex;
  const deployTx = await waitOutcome(ownerClient, deployHash, "deploy integration contract");
  const transaction = await withRetry("read integration deployment", () => ownerClient.getTransaction({ hash: deployHash as never }));
  const decoded = transaction.txDataDecoded as { contractAddress?: string } | undefined;
  const address = (decoded?.contractAddress ?? (transaction.data as { contract_address?: string } | undefined)?.contract_address) as Hex | undefined;
  if (!address || !/^0x[\da-fA-F]{40}$/.test(address)) throw new Error("Integration deployment did not return a contract address.");
  const version = await readContract<{ version: string }>(reader, address, "get_contract_version");
  if (version.version !== "faultline/1.1.0") throw new Error(`Unexpected integration contract version: ${version.version}`);

  const deployment: Deployment = {
    network: "studio-next", chainId: CHAIN_ID, rpcUrl: RPC_URL, explorerUrl: EXPLORER_URL,
    contractAddress: address, deployTx, deployer: ownerAccount.address, deployedAt: new Date().toISOString(),
    runner: "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng", fixtureBaseUrl: host,
  };
  const cases: Record<string, unknown> = {};
  for (const item of manifest.cases) {
    const result = await seedCase(deployment, item, ownerClient, agentClients, reader);
    cases[item.charter_id] = result;
    console.log(`${item.charter_id}: full consensus flow read back as ${result.actual_outcome} / ${result.final_state} (${result.actual_basis}).`);
  }

  writeJson(INTEGRATION_FILE, {
    kind: "integration-test-observation",
    network: "studio-next",
    chainId: CHAIN_ID,
    contractAddress: address,
    deployTx,
    verifiedAt: new Date().toISOString(),
    validatorConsensus: "Each adjudication ran through Studio Next consensus; direct business-logic tests are separate.",
    cases,
  });
  console.log(`Integration passed: all four labeled flows finalized successfully and matched fresh contract reads. Results: ${INTEGRATION_FILE}`);
}

main().catch((error: unknown) => {
  console.error(`Studio Next integration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

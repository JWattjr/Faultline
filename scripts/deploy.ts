import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import {
  CHAIN_ID, DEPLOYMENT_FILE, EXPLORER_URL, FEE_PROFILE_FILE, PROOF_FILE, PUBLIC_PROOF_FILE, RPC_URL, ROOT, RUNNER,
  checkNetwork, ensureFunded, estimateFees, fixtureBaseUrl, loadOrCreateKey,
  readContract, waitOutcome, withRetry, writeJson,
  type Deployment, type Hex,
} from "./lib.ts";

async function main(): Promise<void> {
  const source = readFileSync(resolve(ROOT, "contracts", "faultline.py"), "utf8");
  const runner = source.split(/\r?\n/, 1)[0]?.match(/py-genlayer:[0-9a-z]+/)?.[0];
  if (runner !== RUNNER) throw new Error(`Faultline runner pin must be exactly ${RUNNER}; found ${runner ?? "none"}.`);
  const evidenceHost = fixtureBaseUrl();
  console.log(`Checking Studio Next ${RPC_URL} (chain ${CHAIN_ID})…`);
  await checkNetwork();

  const account = createAccount(loadOrCreateKey("DEPLOYER_PRIVATE_KEY"));
  const client = createClient({ chain: studioDevnet, endpoint: RPC_URL, account });
  const reader = createClient({ chain: studioDevnet, endpoint: RPC_URL });
  const balance = await ensureFunded(account.address);
  console.log(`Deployer ${account.address} has ${balance} wei available.`);
  const fees = await estimateFees(client);
  const hash = await withRetry("deploy Faultline", () => client.deployContract({ code: source, args: [], fees: fees as never })) as Hex;
  const deployTx = await waitOutcome(client, hash, "deploy Faultline");
  const transaction = await withRetry("read deployment transaction", () => client.getTransaction({ hash: hash as never }));
  const decoded = transaction.txDataDecoded as { contractAddress?: string } | undefined;
  const contractAddress = (decoded?.contractAddress ?? (transaction.data as { contract_address?: string } | undefined)?.contract_address) as Hex | undefined;
  if (!contractAddress || !/^0x[\da-fA-F]{40}$/.test(contractAddress)) throw new Error("Deployment finalized, but Studio Next did not return a contract address.");
  const version = await readContract<{ version: string; runner: string }>(reader, contractAddress, "get_contract_version");
  if (version.version !== "faultline/1.1.0" || !version.runner.includes(RUNNER)) throw new Error("Deployed contract version or runner does not match the source pin.");

  const deployment: Deployment = {
    network: "studio-next",
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    explorerUrl: EXPLORER_URL,
    contractAddress,
    deployTx,
    deployer: account.address,
    deployedAt: new Date().toISOString(),
    runner: RUNNER,
    fixtureBaseUrl: evidenceHost,
  };
  for (const staleFile of [PROOF_FILE, PUBLIC_PROOF_FILE, FEE_PROFILE_FILE]) rmSync(staleFile, { force: true });
  writeJson(DEPLOYMENT_FILE, deployment);
  console.log(`Deployed and read back Faultline at ${contractAddress}.`);
  console.log(`Contract explorer: ${EXPLORER_URL}/address/${contractAddress}`);
  console.log(`Deployment record: ${DEPLOYMENT_FILE}`);
}

main().catch((error: unknown) => {
  console.error(`Deploy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

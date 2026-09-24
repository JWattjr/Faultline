import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import {
  CHAIN_ID, DEPLOYMENT_FILE, PROOF_FILE, RPC_URL, checkNetwork, explorerTransaction,
  readContract, readJson, withRetry,
  type Deployment, type IntegrationProofCase, type TxOutcome,
} from "./lib.ts";

type Proof = {
  network: string;
  chainId: number;
  contractAddress: `0x${string}`;
  verified: boolean;
  cases: Record<string, IntegrationProofCase>;
};
type CharterRead = { charter_id: string; state: string; latest_outcome: string };
type ReceiptRead = { outcome: string; receipt_hash: string } | Record<string, never>;

async function main(): Promise<void> {
  const deployment = readJson<Deployment>(DEPLOYMENT_FILE);
  const proof = readJson<Proof>(PROOF_FILE);
  if (!deployment || !proof) throw new Error("No deployment/proof pair exists yet. Deploy and seed first; this command never creates proof records.");
  if (deployment.network !== "studio-next" || deployment.chainId !== CHAIN_ID || proof.chainId !== CHAIN_ID || proof.contractAddress !== deployment.contractAddress || proof.verified !== true) {
    throw new Error("Deployment and proof metadata do not identify the same verified Studio Next contract.");
  }
  await checkNetwork();
  const reader = createClient({ chain: studioDevnet, endpoint: RPC_URL });
  const checked: Array<{ charter_id: string; outcome: string; state: string; receipt_hash?: string; transactions: number }> = [];
  for (const [charterId, item] of Object.entries(proof.cases)) {
    if (item.charter_id !== charterId) throw new Error(`Proof map key does not match charter ${charterId}.`);
    const transactions = Object.values(item.transactions) as TxOutcome[];
    if (transactions.length < 6) throw new Error(`${charterId} proof is incomplete; expected create, seal, three handoffs, and adjudication.`);
    for (const tx of transactions) {
      const latest = await withRetry(`verify ${tx.hash}`, () => reader.getTransaction({ hash: tx.hash as never }));
      const lifecycle = String(latest.statusName ?? latest.status ?? "UNKNOWN");
      const execution = String(latest.txExecutionResultName ?? "UNKNOWN");
      if (lifecycle !== "FINALIZED" || !isSuccessful(latest)) throw new Error(`${tx.hash} is ${lifecycle} / ${execution}; proof is not successful.`);
      tx.statusName = lifecycle;
      tx.executionResultName = execution;
      tx.successful = true;
      tx.explorer = explorerTransaction(tx.hash);
    }
    const record = await readContract<CharterRead>(reader, deployment.contractAddress, "get_charter", [charterId]);
    if (record.latest_outcome !== item.expected_outcome || record.latest_outcome !== item.actual_outcome || record.state !== item.final_state) {
      throw new Error(`${charterId} state read-back is ${record.latest_outcome} / ${record.state}; proof expects ${item.expected_outcome} / ${item.final_state}.`);
    }
    let receiptHash: string | undefined;
    const receipt = await readContract<ReceiptRead>(reader, deployment.contractAddress, "get_receipt", [charterId]);
    if (item.expected_outcome === "REMEDIATION_REQUIRED") {
      if ("receipt_hash" in receipt) throw new Error(`${charterId} remediation unexpectedly has a terminal receipt.`);
    } else {
      if (!("receipt_hash" in receipt) || receipt.outcome !== item.expected_outcome || receipt.receipt_hash !== item.receipt_hash) {
        throw new Error(`${charterId} receipt does not match the proof record.`);
      }
      receiptHash = receipt.receipt_hash;
    }
    const adjudication = item.transactions.adjudicate;
    checked.push({ charter_id: charterId, outcome: item.actual_outcome, state: item.final_state, receipt_hash: receiptHash, transactions: transactions.length });
    console.log(`${charterId}: ${adjudication.hash} FINALIZED / ${adjudication.executionResultName}; state and receipt verified.`);
  }
  if (checked.length !== 3) throw new Error(`Expected three proof flows; found ${checked.length}.`);
  console.log("Read-only verification passed for all three outcomes.");
  console.log(JSON.stringify(checked, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Proof verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

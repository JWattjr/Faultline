import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  CHAIN_ID, DEPLOYMENT_FILE, FEE_PROFILE_FILE, PROOF_FILE, RPC_URL, checkNetwork, isSuccessfulExecution, readJson, writeJson,
  type Deployment, type IntegrationProofCase,
} from "./lib.ts";

type AnyRecord = Record<string, unknown>;
type FeeDistribution = {
  leaderTimeunitsAllocation?: unknown;
  validatorTimeunitsAllocation?: unknown;
  executionBudgetPerRound?: unknown;
  totalMessageFees?: unknown;
  rotations?: unknown[];
};
type ProfileEntry = {
  leaderTimeunitsAllocation: string;
  validatorTimeunitsAllocation: string;
  executionBudgetPerRound: string;
  totalMessageFees: string;
  rotationsPerRound: string;
};
type Proof = { chainId: number; contractAddress: string; cases: Record<string, IntegrationProofCase> };

function asRecord(value: unknown): AnyRecord | undefined { return value && typeof value === "object" ? value as AnyRecord : undefined; }
function asInteger(value: unknown, label: string): string {
  if (value === undefined || value === null) throw new Error(`Finalized receipt does not expose ${label}; no fee value was inferred.`);
  const result = BigInt(String(value));
  if (result < 0n) throw new Error(`Fee value ${label} must not be negative.`);
  return result.toString();
}

function extractDistribution(transaction: { data?: Record<string, unknown> }): FeeDistribution | undefined {
  const data = asRecord(transaction.data);
  const accounting = asRecord(data?.fee_accounting);
  const recommended = asRecord(accounting?.recommended_fee_preset);
  const feeContainer = asRecord(data?.fees);
  return (recommended?.distribution ?? accounting?.fees_distribution ?? feeContainer?.distribution) as FeeDistribution | undefined;
}

function toEntry(distribution: FeeDistribution): ProfileEntry {
  return {
    leaderTimeunitsAllocation: asInteger(distribution.leaderTimeunitsAllocation, "leaderTimeunitsAllocation"),
    validatorTimeunitsAllocation: asInteger(distribution.validatorTimeunitsAllocation, "validatorTimeunitsAllocation"),
    executionBudgetPerRound: asInteger(distribution.executionBudgetPerRound, "executionBudgetPerRound"),
    totalMessageFees: asInteger(distribution.totalMessageFees, "totalMessageFees"),
    rotationsPerRound: asInteger(distribution.rotations?.[0], "rotations[0]"),
  };
}

function merge(current: ProfileEntry | undefined, next: ProfileEntry): ProfileEntry {
  if (!current) return next;
  const max = (a: string, b: string) => BigInt(a) >= BigInt(b) ? a : b;
  return {
    leaderTimeunitsAllocation: max(current.leaderTimeunitsAllocation, next.leaderTimeunitsAllocation),
    validatorTimeunitsAllocation: max(current.validatorTimeunitsAllocation, next.validatorTimeunitsAllocation),
    executionBudgetPerRound: max(current.executionBudgetPerRound, next.executionBudgetPerRound),
    totalMessageFees: max(current.totalMessageFees, next.totalMessageFees),
    rotationsPerRound: max(current.rotationsPerRound, next.rotationsPerRound),
  };
}

async function main(): Promise<void> {
  const deployment = readJson<Deployment>(DEPLOYMENT_FILE);
  const proof = readJson<Proof>(PROOF_FILE);
  if (!deployment || !proof || proof.chainId !== CHAIN_ID || proof.contractAddress !== deployment.contractAddress) throw new Error("Run deploy and seed:demo before profiling actual finalized transactions.");
  await checkNetwork();
  const reader = createClient({ chain: studionet, endpoint: RPC_URL });
  const hashes: Array<{ name: string; method: string; hash: `0x${string}` }> = [{ name: "deploy", method: "deploy", hash: deployment.deployTx.hash }];
  for (const item of Object.values(proof.cases)) {
    for (const [method, transaction] of Object.entries(item.transactions)) {
      hashes.push({ name: `${item.charter_id}.${method}`, method: method.startsWith("handoff_") ? "submit_handoff" : method, hash: transaction.hash });
    }
  }

  let deploy: ProfileEntry | undefined;
  const methods: Record<string, ProfileEntry> = {};
  const observations: Array<{ name: string; method: string; hash: string; distribution: ProfileEntry }> = [];
  for (const observation of hashes) {
    const transaction = await reader.getTransaction({ hash: observation.hash as never });
    const lifecycle = String(transaction.statusName ?? transaction.status ?? "UNKNOWN");
    if (lifecycle !== "FINALIZED" || !isSuccessfulExecution(transaction)) throw new Error(`${observation.name} is ${lifecycle} / ${transaction.txExecutionResultName ?? "unknown"}; only successful finalized transactions can be profiled.`);
    const distribution = extractDistribution(transaction);
    if (!distribution) throw new Error(`${observation.name} has no finalized fee accounting fields; this Studio Net response does not support empirical fee profiling.`);
    const entry = toEntry(distribution);
    observations.push({ name: observation.name, method: observation.method, hash: observation.hash, distribution: entry });
    if (observation.method === "deploy") deploy = merge(deploy, entry);
    else methods[observation.method] = merge(methods[observation.method], entry);
  }
  if (!deploy) throw new Error("No observed deployment fee data was available.");
  const profile = { version: 1, chainId: CHAIN_ID, network: "studionet", measuredAt: new Date().toISOString(), deploy, methods, observations };
  writeJson(FEE_PROFILE_FILE, profile);
  console.log(`Wrote fee allocations measured from ${observations.length} finalized Studio Net receipts.`);
  console.log(JSON.stringify(profile, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Fee profiling failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  CHAIN_ID, DEPLOYMENT_FILE, PROOF_FILE, PUBLIC_PROOF_FILE, assertPublicFixtures,
  checkNetwork, ensureFunded, fixtureBaseUrl, loadFixtureManifest, loadOrCreateKey,
  readContract, readJson, writeCall, writeJson,
  type Deployment, type FixtureCase, type IntegrationProofCase, type TxOutcome,
} from "./lib.ts";

const AGENT_KEYS = ["RESEARCH_AGENT_PRIVATE_KEY", "ANALYSIS_AGENT_PRIVATE_KEY", "DELIVERY_AGENT_PRIVATE_KEY"] as const;
const SETTLEMENT_VERSION = "faultline-settlement/1.0";
type CharterRecord = {
  charter_id: string;
  state: string;
  current_attempt: number;
  latest_outcome: string;
  violated_clause_ids: string[];
  responsibility: Array<{ agent_id: string; role: string; clause_ids: string[] }>;
  final_artifact: { hash: string };
  accounting: {
    escrow_status: string;
    escrow_released_units: number;
    escrow_refunded_units: number;
    escrow_locked_units: number;
    bonds_returned: Record<string, number>;
    bonds_slashed: Record<string, number>;
  };
};
type AttemptRecord = { handoffs_received: number; handoffs: Array<{ artifact_hash: string; evidence_hash: string; previous_output_hash: string } | null> };
type ReceiptRecord = { receipt_hash: string; outcome: string; accounting: CharterRecord["accounting"] } | Record<string, never>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function seedCase(deployment: Deployment, item: FixtureCase, requesterClient: ReturnType<typeof createClient>, agentClients: Array<ReturnType<typeof createClient>>, reader: ReturnType<typeof createClient>): Promise<IntegrationProofCase> {
  const address = deployment.contractAddress;
  const base = `${deployment.fixtureBaseUrl}/evidence`;
  const documentUrl = `${base}/${encodeURIComponent(item.charter_document)}`;
  const agents = item.agents.map((agent, index) => ({
    agent_id: agent.agent_id,
    slot: agent.slot,
    role: agent.role,
    wallet: agentClients[index]!.account?.address,
    bond_units: agent.bond_units,
    reward_bps: agent.reward_bps,
    responsibility_clause_ids: agent.responsibility_clause_ids,
  }));
  assert(agents.every((agent) => agent.wallet), "Agent account addresses were not derived from the local demo keys.");
  const transactions: Record<string, TxOutcome> = {};
  console.log(`\nSeeding ${item.charter_id} (${item.expected_outcome})…`);
  transactions.create = await writeCall(requesterClient, address, "create_charter", [
    item.charter_id, item.title, item.purpose, documentUrl, item.charter_hash, base,
    JSON.stringify(item.clauses), item.max_retries, JSON.stringify(agents), item.escrow_units,
    item.primary_slash_bps, item.contributing_slash_bps, Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    SETTLEMENT_VERSION,
  ], `create ${item.charter_id}`);
  transactions.seal = await writeCall(requesterClient, address, "seal_charter", [item.charter_id], `seal ${item.charter_id}`);

  let previousOutputHash = "";
  for (let index = 0; index < item.agents.length; index += 1) {
    const fixtureAgent = item.agents[index]!;
    const client = agentClients[index]!;
    const label = fixtureAgent.slot.toLowerCase();
    transactions[`handoff_${label}`] = await writeCall(client, address, "submit_handoff", [
      item.charter_id, 1, fixtureAgent.agent_id,
      `${base}/${encodeURIComponent(fixtureAgent.evidence)}`, fixtureAgent.evidence_hash,
      `${base}/${encodeURIComponent(fixtureAgent.artifact)}`, fixtureAgent.artifact_hash,
      previousOutputHash,
    ], `submit ${label} handoff`);
    previousOutputHash = fixtureAgent.artifact_hash;
  }
  transactions.adjudicate = await writeCall(requesterClient, address, "adjudicate", [item.charter_id, 1], `adjudicate ${item.charter_id}`);

  const record = await readContract<CharterRecord>(reader, address, "get_charter", [item.charter_id]);
  const attempt = await readContract<AttemptRecord>(reader, address, "get_attempt", [item.charter_id, 1]);
  assert(attempt.handoffs_received === 3 && attempt.handoffs.length === 3, `${item.charter_id} read-back is missing one or more handoffs.`);
  for (let index = 0; index < item.agents.length; index += 1) {
    const handoff = attempt.handoffs[index];
    const fixture = item.agents[index]!;
    assert(handoff?.artifact_hash === fixture.artifact_hash && handoff.evidence_hash === fixture.evidence_hash, `${item.charter_id} handoff ${fixture.slot} did not match the published fixture hashes.`);
    assert(handoff.previous_output_hash === (index === 0 ? "" : item.agents[index - 1]!.artifact_hash), `${item.charter_id} handoff ${fixture.slot} has an invalid hash chain.`);
  }
  assert(record.latest_outcome === item.expected_outcome, `${item.charter_id}: expected ${item.expected_outcome}, received ${record.latest_outcome || "no outcome"}.`);

  if (item.expected_outcome === "ACCEPTED") {
    assert(record.state === "SETTLED_ACCEPTED" && record.accounting.escrow_released_units === item.escrow_units && record.accounting.escrow_locked_units === 0, "Accepted settlement did not match the frozen escrow rule.");
    for (const agent of item.agents) assert(record.accounting.bonds_returned[agent.agent_id] === agent.bond_units, `Accepted flow did not return ${agent.agent_id}'s complete bond.`);
  } else if (item.expected_outcome === "REMEDIATION_REQUIRED") {
    assert(record.state === "AWAITING_REMEDIATION" && record.current_attempt === 2 && record.accounting.escrow_locked_units === item.escrow_units, "Remediation must open attempt 2 with accounting still locked.");
    assert(record.responsibility.length === 0, "Remediation must not assign terminal responsibility roles.");
  } else {
    assert(record.state === "SETTLED_BREACHED" && record.accounting.escrow_refunded_units === item.escrow_units, "Breach settlement did not refund the frozen escrow.");
    const expectedRoles: Record<string, string> = { "AGENT-RESEARCH": "PRIMARY", "AGENT-ANALYSIS": "CONTRIBUTING", "AGENT-DELIVERY": "CLEAR" };
    for (const [agentId, role] of Object.entries(expectedRoles)) assert(record.responsibility.find((entry) => entry.agent_id === agentId)?.role === role, `Breached responsibility for ${agentId} did not match ${role}.`);
  }

  const receipt = await readContract<ReceiptRecord>(reader, address, "get_receipt", [item.charter_id]);
  if (item.expected_outcome !== "REMEDIATION_REQUIRED") assert("receipt_hash" in receipt && receipt.outcome === item.expected_outcome, `${item.charter_id} did not store a matching finalized receipt.`);
  else assert(!("receipt_hash" in receipt), "Remediation must not create a terminal receipt.");
  return {
    charter_id: item.charter_id,
    title: item.title,
    expected_outcome: item.expected_outcome,
    actual_outcome: record.latest_outcome,
    final_state: record.state,
    receipt_hash: "receipt_hash" in receipt ? receipt.receipt_hash : undefined,
    transactions,
  };
}

export async function main(): Promise<void> {
  const deployment = readJson<Deployment>(DEPLOYMENT_FILE);
  assert(deployment?.network === "studio-next" && deployment.chainId === CHAIN_ID, `Run npm run deploy first; a valid Studio Next deployment is required at ${DEPLOYMENT_FILE}.`);
  assert(fixtureBaseUrl() === deployment.fixtureBaseUrl, "FIXTURE_BASE_URL differs from the deployment record; redeploy or restore the original fixture host.");
  const manifest = await loadFixtureManifest();
  await checkNetwork();
  await assertPublicFixtures(deployment.fixtureBaseUrl, manifest);
  console.log("All hosted synthetic evidence pages returned HTTPS 200 and match their published SHA-256 hashes.");

  const requester = createAccount(loadOrCreateKey("DEPLOYER_PRIVATE_KEY"));
  const requesterClient = createClient({ chain: studioDevnet, endpoint: deployment.rpcUrl, account: requester });
  const agentClients = AGENT_KEYS.map((name) => createClient({ chain: studioDevnet, endpoint: deployment.rpcUrl, account: createAccount(loadOrCreateKey(name)) }));
  const reader = createClient({ chain: studioDevnet, endpoint: deployment.rpcUrl });
  for (const client of [requesterClient, ...agentClients]) {
    const address = client.account?.address;
    assert(address, "Could not derive an account for the demo flow.");
    await ensureFunded(address);
  }

  const cases: Record<string, IntegrationProofCase> = {};
  for (const item of manifest.cases) cases[item.charter_id] = await seedCase(deployment, item, requesterClient, agentClients, reader);
  const proof = { network: "studio-next", chainId: CHAIN_ID, contractAddress: deployment.contractAddress, generatedAt: new Date().toISOString(), verified: true, cases };
  writeJson(PROOF_FILE, proof);
  writeJson(PUBLIC_PROOF_FILE, proof);
  console.log(`\nAll three flows were finalized, successful, and read back from Studio Next. Proof records: ${PROOF_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`Demo seeding stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

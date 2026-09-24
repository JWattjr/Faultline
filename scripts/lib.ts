import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, type GenLayerTransaction } from "genlayer-js/types";
import { isSuccessfulExecution, transactionExecutionResultName, transactionResultName, transactionStatusName, type TransactionStatusLike } from "../lib/transaction-status.ts";
export { isSuccessfulExecution } from "../lib/transaction-status.ts";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ENV_FILE = resolve(ROOT, ".env");
export const DEPLOYMENT_FILE = resolve(ROOT, "deployments", "studionet.json");
export const PROOF_FILE = resolve(ROOT, "deployments", "demo-proof.json");
export const PUBLIC_PROOF_FILE = resolve(ROOT, "public", "demo-proof.json");
export const FEE_PROFILE_FILE = resolve(ROOT, "deployments", "fee-profile.json");
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";
export const CHAIN_ID = 61999;
export const RUNNER = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6";

if (studionet.id !== CHAIN_ID) throw new Error(`Pinned genlayer-js Studio Net chain id is ${studionet.id}, expected ${CHAIN_ID}.`);

function loadEnvFile(): void {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

loadEnvFile();

export type Hex = `0x${string}`;
export type RpcError = { code?: number; message?: string };
export type TxOutcome = {
  hash: Hex;
  statusName: string;
  executionResultName: string;
  successful: boolean;
  resultName?: string;
  errorText?: string;
  validators?: number;
  votes?: Record<string, string>;
  explorer: string;
};

export type FixtureAgent = {
  agent_id: string;
  slot: string;
  role: string;
  bond_units: number;
  reward_bps: number;
  responsibility_clause_ids: string[];
  evidence: string;
  evidence_hash: string;
  published_evidence_hash?: string;
  artifact: string;
  artifact_hash: string;
};
export type FixtureCase = {
  key: string;
  charter_id: string;
  title: string;
  purpose: string;
  charter_document: string;
  charter_hash: string;
  expected_outcome: "ACCEPTED" | "REMEDIATION_REQUIRED" | "BREACHED";
  expected_basis: "EVIDENCE_TAMPERED" | "VALIDATOR_JUDGMENT";
  clauses: Array<{ id: string; text: string }>;
  max_retries: number;
  escrow_units: number;
  primary_slash_bps: number;
  contributing_slash_bps: number;
  agents: FixtureAgent[];
};
export type FixtureManifest = { accounting_unit: "DEMO"; cases: FixtureCase[] };
export type Deployment = {
  network: "studionet";
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  contractAddress: Hex;
  deployTx: TxOutcome;
  deployer: string;
  deployedAt: string;
  runner: string;
  fixtureBaseUrl: string;
};

export type IntegrationProofCase = {
  charter_id: string;
  title: string;
  expected_outcome: FixtureCase["expected_outcome"];
  expected_basis: FixtureCase["expected_basis"];
  actual_outcome: string;
  actual_basis: FixtureCase["expected_basis"];
  final_state: string;
  receipt_hash?: string;
  transactions: Record<string, TxOutcome>;
};

const sleep = (milliseconds: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

export async function withRetry<T>(label: string, operation: () => Promise<T>, retries = 7): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/rate.?limit|429|too many requests/i.test(message) || attempt >= retries) throw error;
      const delay = Math.min(15_000 * (attempt + 1), 60_000);
      console.log(`Rate limited during ${label}; retry ${attempt + 1}/${retries} in ${delay / 1000}s.`);
      await sleep(delay);
    }
  }
}

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  return withRetry(method, async () => {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    if (response.status === 429) throw new Error(`${method}: RPC rate limit (HTTP 429)`);
    if (!response.ok) throw new Error(`${method}: RPC returned HTTP ${response.status}`);
    const body = await response.json() as { result?: T; error?: RpcError };
    if (body.error) throw new Error(`${method}: ${body.error.message ?? "RPC error"}`);
    if (!Object.hasOwn(body, "result")) throw new Error(`${method}: RPC response did not contain a result`);
    return body.result as T;
  });
}

export async function checkNetwork(): Promise<void> {
  const chainId = Number.parseInt(await rpc<string>("eth_chainId"), 16);
  if (chainId !== CHAIN_ID) throw new Error(`RPC ${RPC_URL} reports chain ${chainId}; expected Studio Net ${CHAIN_ID}.`);
}

export function loadOrCreateKey(name: string): Hex {
  const existing = process.env[name]?.trim();
  if (existing && /^0x[\da-fA-F]{64}$/.test(existing)) return existing as Hex;
  if (existing) throw new Error(`${name} must be a 32-byte hex private key stored only in the gitignored .env.`);
  const key = generatePrivateKey();
  appendFileSync(ENV_FILE, `${existsSync(ENV_FILE) ? "\n" : ""}${name}=${key}\n`, { encoding: "utf8" });
  process.env[name] = key;
  console.log(`Created ${name} in the gitignored .env; the private key was not printed.`);
  return key;
}

export function makeClients(privateKey = loadOrCreateKey("DEPLOYER_PRIVATE_KEY")) {
  const account = createAccount(privateKey);
  return {
    account,
    client: createClient({ chain: studionet, endpoint: RPC_URL, account }),
    reader: createClient({ chain: studionet, endpoint: RPC_URL }),
  };
}

export async function ensureFunded(address: string, minimumWei = 10n ** 19n): Promise<bigint> {
  const balance = BigInt(await rpc<string>("eth_getBalance", [address, "latest"]));
  if (balance >= minimumWei) return balance;
  await rpc("sim_fundAccount", [address, 100 * 1e18]);
  const after = BigInt(await rpc<string>("eth_getBalance", [address, "latest"]));
  if (after < minimumWei) throw new Error(`Studio Net test faucet did not fund ${address}; balance is ${after} wei.`);
  return after;
}

export function explorerTransaction(hash: string): string { return `${EXPLORER_URL}/tx/${hash}`; }
export function explorerAddress(address: string): string { return `${EXPLORER_URL}/address/${address}`; }

export async function waitOutcome(
  client: ReturnType<typeof makeClients>["client"],
  hash: Hex,
  label: string,
): Promise<TxOutcome> {
  process.stdout.write(`  ${label}: ${hash} … `);
  const transaction = await withRetry(`${label} finality`, () => client.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.FINALIZED,
    // Space receipt polls to conserve hosted RPC capacity for writes and read-back checks.
    interval: 20_000,
    retries: 60,
  })) as GenLayerTransaction;
  const receipt = transaction as unknown as TransactionStatusLike;
  const result: TxOutcome = {
    hash,
    statusName: transactionStatusName(receipt),
    executionResultName: transactionExecutionResultName(receipt),
    successful: isSuccessfulExecution(receipt),
    resultName: transactionResultName(receipt),
    explorer: explorerTransaction(hash),
  };
  try {
    const facts = await rpc<({ num_of_initial_validators?: number } & TransactionStatusLike) | null>("eth_getTransactionByHash", [hash]);
    result.validators = facts?.num_of_initial_validators;
    result.votes = facts?.consensus_data?.votes;
    if (result.statusName === "UNKNOWN" && facts) result.statusName = transactionStatusName(facts);
    if (result.executionResultName === "UNKNOWN" && facts) {
      result.executionResultName = transactionExecutionResultName(facts);
      result.successful = isSuccessfulExecution(facts);
    }
    if (result.resultName === "UNKNOWN" && facts) result.resultName = transactionResultName(facts);
    const leader = facts?.consensus_data?.leader_receipt?.[0];
    const diagnostic = leader?.genvm_result?.error_description || leader?.genvm_result?.stderr;
    if (!result.successful && diagnostic) result.errorText = diagnostic.slice(0, 300);
    const encoded = leader?.result;
    if (!result.successful && encoded) {
      const bytes = Buffer.from(encoded, "base64");
      result.errorText = bytes.subarray(1).toString("utf8").slice(0, 300);
    }
  } catch { /* Lifecycle plus execution result remain authoritative. */ }
  console.log(`${result.statusName} / ${result.executionResultName}`);
  if (result.statusName !== "FINALIZED") throw new Error(`${label} transaction did not finalize (status ${result.statusName}).`);
  if (!result.successful) throw new Error(`${label} finalized with execution ${result.executionResultName}; ${result.errorText ?? "no successful state change is recorded."}`);
  return result;
}

export async function writeCall(
  client: ReturnType<typeof makeClients>["client"],
  address: Hex,
  functionName: string,
  args: Array<string | number | bigint>,
  label = functionName,
): Promise<TxOutcome> {
  const hash = await withRetry(`write ${functionName}`, () => client.writeContract({ address, functionName, args, value: 0n })) as Hex;
  return waitOutcome(client, hash, label);
}

export function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`, "utf8");
}

export function fixtureBaseUrl(): string {
  const value = process.env.FIXTURE_BASE_URL?.trim().replace(/\/$/, "");
  if (!value) throw new Error("Set FIXTURE_BASE_URL to the public HTTPS origin serving Faultline's synthetic evidence pages before deploy or seed.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("FIXTURE_BASE_URL must be an HTTPS origin without a path.");
  if (/example\.com|faultline\.vercel\.app/i.test(url.hostname)) throw new Error("FIXTURE_BASE_URL is still a placeholder; use the actual deployed evidence host.");
  return value;
}

export async function loadFixtureManifest(): Promise<FixtureManifest> {
  const manifest = readJson<FixtureManifest>(resolve(ROOT, "public", "evidence", "manifest.json"));
  if (!manifest || manifest.accounting_unit !== "DEMO" || manifest.cases.length !== 4) throw new Error("Build the four synthetic reviewer fixtures before deploy or seed (npm run fixtures:build).");
  return manifest;
}

export async function assertPublicFixtures(baseUrl: string, manifest: FixtureManifest): Promise<void> {
  const base = `${baseUrl}/evidence/`;
  const tamperDeclarations = manifest.cases.flatMap((item) => item.agents.flatMap((agent) =>
    agent.published_evidence_hash ? [{ item, agent }] : []
  ));
  const tamperCases = manifest.cases.filter((item) => item.expected_basis === "EVIDENCE_TAMPERED");
  if (
    manifest.cases.length !== 4 || tamperCases.length !== 1 ||
    tamperCases[0]?.charter_id !== "FLT-TAMPER-001" || tamperDeclarations.length !== 1 ||
    tamperDeclarations[0]?.item.charter_id !== "FLT-TAMPER-001" ||
    tamperDeclarations[0]?.agent.published_evidence_hash === tamperDeclarations[0]?.agent.evidence_hash
  ) {
    throw new Error("The fixture manifest must declare exactly one changed evidence page for FLT-TAMPER-001.");
  }
  const declaredMismatch = tamperDeclarations[0]!;
  let mismatchCount = 0;
  const expected = manifest.cases.flatMap((item) => [
    [item.charter_document, item.charter_hash],
    ...item.agents.flatMap((agent) => [[agent.evidence, agent.evidence_hash], [agent.artifact, agent.artifact_hash]]),
  ] as Array<[string, string]>);
  for (const [filename, expectedHash] of expected) {
    const url = new URL(encodeURIComponent(filename), base);
    const response = await fetch(url, { redirect: "error" });
    if (!response.ok) throw new Error(`Synthetic evidence is not public (HTTP ${response.status}): ${url}`);
    const actualHash = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    if (filename === declaredMismatch.agent.evidence) {
      if (actualHash === expectedHash || actualHash !== declaredMismatch.agent.published_evidence_hash) {
        throw new Error(`Hosted tamper fixture does not match its declared submitted/fetched hashes: ${url}`);
      }
      mismatchCount += 1;
    } else if (actualHash !== expectedHash) {
      throw new Error(`Hosted fixture hash does not match the local manifest: ${url}`);
    }
  }
  if (mismatchCount !== 1) throw new Error(`Expected exactly one intentional evidence hash mismatch; found ${mismatchCount}.`);
}

export function unpackJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export async function readContract<T>(reader: ReturnType<typeof makeClients>["reader"], address: Hex, functionName: string, args: Array<string | number> = []): Promise<T> {
  const value = await withRetry(`read ${functionName}`, () => reader.readContract({ address, functionName, args, jsonSafeReturn: true }));
  return unpackJson<T>(value);
}

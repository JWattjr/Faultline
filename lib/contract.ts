import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionExecutionResultName, transactionStatusName, type TransactionStatusLike } from "./transaction-status";

export const CHAIN_ID = 61999;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://studio.genlayer.com/api";
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer-studio.genlayer.com";
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";
export const FIXTURE_BASE_URL = process.env.NEXT_PUBLIC_FIXTURE_BASE_URL ?? "";

const reader = createClient({ chain: studionet, endpoint: RPC_URL });

export type Agent = {
  agent_id: string;
  slot: "RESEARCH" | "ANALYSIS" | "DELIVERY";
  wallet: string;
  bond_units: number;
  reward_bps: number;
  responsibility_clause_ids: string[];
};

export type Clause = { id: string; text: string };
export type EdgeCheck = {
  hash_chain_ok: boolean;
  on_time: boolean;
  inside_evidence_base: boolean;
  status: "PASSED" | "FAILED";
};
export type TamperedSource = {
  agent_id: string;
  source_kind: "EVIDENCE" | "ARTIFACT";
  url: string;
  submitted_hash: string;
  fetched_hash: string;
};
export type Handoff = {
  charter_id: string;
  attempt_number: number;
  agent_id: string;
  slot: string;
  wallet: string;
  evidence_url: string;
  evidence_hash: string;
  artifact_url: string;
  artifact_hash: string;
  previous_output_hash: string;
  submitted_at: number;
  edge_check: EdgeCheck;
};

export type Charter = {
  charter_id: string;
  title: string;
  purpose: string;
  requester: string;
  document_url: string;
  document_hash: string;
  evidence_base_url: string;
  clauses: Clause[];
  max_retries: number;
  agents: Agent[];
  escrow_units: number;
  primary_slash_bps: number;
  contributing_slash_bps: number;
  clear_slash_bps: 0;
  expires_at: number;
  settlement_version: string;
  accounting_unit: "DEMO";
  state: string;
  current_attempt: number;
  latest_outcome: string;
  violated_clause_ids: string[];
  responsibility: Array<{ agent_id: string; role: string; clause_ids: string[] }>;
  final_artifact: { attempt_number: number; url: string; hash: string; submitted_at: number };
  accounting: {
    escrow_status: string;
    escrow_locked_units: number;
    escrow_released_units: number;
    escrow_refunded_units: number;
    agent_bonds_locked_units: number;
    agent_rewards: Record<string, number>;
    bonds_returned: Record<string, number>;
    bonds_slashed: Record<string, number>;
    forfeiture_credited_units: number;
    forfeiture_beneficiary: string;
  };
};

export type Attempt = {
  charter_id: string;
  attempt_number: number;
  state: string;
  handoffs_received: number;
  outcome: string;
  basis: "EVIDENCE_TAMPERED" | "VALIDATOR_JUDGMENT" | "";
  tampered_sources: TamperedSource[];
  violated_clause_ids: string[];
  responsibility: Array<{ agent_id: string; role: string; clause_ids: string[] }>;
  adjudicated_at: number;
  handoffs: Array<Handoff | null>;
};

export type Receipt = {
  charter_id: string;
  charter_hash: string;
  attempt_number: number;
  settlement_version: string;
  outcome: string;
  receipt_hash: string;
  accounting: Charter["accounting"];
  finalized_at: number;
} | Record<string, never>;

export type CharterListItem = {
  charter_id: string;
  title: string;
  state: string;
  current_attempt: number;
  max_retries: number;
  latest_outcome: string;
  created_at: number;
};

export type ContractIndex = {
  version: { version: string; settlement_version: string; accounting_unit: string; pipeline: string[]; runner: string };
  total: number;
  items: CharterListItem[];
};

export type LiveRecord = { charter: Charter; attempt: Attempt; previous_attempt: Attempt | null; receipt: Receipt };

function unpack<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export async function checkStudioNet(): Promise<number> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Studio Net RPC returned HTTP ${response.status}`);
  const body = (await response.json()) as { result?: string; error?: { message?: string } };
  if (body.error?.message) throw new Error(body.error.message);
  const chainId = Number.parseInt(body.result ?? "0x0", 16);
  if (chainId !== CHAIN_ID) throw new Error(`RPC reports chain ${chainId}; expected Studio Net ${CHAIN_ID}`);
  return chainId;
}

async function view<T>(functionName: string, args: Array<string | number> = []): Promise<T> {
  if (!/^0x[\da-fA-F]{40}$/.test(CONTRACT_ADDRESS)) throw new Error("No Studio Net contract address is configured.");
  const result = await reader.readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName,
    args,
    jsonSafeReturn: true,
  });
  return unpack<T>(result);
}

export async function readIndex(): Promise<ContractIndex> {
  const [version, page] = await Promise.all([
    view<ContractIndex["version"]>("get_contract_version"),
    view<{ total: number; items: CharterListItem[] }>("list_charters", [0, 50]),
  ]);
  return { version, total: page.total, items: page.items };
}

export async function readRecord(charterId: string): Promise<LiveRecord> {
  const charter = await view<Charter>("get_charter", [charterId]);
  const [attempt, previousAttempt, receipt] = await Promise.all([
    view<Attempt>("get_attempt", [charterId, charter.current_attempt]),
    charter.current_attempt > 1 ? view<Attempt>("get_attempt", [charterId, charter.current_attempt - 1]) : Promise.resolve(null),
    view<Receipt>("get_receipt", [charterId]),
  ]);
  return { charter, attempt, previous_attempt: previousAttempt, receipt };
}

export type TransactionFacts = {
  hash: string;
  status: string;
  execution: string;
  validators?: number;
  votes?: Record<string, string>;
  resultCode?: number;
  errorText?: string;
};

export async function readTransactionFacts(hash: string): Promise<TransactionFacts> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [hash] }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Studio Net RPC returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    result?: TransactionStatusLike & { num_of_initial_validators?: number };
    error?: { message?: string };
  };
  if (body.error?.message) throw new Error(body.error.message);
  const tx = body.result;
  const facts: TransactionFacts = {
    hash,
    status: tx ? transactionStatusName(tx) : "UNKNOWN",
    execution: tx ? transactionExecutionResultName(tx) : "UNKNOWN",
    validators: tx?.num_of_initial_validators,
    votes: tx?.consensus_data?.votes,
  };
  const encoded = tx?.consensus_data?.leader_receipt?.[0]?.result;
  if (encoded) {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    facts.resultCode = bytes[0];
    if (bytes[0] !== 0) facts.errorText = new TextDecoder().decode(bytes.subarray(1)).slice(0, 300);
  }
  return facts;
}

export function explorerTransaction(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerContract(): string {
  return `${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`;
}

export function shortHash(value: string, length = 10): string {
  if (!value) return "—";
  return value.length > length * 2 ? `${value.slice(0, length)}…${value.slice(-length)}` : value;
}

export function humanTime(timestamp: number): string {
  if (!timestamp) return "Not recorded";
  return new Date(timestamp * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

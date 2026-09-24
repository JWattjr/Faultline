export type TransactionStatusLike = {
  status?: string | number | null;
  statusName?: string | null;
  result?: string | number | null;
  resultName?: string | null;
  result_name?: string | null;
  txExecutionResult?: string | number | null;
  txExecutionResultName?: string | null;
  execution_result?: string | null;
  consensus_data?: {
    votes?: Record<string, string>;
    leader_receipt?: Array<{
      execution_result?: string | null;
      genvm_result?: { error_description?: string | null; stderr?: string | null };
      result?: string | null;
    }>;
  };
};

const STATUS_NAMES: Record<string, string> = {
  "0": "UNINITIALIZED", "1": "PENDING", "2": "PROPOSING", "3": "COMMITTING",
  "4": "REVEALING", "5": "ACCEPTED", "6": "UNDETERMINED", "7": "FINALIZED",
  "8": "CANCELED", "9": "APPEAL_REVEALING", "10": "APPEAL_COMMITTING",
  "11": "READY_TO_FINALIZE", "12": "VALIDATORS_TIMEOUT", "13": "LEADER_TIMEOUT",
};

const RESULT_NAMES: Record<string, string> = {
  "0": "IDLE", "1": "AGREE", "2": "DISAGREE", "3": "TIMEOUT",
  "4": "DETERMINISTIC_VIOLATION", "5": "NO_MAJORITY", "6": "MAJORITY_AGREE", "7": "MAJORITY_DISAGREE",
};

function normalizedName(value: string | number | null | undefined, names: Record<string, string>): string {
  if (value === null || value === undefined) return "UNKNOWN";
  const text = String(value);
  return names[text] ?? text.toUpperCase();
}

export function transactionStatusName(transaction: TransactionStatusLike): string {
  const declared = normalizedName(transaction.statusName, STATUS_NAMES);
  return declared !== "UNKNOWN" ? declared : normalizedName(transaction.status, STATUS_NAMES);
}

export function transactionResultName(transaction: TransactionStatusLike): string {
  return normalizedName(transaction.resultName ?? transaction.result_name ?? transaction.result, RESULT_NAMES);
}

export function transactionExecutionResultName(transaction: TransactionStatusLike): string {
  const direct = transaction.txExecutionResultName;
  if (direct && direct.toUpperCase() !== "UNKNOWN") return direct.toUpperCase();
  if (transaction.txExecutionResult !== undefined && transaction.txExecutionResult !== null) {
    return ({ "0": "NOT_VOTED", "1": "FINISHED_WITH_RETURN", "2": "FINISHED_WITH_ERROR" } as Record<string, string>)[String(transaction.txExecutionResult)] ?? "UNKNOWN";
  }
  const legacy = (transaction.execution_result ?? transaction.consensus_data?.leader_receipt?.[0]?.execution_result)?.toUpperCase();
  if (legacy === "SUCCESS") return "FINISHED_WITH_RETURN";
  if (legacy === "ERROR") return "FINISHED_WITH_ERROR";
  if (legacy === "FINISHED_WITH_RETURN" || legacy === "FINISHED_WITH_ERROR") return legacy;
  return "UNKNOWN";
}

export function isSuccessfulExecution(transaction: TransactionStatusLike): boolean {
  return transactionExecutionResultName(transaction) === "FINISHED_WITH_RETURN";
}

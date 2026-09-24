"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  FIXTURE_BASE_URL,
  type Agent,
  type Charter,
  type Clause,
  type ContractIndex,
  type EdgeCheck,
  type Handoff,
  type LiveRecord,
  type TamperedSource,
  checkStudioNext,
  explorerContract,
  explorerTransaction,
  humanTime,
  readIndex,
  readRecord,
  readTransactionFacts,
  shortHash,
  type TransactionFacts,
} from "@/lib/contract";
import { useStudioWallet, type PreparedWrite, type WriteProgress } from "@/lib/wallet";

type FixtureAgent = Agent & {
  evidence: string;
  evidence_hash: string;
  artifact: string;
  artifact_hash: string;
  published_evidence_hash?: string;
};
type FixtureCase = {
  key: string;
  charter_id: string;
  title: string;
  purpose: string;
  charter_document: string;
  charter_hash: string;
  expected_outcome: "ACCEPTED" | "REMEDIATION_REQUIRED" | "BREACHED";
  expected_basis: "EVIDENCE_TAMPERED" | "VALIDATOR_JUDGMENT";
  clauses: Clause[];
  max_retries: number;
  escrow_units: number;
  primary_slash_bps: number;
  contributing_slash_bps: number;
  agents: FixtureAgent[];
};
type FixtureManifest = { accounting_unit: "DEMO"; cases: FixtureCase[] };
type ProofTransaction = {
  hash: string;
  statusName?: string;
  executionResultName?: string;
  successful?: boolean;
  validators?: number;
  votes?: Record<string, string>;
};
type PublicProof = { cases?: Record<string, { transactions?: Record<string, ProofTransaction> }> };
type NetworkState = "checking" | "online" | "offline";
type PanelStatus = "idle" | "preparing" | "ready" | "pending" | "success" | "error";
type PreparedAction = { prepared: PreparedWrite; method: string; targetCharterId?: string };
type TransactionPanel = { status: PanelStatus; method?: string; progress?: WriteProgress; error?: string };
type CaseMode = "live" | "preview";

const SLOT_ORDER = ["RESEARCH", "ANALYSIS", "DELIVERY"] as const;
const SLOT_LABELS: Record<string, string> = { RESEARCH: "Research", ANALYSIS: "Analysis", DELIVERY: "Delivery" };
const EXPECTED_BREACH_ROLES: Record<string, string> = {
  "AGENT-RESEARCH": "PRIMARY",
  "AGENT-ANALYSIS": "CONTRIBUTING",
  "AGENT-DELIVERY": "CLEAR",
};

function outcomeTone(outcome: string): "good" | "repair" | "bad" | "neutral" {
  if (outcome === "ACCEPTED") return "good";
  if (outcome === "REMEDIATION_REQUIRED") return "repair";
  if (outcome === "BREACHED") return "bad";
  return "neutral";
}

function outcomeCopy(outcome: string): string {
  if (outcome === "ACCEPTED") return "The frozen clauses passed. Contract code released the escrow by the charter’s reward split and returned every bond.";
  if (outcome === "REMEDIATION_REQUIRED") return "The evidence names repairable clauses. The next attempt is open; every reward and bond stays put.";
  if (outcome === "BREACHED") return "The terminal breach names one primary cause. The contract applies the frozen bond rules; the model never chooses amounts.";
  return "No adjudication is recorded yet. The contract state will change only after all three handoffs are submitted.";
}

function formatUnits(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : "Unavailable";
}

function formatGen(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const decimals = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole.toString()}${decimals ? `.${decimals}` : ""} GEN`;
}

function evidenceHref(filename: string): string {
  if (!filename) return "#";
  if (FIXTURE_BASE_URL) return `${FIXTURE_BASE_URL.replace(/\/$/, "")}/evidence/${encodeURIComponent(filename)}`;
  return `/evidence/${encodeURIComponent(filename)}`;
}

function titleCase(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

function Stamp({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "repair" | "bad" | "neutral" }) {
  return <span className={`stamp stamp--${tone}`}>{children}</span>;
}

function RoleTag({ role, expected = false }: { role: string; expected?: boolean }) {
  if (!role) return null;
  const normalized = role.toLowerCase();
  const className = normalized === "primary" ? "primary" : normalized === "contributing" ? "contributing" : "clear";
  return <span className={`role role--${className}`}>{expected ? `Expected ${role}` : role}</span>;
}

function Mascot({ slot, decorative = false }: { slot: string; decorative?: boolean }) {
  const name = slot === "RESEARCH" ? "Fern" : slot === "ANALYSIS" ? "Pip" : "Posty";
  const shared = { stroke: "#24241f", strokeWidth: 3.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className={`mascot mascot--${slot.toLowerCase()}`} viewBox="0 0 64 64" aria-hidden={decorative ? "true" : undefined} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `${name}, ${SLOT_LABELS[slot]?.toLowerCase() ?? "agent"} mascot`}>
    {slot === "RESEARCH" ? <>
      <path d="M13 31c0-12 8-20 19-20s19 8 19 20v14c0 7-6 12-19 12S13 52 13 45z" fill="#66b77b" {...shared} />
      <path d="M24 13c-8-8-15-3-12 6 6 2 10 0 12-6m8-2c1-9 9-11 12-4-2 6-6 8-12 4" fill="#a9d980" {...shared} />
      <ellipse cx="25" cy="34" rx="2" ry="3" fill="#24241f" /><ellipse cx="40" cy="34" rx="2" ry="3" fill="#24241f" />
      <path d="M27 43q5 5 10 0" fill="none" {...shared} />
    </> : slot === "ANALYSIS" ? <>
      <path d="M11 25q0-12 13-12h16q13 0 13 12v21q0 10-12 10H23q-12 0-12-10z" fill="#77b8d2" {...shared} />
      <path d="m18 16-4-8 12 4m24 4 4-8-12 4" fill="#a9d4df" {...shared} />
      <circle cx="25" cy="33" r="2.3" fill="#24241f" /><circle cx="40" cy="33" r="2.3" fill="#24241f" />
      <path d="M27 42q5 4 10 0" fill="none" {...shared} />
      <path d="m32 18 2 4 4 .5-3 3 .8 4.2-3.8-2-3.8 2L29 25.5l-3-3 4-.5z" fill="#fff0a5" {...shared} />
    </> : <>
      <path d="M12 24q0-10 11-10h19q10 0 10 10v24q0 8-9 8H21q-9 0-9-8z" fill="#edaa54" {...shared} />
      <path d="m14 25 18 14 18-14" fill="#ffd27d" {...shared} />
      <circle cx="25" cy="32" r="2.2" fill="#24241f" /><circle cx="40" cy="32" r="2.2" fill="#24241f" />
      <path d="M28 42q4 3 8 0" fill="none" {...shared} />
      <path d="M10 48q-6 0-5-7m49 7q6 0 5-7" fill="none" {...shared} />
    </>}
  </svg>;
}

function EdgeCheckMark({ passed }: { passed: boolean }) {
  return <span className="edge-pill__mark" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false">{passed ? <path d="m3 8 3.1 3.2L13 4.7" /> : <><path d="M8 2.5v6" /><circle cx="8" cy="12" r=".7" /></>}</svg></span>;
}

function MetaCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="meta-cell"><span className="meta-cell__label">{label}</span><span className={`meta-cell__value${mono ? " mono" : ""}`} title={value}>{value || "—"}</span></div>;
}

function NetworkPill({ state, walletChain }: { state: NetworkState; walletChain?: number }) {
  const className = state === "online" ? "network-status" : state === "offline" ? "network-status network-status--offline" : "network-status network-status--checking";
  const text = state === "checking" ? "Checking Studio Next" : state === "offline" ? "Studio Next unavailable" : walletChain && walletChain !== CHAIN_ID ? `Wallet on ${walletChain}` : "Studio Next · 61997";
  const shortText = state === "checking" ? "Checking…" : state === "offline" ? "Offline" : walletChain && walletChain !== CHAIN_ID ? "Wrong chain" : "Online";
  return <span className={className} role="status" aria-label={text}><span className={`status-dot${state === "online" ? " status-dot--ok" : state === "offline" ? " status-dot--bad" : ""}`} aria-hidden="true" /><span className="network-status__full" aria-hidden="true">{text}</span><span className="network-status__short" aria-hidden="true">{shortText}</span></span>;
}

function TraceRow({
  index,
  slot,
  wallet,
  handoff,
  evidenceHash,
  artifactHash,
  evidenceUrl,
  artifactUrl,
  previousHash,
  submittedAt,
  role,
  expected,
  live,
  edgeCheck,
  tamperedSource,
}: {
  index: number;
  slot: string;
  wallet: string;
  handoff: Handoff | null;
  evidenceHash: string;
  artifactHash: string;
  evidenceUrl: string;
  artifactUrl: string;
  previousHash: string;
  submittedAt: number;
  role: string;
  expected: boolean;
  live: boolean;
  edgeCheck?: EdgeCheck;
  tamperedSource?: TamperedSource;
}) {
  const submitted = live ? Boolean(handoff) : true;
  return (
    <div className="trace-row">
      <div className="trace-row__agent">
        <Mascot slot={slot} />
        <span><span className="trace-row__slot">{SLOT_LABELS[slot] ?? slot}</span><span className="trace-row__role">{wallet ? shortHash(wallet, 6) : "No wallet in preview"}</span></span>
      </div>
      {submitted ? (
        <div>
          <span className="trace-row__hash mono" title={artifactHash}>Output {shortHash(artifactHash)}</span>
          <span className="trace-row__previous mono" title={previousHash}>{index === 0 ? "First handoff · no preceding output" : `Previous ${shortHash(previousHash)}`}</span>
          <span className="trace-row__previous mono" title={evidenceHash}>Evidence {shortHash(evidenceHash)}</span>
        </div>
      ) : (
        <span className="not-submitted">Handoff not submitted on chain</span>
      )}
      <div className="trace-row__links">
        {submitted ? <>
          <a href={evidenceUrl} target="_blank" rel="noreferrer">Evidence ↗</a>
          <a href={artifactUrl} target="_blank" rel="noreferrer">Output ↗</a>
          {submittedAt ? <time dateTime={new Date(submittedAt * 1000).toISOString()}>{humanTime(submittedAt)}</time> : <span className="not-submitted">Fixture page</span>}
        </> : <span className="not-submitted">Awaiting {SLOT_LABELS[slot]?.toLowerCase()}</span>}
        <RoleTag role={role} expected={expected} />
        {edgeCheck ? <span className={`edge-pill edge-pill--${edgeCheck.status.toLowerCase()}`} aria-label={`Handoff edge checks ${edgeCheck.status.toLowerCase()}`}>
          <EdgeCheckMark passed={edgeCheck.status === "PASSED"} />
          {edgeCheck.status === "PASSED" ? "Edge checks passed" : "Edge check failed"}
        </span> : expected ? <span className="edge-pill edge-pill--passed"><EdgeCheckMark passed />Expected · edge checks passed</span> : null}
      </div>
      {tamperedSource ? <div className="hash-mismatch">
        <strong>Evidence changed after submission</strong>
        <span className="hash-mismatch__kind">{tamperedSource.source_kind.toLowerCase()} · fetched over HTTPS</span>
        <span className="hash-mismatch__hash"><span>Submitted</span><code>{tamperedSource.submitted_hash}</code></span>
        <span className="hash-mismatch__hash"><span>Fetched</span><code>{tamperedSource.fetched_hash}</code></span>
      </div> : null}
    </div>
  );
}

function MoneyTable({
  agents,
  outcome,
  accounting,
  live,
  escrow,
  fixture,
}: {
  agents: Agent[];
  outcome: string;
  accounting?: Charter["accounting"];
  live: boolean;
  escrow: number;
  fixture?: FixtureCase;
}) {
  if (!agents.length) return <p className="status-message">Settlement details appear when the charter record loads.</p>;
  const expectedRoles = fixture?.expected_basis === "EVIDENCE_TAMPERED"
    ? Object.fromEntries(agents.map((agent) => [agent.agent_id, fixture.agents.find((item) => item.agent_id === agent.agent_id)?.published_evidence_hash ? "PRIMARY" : "CLEAR"]))
    : EXPECTED_BREACH_ROLES;
  const rows = agents.map((agent) => {
    let reward = accounting?.agent_rewards?.[agent.agent_id] ?? 0;
    let returned = accounting?.bonds_returned?.[agent.agent_id] ?? 0;
    let slashed = accounting?.bonds_slashed?.[agent.agent_id] ?? 0;
    let held = 0;
    if (!live && fixture) {
      if (outcome === "ACCEPTED") {
        reward = Math.floor((escrow * agent.reward_bps) / 10000);
        returned = agent.bond_units;
      } else if (outcome === "BREACHED") {
        const role = expectedRoles[agent.agent_id];
        const rate = role === "PRIMARY" ? fixture.primary_slash_bps : role === "CONTRIBUTING" ? fixture.contributing_slash_bps : 0;
        slashed = Math.floor((agent.bond_units * rate) / 10000);
        returned = agent.bond_units - slashed;
      } else {
        held = agent.bond_units;
      }
    } else if (outcome === "REMEDIATION_REQUIRED") {
      held = agent.bond_units;
    }
    return { agent, reward, returned, slashed, held };
  });
  const locked = live ? accounting?.escrow_locked_units ?? 0 : outcome === "REMEDIATION_REQUIRED" ? escrow : 0;
  const released = live ? accounting?.escrow_released_units ?? 0 : outcome === "ACCEPTED" ? escrow : 0;
  const refunded = live ? accounting?.escrow_refunded_units ?? 0 : outcome === "BREACHED" ? escrow : 0;
  return (
    <>
      <div className="section-title">
        <h2>Settlement receipt</h2>
        <p>{live ? "Contract state" : "Expected synthetic calculation"} · DEMO accounting</p>
      </div>
      <table className="receipt__table">
        <thead><tr><th scope="col">Agent</th><th scope="col">Reward</th><th scope="col">Bond back</th><th scope="col">Slashed</th><th scope="col">Held</th></tr></thead>
        <tbody>{rows.map(({ agent, reward, returned, slashed, held }) => <tr key={agent.agent_id}>
          <td>{SLOT_LABELS[agent.slot] ?? agent.slot}</td>
          <td className="mono">{formatUnits(reward)}</td>
          <td className="mono">{formatUnits(returned)}</td>
          <td className="mono">{formatUnits(slashed)}</td>
          <td className="mono">{formatUnits(held)}</td>
        </tr>)}</tbody>
      </table>
      <div className="receipt__summary">
        <p className="receipt__note">Escrow: <strong>{formatUnits(locked)} locked</strong> · {formatUnits(released)} released · {formatUnits(refunded)} refunded. {live ? "Every amount is read from the finalized contract record." : "This is a labeled fixture calculation from the values intended to be frozen into the charter; it is not a contract result."} The LLM supplies a normalized judgment only; contract code calculates each integer amount.</p>
        <p className="receipt__hash"><strong>Final receipt hash</strong>{live && accounting && outcome !== "REMEDIATION_REQUIRED" ? "Recorded with the receipt view." : "Not recorded on chain in this view."}</p>
      </div>
    </>
  );
}

function StudioNextLink({ children, href }: { children: ReactNode; href: string }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

export default function FaultlineApp() {
  const wallet = useStudioWallet();
  const [network, setNetwork] = useState<NetworkState>("checking");
  const [networkError, setNetworkError] = useState("");
  const [index, setIndex] = useState<ContractIndex | null>(null);
  const [indexError, setIndexError] = useState("");
  const [record, setRecord] = useState<LiveRecord | null>(null);
  const [recordError, setRecordError] = useState("");
  const [manifest, setManifest] = useState<FixtureManifest | null>(null);
  const [manifestError, setManifestError] = useState("");
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [selection, setSelection] = useState("");
  const [recordReadAt, setRecordReadAt] = useState<number>();
  const [refreshing, setRefreshing] = useState(false);
  const [proofFacts, setProofFacts] = useState<{ hash: string; facts: TransactionFacts } | null>(null);
  const [proofFactsError, setProofFactsError] = useState<{ hash: string; message: string } | null>(null);
  const [plainNumbers, setPlainNumbers] = useState(false);
  const [preparedAction, setPreparedAction] = useState<PreparedAction | null>(null);
  const [panel, setPanel] = useState<TransactionPanel>({ status: "idle" });
  const [actionMessage, setActionMessage] = useState("");
  const [testGenMessage, setTestGenMessage] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showHandoffForm, setShowHandoffForm] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPurpose, setDraftPurpose] = useState("");
  const [draftDocumentUrl, setDraftDocumentUrl] = useState("");
  const [draftDocumentHash, setDraftDocumentHash] = useState("");
  const [draftEvidenceBase, setDraftEvidenceBase] = useState("");
  const [draftClauseTexts, setDraftClauseTexts] = useState(["", "", ""]);
  const [draftWallets, setDraftWallets] = useState(["", "", ""]);
  const [draftRetries, setDraftRetries] = useState(0);
  const [handoffEvidenceUrl, setHandoffEvidenceUrl] = useState("");
  const [handoffEvidenceHash, setHandoffEvidenceHash] = useState("");
  const [handoffArtifactUrl, setHandoffArtifactUrl] = useState("");
  const [handoffArtifactHash, setHandoffArtifactHash] = useState("");
  const [handoffPreviousHash, setHandoffPreviousHash] = useState("");

  useEffect(() => {
    let current = true;
    void fetch("/evidence/manifest.json", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Fixture manifest returned HTTP ${response.status}`);
      return await response.json() as FixtureManifest;
    }).then((value) => { if (current) setManifest(value); }).catch((error: unknown) => { if (current) setManifestError(messageOf(error)); });
    void fetch("/demo-proof.json", { cache: "no-store" }).then(async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Public proof file returned HTTP ${response.status}`);
      return await response.json() as PublicProof;
    }).then((value) => { if (current && value) setProof(value); }).catch(() => undefined);
    return () => { current = false; };
  }, []);

  const refreshState = useCallback(async (preferredId?: string) => {
    setRefreshing(true);
    setNetworkError("");
    try {
      await checkStudioNext();
      setNetwork("online");
      if (!/^0x[\da-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
        setIndex(null);
        setIndexError("No deployed Faultline address is configured for this build.");
        setRecord(null);
        setRecordError("");
        return null;
      }
      const nextIndex = await readIndex();
      setIndex(nextIndex);
      setIndexError("");
      const currentLiveId = selection.startsWith("live:") ? selection.slice(5) : "";
      const nextId = preferredId || currentLiveId || nextIndex.items[0]?.charter_id || "";
      if (!nextId) {
        setRecord(null);
        setRecordError("");
        return nextIndex;
      }
      const nextRecord = await readRecord(nextId);
      setRecord(nextRecord);
      setRecordReadAt(Date.now());
      setRecordError("");
      setSelection(`live:${nextId}`);
      return nextRecord;
    } catch (error) {
      const message = messageOf(error);
      if (/expected Studio Next|RPC returned|fetch failed|network|failed to fetch|timeout/i.test(message)) {
        setNetwork("offline");
        setNetworkError(message);
      } else {
        setNetwork("online");
        setIndexError(message);
        setRecordError(message);
      }
      throw error;
    } finally {
      setRefreshing(false);
    }
  }, [selection]);

  useEffect(() => {
    let current = true;
    void checkStudioNext().then(async () => {
      if (!current) return;
      setNetwork("online");
      setNetworkError("");
      if (!/^0x[\da-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
        setIndexError("No deployed Faultline address is configured for this build. Fixture previews remain separate from live chain state.");
        return;
      }
      try {
        const nextIndex = await readIndex();
        if (!current) return;
        setIndex(nextIndex);
        setIndexError("");
        if (!selection && nextIndex.items[0]) setSelection(`live:${nextIndex.items[0].charter_id}`);
      } catch (error) {
        if (current) setIndexError(messageOf(error));
      }
    }).catch((error: unknown) => {
      if (current) {
        setNetwork("offline");
        setNetworkError(messageOf(error));
      }
    });
    return () => { current = false; };
    // Initial status check only; manual refresh handles the user's next read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const hasConfiguredContract = /^0x[\da-fA-F]{40}$/.test(CONTRACT_ADDRESS);
    if (!manifest || selection || (hasConfiguredContract && index === null && network !== "offline" && !indexError)) return;
    if ((!hasConfiguredContract || network === "offline" || Boolean(indexError)) && manifest.cases[0]) setSelection(`preview:${manifest.cases[0].charter_id}`);
    else if (index && index.items.length === 0 && manifest.cases[0]) setSelection(`preview:${manifest.cases[0].charter_id}`);
  }, [manifest, selection, index, network, indexError]);

  const selectionMode: CaseMode = selection.startsWith("live:") ? "live" : "preview";
  const selectedCharterId = selection.split(":").slice(1).join(":");
  const fixture = useMemo(() => manifest?.cases.find((item) => item.charter_id === selectedCharterId), [manifest, selectedCharterId]);
  const liveRecord = selectionMode === "live" && record?.charter.charter_id === selectedCharterId ? record : null;
  const liveItems = index?.items ?? [];
  const liveSelection = selectionMode === "live" ? liveItems.find((item) => item.charter_id === selectedCharterId) : undefined;
  const charter = liveRecord?.charter;
  const attempt = liveRecord?.attempt;
  const traceAttempt = attempt?.handoffs_received === 0 && charter?.latest_outcome === "REMEDIATION_REQUIRED"
    ? liveRecord?.previous_attempt ?? attempt
    : attempt;
  const preview = selectionMode === "preview";
  const outcome = charter?.latest_outcome ?? (preview ? fixture?.expected_outcome ?? "" : "");
  const title = charter?.title ?? (preview ? fixture?.title : liveSelection?.title) ?? "Charter record";
  const purpose = charter?.purpose ?? (preview ? fixture?.purpose : "The live charter purpose appears after a successful contract read.");
  const clauses = charter?.clauses ?? (preview ? fixture?.clauses ?? [] : []);
  const agents = charter?.agents ?? (preview ? fixture?.agents ?? [] : []);
  const responsible = charter?.responsibility ?? [];
  const expected = preview;
  const currentAttempt = charter?.current_attempt ?? (preview ? 1 : 0);
  const maxRetries = charter?.max_retries ?? (preview ? fixture?.max_retries ?? 0 : 0);
  const selectedProofTx = selectedCharterId ? proof?.cases?.[selectedCharterId]?.transactions?.adjudicate : undefined;

  useEffect(() => {
    let current = true;
    if (selectionMode !== "live" || !selectedProofTx?.hash) return;
    const hash = selectedProofTx.hash;
    void readTransactionFacts(hash).then((facts) => { if (current) setProofFacts({ hash, facts }); }).catch((error: unknown) => { if (current) setProofFactsError({ hash, message: messageOf(error) }); });
    return () => { current = false; };
  }, [selectionMode, selectedProofTx?.hash]);

  useEffect(() => {
    const currentId = record?.charter.charter_id;
    if (selectionMode !== "live" || network !== "online" || !selectedCharterId || currentId === selectedCharterId || !/^0x[\da-fA-F]{40}$/.test(CONTRACT_ADDRESS)) return;
    let current = true;
    void readRecord(selectedCharterId).then((nextRecord) => {
      if (!current) return;
      setRecord(nextRecord);
      setRecordReadAt(Date.now());
      setRecordError("");
    }).catch((error: unknown) => {
      if (current) setRecordError(messageOf(error));
    });
    return () => { current = false; };
  }, [selectionMode, network, selectedCharterId, record?.charter.charter_id]);

  const transactionFacts = proofFacts && proofFacts.hash === selectedProofTx?.hash ? proofFacts.facts : null;
  const transactionFactsError = proofFactsError && proofFactsError.hash === selectedProofTx?.hash ? proofFactsError.message : "";
  const outcomeState = outcome || (charter?.state === "READY_FOR_REVIEW" ? "READY_FOR_REVIEW" : "PENDING");
  const tone = outcomeTone(outcomeState);
  const fileHash = charter?.document_hash ?? (preview ? fixture?.charter_hash : "") ?? "";
  const currentReadAt = recordReadAt ? new Date(recordReadAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "Not read yet";

  const traceRows = agents.map((agent, position) => {
    const handoff = traceAttempt?.handoffs?.[position] ?? null;
    const fixtureAgent = preview ? fixture?.agents[position] : undefined;
    const changedSource = preview && fixtureAgent?.published_evidence_hash
      ? { agent_id: agent.agent_id, source_kind: "EVIDENCE" as const, url: evidenceHref(fixtureAgent.evidence), submitted_hash: fixtureAgent.evidence_hash, fetched_hash: fixtureAgent.published_evidence_hash }
      : traceAttempt?.tampered_sources?.find((item) => item.agent_id === agent.agent_id);
    const role = liveRecord
      ? responsible.find((item) => item.agent_id === agent.agent_id)?.role ?? ""
      : preview && fixture?.expected_outcome === "BREACHED"
        ? fixture.expected_basis === "EVIDENCE_TAMPERED" ? changedSource ? "PRIMARY" : "CLEAR" : EXPECTED_BREACH_ROLES[agent.agent_id] ?? ""
        : "";
    const previousHash = handoff?.previous_output_hash ?? (preview && position > 0 ? fixture?.agents[position - 1]?.artifact_hash ?? "" : "");
    return {
      agent,
      handoff,
      role,
      previousHash,
      evidenceHash: handoff?.evidence_hash ?? fixtureAgent?.evidence_hash ?? "",
      artifactHash: handoff?.artifact_hash ?? fixtureAgent?.artifact_hash ?? "",
      evidenceUrl: handoff?.evidence_url ?? (fixtureAgent ? evidenceHref(fixtureAgent.evidence) : "#"),
      artifactUrl: handoff?.artifact_url ?? (fixtureAgent ? evidenceHref(fixtureAgent.artifact) : "#"),
      submittedAt: handoff?.submitted_at ?? 0,
      edgeCheck: handoff?.edge_check,
      tamperedSource: changedSource,
    };
  });

  const edgeChecksAllPassed = traceRows.length === SLOT_ORDER.length && traceRows.every((row) => expected ? true : row.edgeCheck?.status === "PASSED");
  const assessmentBasis = liveRecord ? traceAttempt?.basis : preview ? fixture?.expected_basis : undefined;
  const totalBonds = agents.reduce((sum, agent) => sum + (Number.isFinite(agent.bond_units) ? agent.bond_units : 0), 0);

  const prepareAction = useCallback(async (method: string, args: unknown[], targetCharterId?: string) => {
    setActionMessage("");
    setPreparedAction(null);
    setPanel({ status: "preparing", method });
    try {
      const prepared = await wallet.prepareWrite(method, args);
      setPreparedAction({ prepared, method, targetCharterId });
      setPanel({ status: "ready", method });
    } catch (error) {
      setPanel({ status: "error", method, error: messageOf(error) });
    }
  }, [wallet]);

  const confirmAction = useCallback(async () => {
    if (!preparedAction) return;
    const action = preparedAction;
    setPreparedAction(null);
    setPanel({ status: "pending", method: action.method });
    try {
      const final = await wallet.signWrite(action.prepared, (progress) => setPanel({ status: "pending", method: action.method, progress }));
      setPanel({ status: "pending", method: action.method, progress: final });
      const verifiedRecord = await refreshState(action.targetCharterId);
      if (action.targetCharterId && (!verifiedRecord || !("charter" in verifiedRecord) || verifiedRecord.charter.charter_id !== action.targetCharterId)) {
        throw new Error(`Transaction succeeded, but a fresh read did not confirm charter ${action.targetCharterId}. Refresh the docket before treating the change as visible.`);
      }
      setPanel({ status: "success", method: action.method, progress: final });
      setActionMessage("Transaction finalized, GenVM execution succeeded, and a fresh contract read completed.");
    } catch (error) {
      setPanel((existing) => ({ ...existing, status: "error", error: messageOf(error) }));
    }
  }, [preparedAction, refreshState, wallet]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = draftTitle.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "CHARTER";
    const charterId = `FLT-${slug}-${Math.floor(Date.now() / 1000)}`;
    const clauseIds = ["C1", "C2", "C3"];
    const clausesJson = JSON.stringify(draftClauseTexts.map((text, index) => ({ id: clauseIds[index], text: text.trim() })));
    const createdAgents = SLOT_ORDER.map((slot, index) => ({
      agent_id: `AGENT-${slot}`,
      slot,
      role: `${SLOT_LABELS[slot]} agent`,
      wallet: draftWallets[index].trim(),
      bond_units: 1000,
      reward_bps: [5000, 3000, 2000][index],
      responsibility_clause_ids: [clauseIds[index]],
    }));
    const args = [
      charterId,
      draftTitle.trim(),
      draftPurpose.trim(),
      draftDocumentUrl.trim(),
      draftDocumentHash.trim(),
      draftEvidenceBase.trim(),
      clausesJson,
      draftRetries,
      JSON.stringify(createdAgents),
      100000,
      5000,
      2500,
      Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      "faultline-settlement/1.0",
    ];
    await prepareAction("create_charter", args, charterId);
  }

  const refreshFromButton = async () => {
    setPanel({ status: "idle" });
    setActionMessage("");
    try { await refreshState(); } catch { /* the read error is shown beside the docket */ }
  };

  async function handleTestFunds() {
    setTestGenMessage("");
    try { const balance = await wallet.requestTestFunds(); setTestGenMessage(`Faucet response verified. Current test balance: ${balance}.`); }
    catch (error) { setTestGenMessage(`Test GEN was not verified: ${messageOf(error)}`); }
  }

  const fixtureItems = manifest?.cases ?? [];
  const canInspectLive = Boolean(/^0x[\da-fA-F]{40}$/.test(CONTRACT_ADDRESS) && network === "online");
  const walletOnNetwork = Boolean(wallet.address && wallet.chainId === CHAIN_ID);
  const canPrepareWrites = Boolean(walletOnNetwork && canInspectLive && CONTRACT_ADDRESS);
  const requester = charter?.requester ?? "";
  const isRequester = Boolean(wallet.address && requester && wallet.address.toLowerCase() === requester.toLowerCase());
  const nextHandoffIndex = attempt?.handoffs?.findIndex((item) => !item) ?? -1;
  const nextAgent = nextHandoffIndex >= 0 ? charter?.agents[nextHandoffIndex] : undefined;
  const isNextAgent = Boolean(wallet.address && nextAgent?.wallet.toLowerCase() === wallet.address.toLowerCase());
  const acceptsHandoffs = Boolean(charter && ["SEALED", "IN_PROGRESS", "AWAITING_REMEDIATION"].includes(charter.state) && nextAgent);
  const canAdjudicate = Boolean(charter && charter.state === "READY_FOR_REVIEW" && isRequester);
  const canSeal = Boolean(charter && charter.state === "DRAFT" && isRequester);
  const canCancel = Boolean(charter && charter.state === "DRAFT" && isRequester);
  const canExpire = Boolean(charter && ["SEALED", "IN_PROGRESS", "READY_FOR_REVIEW", "AWAITING_REMEDIATION"].includes(charter.state) && Date.now() / 1000 >= charter.expires_at);

  const clauseState = (clauseId: string): { label: string; tone: string; assigned: string } => {
    const owner = (charter?.agents ?? (preview ? fixture?.agents : undefined) ?? []).find((agent) => agent.responsibility_clause_ids.includes(clauseId));
    const role = responsible.find((entry) => entry.clause_ids.includes(clauseId));
    if (charter) {
      if (charter.violated_clause_ids.includes(clauseId)) return {
        label: charter.latest_outcome === "REMEDIATION_REQUIRED" ? "Needs repair" : "Violated",
        tone: charter.latest_outcome === "REMEDIATION_REQUIRED" ? "repair" : "violated",
        assigned: role ? `${owner?.slot ?? "Agent"} · ${role.role}` : owner?.slot ?? "No responsible agent recorded",
      };
      if (charter.latest_outcome === "ACCEPTED") return { label: "Satisfied", tone: "met", assigned: owner?.slot ?? "—" };
      return { label: "Not flagged", tone: "repair", assigned: owner?.slot ?? "No role assigned" };
    }
    if (!preview || !fixture) return { label: "Unassessed", tone: "repair", assigned: owner?.slot ?? "—" };
    const tamperCase = fixture.expected_basis === "EVIDENCE_TAMPERED";
    const ownerChanged = Boolean(fixture.agents.find((agent) => agent.agent_id === owner?.agent_id)?.published_evidence_hash);
    const isViolated = fixture.expected_outcome === "BREACHED" && (tamperCase ? ownerChanged : ["C1", "C2"].includes(clauseId));
    const needsRepair = fixture.expected_outcome === "REMEDIATION_REQUIRED" && clauseId === "C3";
    const isMet = fixture.expected_outcome === "ACCEPTED";
    const expectedRole = fixture.expected_outcome === "BREACHED"
      ? tamperCase ? (ownerChanged ? "PRIMARY" : "CLEAR") : EXPECTED_BREACH_ROLES[owner?.agent_id ?? ""]
      : "";
    return {
      label: isViolated ? "Expected violation" : needsRepair ? "Expected repair" : isMet ? "Expected satisfied" : "Not implicated",
      tone: isViolated ? "violated" : needsRepair ? "repair" : isMet ? "met" : "repair",
      assigned: expectedRole ? `${owner?.slot ?? "Agent"} · expected ${expectedRole}` : owner?.slot ?? "—",
    };
  };

  const emptyLive = selectionMode === "live" && !liveRecord;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to the docket</a>
      <header className="topbar">
        <a className="brand" href="#main" aria-label="Faultline home">
          <span className="brand__seal" aria-hidden="true">F</span><span className="brand__word">FAULTLINE</span>
        </a>
        <div className="topbar__right">
          <NetworkPill state={network} walletChain={wallet.chainId} />
          {wallet.address ? <span className="wallet-address mono" title={wallet.address}>{shortHash(wallet.address, 6)}</span> : null}
          {!wallet.address ? <button className="button button--small" type="button" onClick={() => void wallet.connect()} disabled={wallet.connecting}>{wallet.connecting ? "Connecting…" : "Connect wallet"}</button> : null}
        </div>
      </header>

      <main className="page" id="main">
       <div className="paper-card" data-plain-numbers={plainNumbers}>
        <nav className="folder-tabs" aria-label="Docket sections">
          <a href="#docket-title">charter</a><a href="#trace-section">trace</a><a href="#receipt-title">receipts</a><a href="#controls-title">controls</a>
        </nav>
        <section className="intro" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">The handoff, on record.</h1>
            <p className="intro__purpose">Faultline follows one frozen charter across Research, Analysis, and Delivery—then lets GenLayer judge the evidence before contract code settles the result.</p>
          </div>
          <div className="intro__aside"><p className="intro__note">One charter. Three handoffs. No percentage blame. We keep the receipts; the contract does the math.</p>
            <button className="plain-toggle" type="button" aria-pressed={plainNumbers} onClick={() => setPlainNumbers((value) => !value)}>{plainNumbers ? "Plain numbers: on" : "Plain numbers"}</button>
          </div>
        </section>

        <div className="environment" aria-label="Deployment details">
          <span className="environment__label">Studio Next</span>
          <NetworkPill state={network} walletChain={wallet.chainId} />
          <span className="environment__label">Contract</span>
          <span className="environment__address mono">
            {CONTRACT_ADDRESS ? <StudioNextLink href={explorerContract()}>{CONTRACT_ADDRESS}</StudioNextLink> : "Not deployed in this environment"}
          </span>
          {selectionMode === "preview" ? <span className="data-mode">Synthetic fixture preview</span> : <span className="data-mode data-mode--live">Live contract selection</span>}
        </div>

        {networkError ? <div className="status-message status-message--error" role="alert"><span className="status-dot status-dot--bad" aria-hidden="true" /><p><strong>Studio Next could not be reached.</strong> {networkError} Live state is unavailable. Any fixture shown below is a separate synthetic preview.</p></div> : null}
        {indexError && CONTRACT_ADDRESS ? <div className="status-message status-message--error" role="alert"><span className="status-dot status-dot--bad" aria-hidden="true" /><p><strong>Contract read unavailable.</strong> {indexError} Refresh after the chain is reachable; fixture preview remains separately labeled.</p></div> : null}
        {manifestError ? <div className="status-message status-message--error" role="alert"><span className="status-dot status-dot--bad" aria-hidden="true" /><p><strong>Synthetic fixture files could not be loaded.</strong> {manifestError}</p></div> : null}

        <section className="stat-pills" aria-label="Selected charter summary">
          <div className="stat-pill"><span>Escrow</span><strong>{charter || fixture ? `${formatUnits(charter?.escrow_units ?? fixture?.escrow_units ?? 0)} DEMO` : "—"}</strong></div>
          <div className="stat-pill"><span>Agents</span><strong>{agents.length ? `${agents.length} assigned` : "—"}</strong></div>
          <div className="stat-pill"><span>Bond pool</span><strong>{agents.length ? `${formatUnits(totalBonds)} DEMO` : "—"}</strong></div>
          <div className={`stat-pill stat-pill--${tone}`}><span>Outcome</span><strong>{titleCase(outcomeState)}</strong></div>
        </section>

        <div className="workbench">
          <aside className="register" aria-label="Charter register">
            <div className="register__heading"><h2>Case register</h2><span className="register__count">{liveItems.length ? `${liveItems.length} live` : "review desk"}</span></div>
            {liveItems.length ? <div className="case-list" aria-label="On-chain charters">
              {liveItems.map((item, position) => <button key={item.charter_id} className="case-button" type="button" aria-current={selection === `live:${item.charter_id}`} onClick={() => { setSelection(`live:${item.charter_id}`); setRecordError(""); }}>
                <span className="case-button__mark" aria-hidden="true">{String(position + 1).padStart(2, "0")}</span>
                <span><span className="case-button__title">{item.title}</span><span className="case-button__meta">{item.charter_id} · {item.latest_outcome || titleCase(item.state)}</span></span>
              </button>)}
            </div> : null}
            {fixtureItems.length ? <div className="case-list" aria-label="Synthetic reviewer fixtures">
              {fixtureItems.map((item, position) => <button key={item.charter_id} className="case-button" type="button" aria-current={selection === `preview:${item.charter_id}`} onClick={() => { setSelection(`preview:${item.charter_id}`); setRecordError(""); }}>
                <span className="case-button__mark" aria-hidden="true">{String(position + 1).padStart(2, "0")}</span>
                <span><span className="case-button__title">{item.title}</span><span className="case-button__meta">Fixture · expected {item.expected_outcome}</span></span>
              </button>)}
            </div> : null}
            <label className="sr-only" htmlFor="mobile-case-picker">Choose a charter or fixture</label>
            <select className="mobile-case-picker" id="mobile-case-picker" value={selection} onChange={(event) => setSelection(event.target.value)}>
              {liveItems.map((item) => <option key={`live:${item.charter_id}`} value={`live:${item.charter_id}`}>Live · {item.title}</option>)}
              {fixtureItems.map((item) => <option key={`preview:${item.charter_id}`} value={`preview:${item.charter_id}`}>Fixture · {item.title}</option>)}
              {!liveItems.length && !fixtureItems.length ? <option value="">No cases available</option> : null}
            </select>
            <p className="register__help">Choose a live charter or a clearly marked reviewer fixture. A fixture never stands in for a contract read.</p>
          </aside>

          <section className="docket" id="trace-section" aria-labelledby="docket-title" aria-live="polite">
            <div className="docket__topline">
              <span className="mono">{selectedCharterId || "FAULTLINE / NO SELECTION"}</span>
              <Stamp tone={expected ? tone : outcomeTone(charter?.latest_outcome ?? "")}>{expected ? `EXPECTED · ${fixture?.expected_outcome ?? "FIXTURE"}` : charter ? titleCase(charter.state) : "LIVE READ PENDING"}</Stamp>
            </div>
            <h2 id="docket-title">{title}</h2>
            <p className="docket__purpose">{purpose}</p>

            {emptyLive ? <div className="status-message" role="status"><span className="status-dot" aria-hidden="true" /><p>{recordError ? <><strong>Latest on-chain read failed.</strong> {recordError} The selected charter has no substitute fixture content.</> : network === "offline" ? "Studio Next is offline. The live charter remains unavailable; choose a separately labeled fixture to inspect the reviewer flow." : "Reading the selected charter and current attempt from Studio Next…"}</p></div> : null}
            {recordError && liveRecord ? <div className="status-message status-message--error" role="alert"><span className="status-dot status-dot--bad" aria-hidden="true" /><p><strong>The newest read failed.</strong> {recordError} The values below are the last successful on-chain read at {currentReadAt}.</p></div> : null}

            <div className="docket-meta">
              <MetaCell label="Charter document hash" value={fileHash ? shortHash(fileHash, 12) : "Unavailable"} mono />
              <MetaCell label="Requester" value={charter?.requester ?? (expected ? "Not supplied in the synthetic fixture" : "Unavailable until read")} mono={Boolean(charter?.requester)} />
              <MetaCell label="Attempt / retry" value={charter || preview ? `Attempt ${currentAttempt} · ${maxRetries} ${maxRetries === 1 ? "retry" : "retries"} allowed` : "Unavailable until read"} />
              <MetaCell label="Settlement version" value={charter?.settlement_version ?? (expected ? "faultline-settlement/1.0 · fixture" : "Unavailable until read")} mono />
              <MetaCell label="State" value={charter ? titleCase(charter.state) : expected ? "Synthetic preview · not a chain state" : "Unavailable"} />
              <MetaCell label="Accounting" value="DEMO only · no real assets" />
              <MetaCell label="Final outcome" value={charter?.latest_outcome || (expected ? `Expected ${fixture?.expected_outcome}` : "Not recorded")} />
              <MetaCell label="Last chain read" value={liveRecord ? currentReadAt : expected ? "Not applicable · fixture only" : "Not read"} />
            </div>

            <div className="trace-heading"><h3>Three-agent handoff trace</h3><p>{expected ? "Synthetic reviewer fixture · Attempt 1" : charter ? `Attempt ${traceAttempt?.attempt_number ?? currentAttempt} · ${traceAttempt?.handoffs_received ?? 0}/3 handoffs recorded${traceAttempt?.attempt_number !== currentAttempt ? " · last adjudicated" : ""}` : "Attempt details unavailable until read"}</p></div>
            <div className="trace-list">
              {traceRows.length ? traceRows.map((row, position) => <TraceRow
                key={row.agent.agent_id}
                index={position}
                slot={row.agent.slot}
                wallet={row.agent.wallet}
                handoff={row.handoff}
                evidenceHash={row.evidenceHash}
                artifactHash={row.artifactHash}
                evidenceUrl={row.evidenceUrl}
                artifactUrl={row.artifactUrl}
                previousHash={row.previousHash}
                submittedAt={row.submittedAt}
                role={row.role}
                expected={expected && Boolean(row.role)}
                live={!expected}
                edgeCheck={row.edgeCheck}
                tamperedSource={row.tamperedSource}
              />) : <div className="status-message" role="status"><span className="status-dot" aria-hidden="true" /><p>Three assigned agent slots will appear after the charter is read.</p></div>}
            </div>
            {edgeChecksAllPassed ? <section className={`verdict-board verdict-board--${tone}`} aria-label="Handoff checks and responsibility">
              <div className="verdict-board__head"><div><h3>{outcomeState === "BREACHED" ? "Every handoff passed its checks. The result is a breach." : "Every handoff passed its own checks."}</h3><p>Hash chain · submission time · evidence base</p></div><Stamp tone={tone}>{outcomeState}</Stamp></div>
              <div className="role-rows" aria-label="Fixed responsibility roles; bar lengths do not represent percentages">
                {traceRows.map((row) => <div className="role-row" key={`role-${row.agent.agent_id}`}><Mascot slot={row.agent.slot} decorative /><span className="role-row__name">{SLOT_LABELS[row.agent.slot]}</span><RoleTag role={row.role || "CLEAR"} expected={expected} /><span className={`role-bar role-bar--${(row.role || "CLEAR").toLowerCase()}`} aria-hidden="true"><i /></span></div>)}
              </div>
              <table className="role-plain-table"><thead><tr><th>Agent</th><th>Responsibility role</th><th>Clause IDs</th></tr></thead><tbody>{traceRows.map((row) => <tr key={`plain-${row.agent.agent_id}`}><td>{SLOT_LABELS[row.agent.slot]}</td><td>{row.role || "CLEAR"}{expected ? " · expected" : ""}</td><td>{responsible.find((item) => item.agent_id === row.agent.agent_id)?.clause_ids.join(", ") || row.agent.responsibility_clause_ids.join(", ") || "—"}</td></tr>)}</tbody></table>
              <p className="verdict-board__foot">Responsibility roles are fixed categories. Bar lengths are decorative and do not mean blame percentages.</p>
            </section> : null}
            {expected ? <p className="demo-note">Synthetic reviewer fixture · not evidence of a real customer or production incident · {fixture?.charter_id} · Attempt 1. Open each evidence page to inspect its source and output.</p> : null}
            <div className="trace-key" aria-label="Trace legend"><span><i className="key-dot key-dot--source" aria-hidden="true" />Submitted evidence</span><span><i className="key-dot key-dot--artifact" aria-hidden="true" />Agent output</span><span><i className="key-dot" aria-hidden="true" />Previous-output link</span></div>
          </section>
        </div>

        <section className="detail-grid" id="clause-section" aria-label="Clause and validator detail">
          <div>
            <div className="section-title"><h2>Clause inspector</h2><p>{expected ? "Expected fixture mapping" : "Frozen charter text"}</p></div>
            <div className="clause-list">
              {clauses.length ? clauses.map((clause) => {
                const status = clauseState(clause.id);
                const fixtureOwner = preview ? fixture?.agents.find((agent) => agent.responsibility_clause_ids.includes(clause.id)) : undefined;
                const liveOwner = charter?.agents.find((agent) => agent.responsibility_clause_ids.includes(clause.id));
                const slot = fixtureOwner?.slot ?? liveOwner?.slot;
                const evidenceIndex = preview ? fixture?.agents.findIndex((agent) => agent.responsibility_clause_ids.includes(clause.id)) ?? -1 : -1;
                const evidence = preview && evidenceIndex >= 0 ? fixture?.agents[evidenceIndex] : undefined;
                const handoffIndex = charter?.agents.findIndex((agent) => agent.responsibility_clause_ids.includes(clause.id)) ?? -1;
                const handoff = charter && handoffIndex >= 0 ? traceAttempt?.handoffs?.[handoffIndex] : undefined;
                return <div className="clause-row" key={clause.id}>
                  <span className="clause-id">{clause.id}</span>
                  <p>{clause.text}<br /><span className="not-submitted">Assigned slot: {slot ? SLOT_LABELS[slot] : "not available"} · {status.assigned}</span></p>
                  <span className={`clause-status clause-status--${status.tone}`}>{status.label}</span>
                  <div className="evidence-links">
                    {handoff?.evidence_url ? <a href={handoff.evidence_url} target="_blank" rel="noreferrer">Submitted evidence ↗</a> : evidence ? <a href={evidenceHref(evidence.evidence)} target="_blank" rel="noreferrer">Fixture evidence ↗</a> : null}
                    {handoff?.artifact_url ? <a href={handoff.artifact_url} target="_blank" rel="noreferrer">Submitted output ↗</a> : evidence ? <a href={evidenceHref(evidence.artifact)} target="_blank" rel="noreferrer">Fixture output ↗</a> : null}
                    {!evidence && !handoff ? <span className="not-submitted">Evidence links appear when this slot is submitted.</span> : null}
                  </div>
                </div>;
              }) : <p className="status-message">Frozen charter clauses appear here after a successful chain read.</p>}
            </div>
          </div>

          <aside className="consensus" aria-labelledby="consensus-title">
            <div className="section-title"><h2 id="consensus-title">Consensus record</h2><p>Judgment and execution are separate</p></div>
            <div className="consensus__result">
              <strong>{expected ? `EXPECTED · ${fixture?.expected_outcome ?? "—"}` : charter?.latest_outcome || (charter?.state === "READY_FOR_REVIEW" ? "READY FOR REVIEW" : "NO OUTCOME YET")}</strong>
              <Stamp tone={expected ? tone : outcomeTone(charter?.latest_outcome ?? "")}>{expected ? "Fixture" : charter?.latest_outcome ? "On chain" : "Pending"}</Stamp>
            </div>
            {assessmentBasis ? <div className={`basis-note${assessmentBasis === "EVIDENCE_TAMPERED" ? " basis-note--tampered" : ""}`}>
              <span>Assessment basis</span><strong>{assessmentBasis}</strong>
              <p>{assessmentBasis === "EVIDENCE_TAMPERED" ? expected ? "This fixture models an HTTP 200 content-hash mismatch that deterministically maps to BREACHED, outside LLM judgment. This basis is separate from validator judgment." : "The contract detected an HTTP 200 content-hash mismatch and selected the breach outcome deterministically. This basis is separate from validator judgment." : "Validators compared the normalized judgment. Clause citation differences do not change the outcome and responsibility-role settlement key."}</p>
            </div> : null}
            <p className="consensus__copy">{outcomeCopy(outcomeState)} {expected ? "This fixture predicts a reviewer scenario; it is not a validator transaction." : "Summaries are derived from normalized outcome and contract state, not generated narration."}</p>
            <dl className="fact-list">
              <div className="fact-row"><dt>Assessment basis</dt><dd>{assessmentBasis ?? "Not recorded"}</dd></div>
              <div className="fact-row"><dt>Lifecycle</dt><dd>{transactionFacts?.status ?? selectedProofTx?.statusName ?? (expected ? "No transaction · fixture only" : "No adjudication transaction recorded")}</dd></div>
              <div className="fact-row"><dt>GenVM execution</dt><dd>{transactionFacts?.execution ?? selectedProofTx?.executionResultName ?? (expected ? "Not executed" : "Awaiting adjudication")}</dd></div>
              <div className="fact-row"><dt>Validators</dt><dd>{transactionFacts?.validators ?? selectedProofTx?.validators ?? (expected ? "Not applicable" : "Unavailable")}</dd></div>
              <div className="fact-row"><dt>Validator votes</dt><dd>{transactionFacts?.votes ? Object.entries(transactionFacts.votes).map(([id, vote]) => `${shortHash(id, 4)} ${vote}`).join(" · ") : selectedProofTx?.votes ? Object.entries(selectedProofTx.votes).map(([id, vote]) => `${shortHash(id, 4)} ${vote}`).join(" · ") : "Unavailable"}</dd></div>
              {transactionFacts?.errorText ? <div className="fact-row"><dt>Execution detail</dt><dd>{transactionFacts.errorText}</dd></div> : null}
              <div className="fact-row"><dt>Transaction</dt><dd className="mono">{transactionFacts?.hash ? <StudioNextLink href={explorerTransaction(transactionFacts.hash)}>{shortHash(transactionFacts.hash, 9)}</StudioNextLink> : selectedProofTx?.hash ? <StudioNextLink href={explorerTransaction(selectedProofTx.hash)}>{shortHash(selectedProofTx.hash, 9)}</StudioNextLink> : expected ? "No proof transaction" : "Not recorded"}</dd></div>
              {transactionFactsError ? <div className="fact-row"><dt>Explorer read</dt><dd>{transactionFactsError} · saved proof metadata remains visible</dd></div> : null}
              {!expected && selectedProofTx && !transactionFacts ? <div className="fact-row"><dt>Execution confirmation</dt><dd>{selectedProofTx.successful === true ? "Proof file records successful execution; refresh the RPC read to confirm current details." : "Proof transaction has not been verified as successful."}</dd></div> : null}
            </dl>
            {transactionFacts?.hash ? <p className="refresh-label">Current transaction facts fetched from Studio Next. FINALIZED by itself is not shown as execution success.</p> : null}
          </aside>
        </section>

        <section className="evidence-rail" aria-labelledby="rail-title">
          <div className="rail-title"><h2 id="rail-title">From evidence to settlement</h2><p>Five distinct things happen; none stands in for the next.</p></div>
          <div className="rail">
            <div className="rail-step"><span className="rail-step__number">SOURCE</span><h3>Submitted facts</h3><p>URLs and SHA-256 hashes bind the charter and each handoff to the content validators retrieve.</p></div>
            <div className="rail-step"><span className="rail-step__number">READING</span><h3>Validator interpretation</h3><p>Leader and validators refetch the same materials and normalize clause and responsibility fields.</p></div>
            <div className="rail-step"><span className="rail-step__number">VOTE</span><h3>Consensus / finality</h3><p>Validator agreement and the transaction lifecycle are reported from the chain record when available.</p></div>
            <div className="rail-step"><span className="rail-step__number">RUN</span><h3>GenVM execution</h3><p>Execution success is checked independently. A finalized transaction can still contain a failed execution.</p></div>
            <div className="rail-step"><span className="rail-step__number">MATH</span><h3>Contract settlement</h3><p>Frozen integer basis points govern rewards, refunds, bond returns, slashes, and retry state.</p></div>
          </div>
        </section>

        <section className="receipt" aria-labelledby="receipt-title">
          <div className="receipt__head"><h2 id="receipt-title">The frozen table does the math.</h2><p>Reward splits and slash rates are inputs sealed before handoffs. They are never model-selected amounts.</p></div>
          {liveRecord || expected ? <MoneyTable
            agents={agents}
            outcome={outcomeState}
            accounting={charter?.accounting}
            live={Boolean(liveRecord)}
            escrow={charter?.escrow_units ?? fixture?.escrow_units ?? 0}
            fixture={fixture}
          /> : <p className="status-message">Live settlement amounts are unavailable until the selected charter is read from Studio Next.</p>}
          {liveRecord && liveRecord.receipt && "receipt_hash" in liveRecord.receipt ? <p className="receipt__hash"><strong>Receipt hash · {liveRecord.receipt.receipt_hash}</strong>Attempt {liveRecord.receipt.attempt_number} · {liveRecord.receipt.outcome} · finalized {humanTime(liveRecord.receipt.finalized_at)}</p> : null}
        </section>

        <section className="methodology" aria-labelledby="methodology-title">
          <div><h2 id="methodology-title">Why GenLayer belongs here</h2><p>Whether one agent broke a frozen natural-language clause is an interpretation task. The leader and validators independently fetch evidence and reassess the charter; the outcome and agent responsibility roles must match while clause citations may differ. Ordinary Python contract code then applies the exact accounting table. Without GenLayer’s independent comparative judgment, Faultline would record a handoff but could not resolve this evidence-based outcome.</p></div>
          <div className="methodology__aside"><h2>Small print, plainly</h2><p>Evidence pages are synthetic reviewer fixtures. DEMO balances are simulated accounting, not custody or real funds. Self-hosted evidence is not independent third-party verification. Faultline is an authorization prototype, not production escrow, a universal agent reputation system, or financial advice.</p></div>
        </section>

        <section className="controls" aria-labelledby="controls-title">
          <div className="controls__head"><h2 id="controls-title">Reviewer controls</h2><p>Reading stays wallet-free. A wallet is needed only when you choose a contract action.</p></div>
          <div className="controls__toolbar">
            {wallet.address ? <span className="wallet-address mono">Connected · {wallet.address}</span> : <span className="wallet-address">No wallet connected</span>}
            {!wallet.address ? <button className="button button--quiet button--small" type="button" onClick={() => void wallet.connect()} disabled={wallet.connecting}>{wallet.connecting ? "Connecting…" : "Connect wallet"}</button> : null}
            {wallet.address && wallet.chainId !== CHAIN_ID ? <button className="button button--quiet button--small" type="button" onClick={() => void wallet.switchNetwork()}>Add / switch to Studio Next</button> : null}
            {wallet.address ? <button className="button button--quiet button--small" type="button" onClick={() => void handleTestFunds()}>Request test GEN</button> : null}
            <button className="button button--quiet button--small" type="button" onClick={() => void refreshFromButton()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh live state"}</button>
            {canPrepareWrites ? <button className="button button--small" type="button" onClick={() => { setShowCreateForm((value) => !value); setShowHandoffForm(false); }}>{showCreateForm ? "Close charter form" : "Create a charter"}</button> : null}
          </div>
          {wallet.error ? <div className="status-message status-message--error" role="alert"><p><strong>Wallet action could not complete.</strong> {wallet.error}</p></div> : null}
          {testGenMessage ? <div className="status-message" role="status"><p>{testGenMessage} Test GEN is only for Studio Next and has no production value.</p></div> : null}
          {!CONTRACT_ADDRESS ? <p className="controls__foot">No contract address is configured. Wallet actions are disabled; synthetic fixture previews remain available for review.</p> : null}
          {CONTRACT_ADDRESS && !walletOnNetwork && wallet.address ? <p className="controls__foot">Switch the connected wallet to Studio Next (chain {CHAIN_ID}) before signing. Reads stay tied to the configured Studio Next RPC.</p> : null}
          {!wallet.available && !wallet.address ? <p className="controls__foot">No injected wallet was detected in this browser. You can still inspect the docket and source fixtures.</p> : null}

          {showCreateForm ? <form className="inline-form" onSubmit={(event) => void handleCreate(event)}>
            <h3>Draft a charter</h3>
            <p>Three fixed agent slots and a frozen DEMO settlement table are created together. Use public HTTPS evidence you control; validators fetch it later.</p>
            <div className="form-grid">
              <div className="field"><label htmlFor="draft-title">Charter title</label><input id="draft-title" required minLength={2} maxLength={96} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></div>
              <div className="field"><label htmlFor="draft-purpose">Short purpose</label><input id="draft-purpose" required minLength={12} maxLength={320} value={draftPurpose} onChange={(event) => setDraftPurpose(event.target.value)} /></div>
              <div className="field field--wide"><label htmlFor="draft-document-url">Charter document URL · HTTPS</label><input id="draft-document-url" type="url" required value={draftDocumentUrl} onChange={(event) => setDraftDocumentUrl(event.target.value)} placeholder="https://your-domain.example/charter.html" /></div>
              <div className="field"><label htmlFor="draft-document-hash">Charter document SHA-256</label><input id="draft-document-hash" required pattern="[0-9a-fA-F]{64}" value={draftDocumentHash} onChange={(event) => setDraftDocumentHash(event.target.value)} placeholder="64 hexadecimal characters" /></div>
              <div className="field"><label htmlFor="draft-evidence-base">Allowlisted evidence base URL</label><input id="draft-evidence-base" type="url" required value={draftEvidenceBase} onChange={(event) => setDraftEvidenceBase(event.target.value)} placeholder="https://your-domain.example/evidence" /></div>
              {draftClauseTexts.map((value, slot) => <div className="field field--wide" key={`clause-${slot}`}><label htmlFor={`draft-clause-${slot}`}>Clause C{slot + 1} · assigned to {SLOT_LABELS[SLOT_ORDER[slot]]}</label><textarea id={`draft-clause-${slot}`} required minLength={8} maxLength={260} value={value} onChange={(event) => setDraftClauseTexts((current) => current.map((text, position) => position === slot ? event.target.value : text))} /></div>)}
              {draftWallets.map((value, slot) => <div className="field" key={`wallet-${slot}`}><label htmlFor={`draft-wallet-${slot}`}>{SLOT_LABELS[SLOT_ORDER[slot]]} wallet</label><input id={`draft-wallet-${slot}`} required pattern="0x[0-9a-fA-F]{40}" value={value} onChange={(event) => setDraftWallets((current) => current.map((address, position) => position === slot ? event.target.value : address))} placeholder="0x…" /></div>)}
              <div className="field"><label htmlFor="draft-retries">Maximum retries</label><select id="draft-retries" value={draftRetries} onChange={(event) => setDraftRetries(Number(event.target.value))}><option value={0}>0 · no retry</option><option value={1}>1 retry</option><option value={2}>2 retries</option><option value={3}>3 retries</option></select></div>
            </div>
            <div className="locked-table" aria-label="Frozen settlement defaults">
              <div><span>Escrow</span><strong>100,000 DEMO</strong></div><div><span>Reward split</span><strong>50 / 30 / 20%</strong></div><div><span>Agent bonds</span><strong>1,000 DEMO each</strong></div><div><span>Slash rates</span><strong>50 / 25 / 0%</strong></div>
            </div>
            <p>Forfeited bonds go to the requester. The charter expires in seven days. Changing these defaults requires a new settlement version in code.</p>
            <div className="form-actions"><button className="button" type="submit" disabled={!canPrepareWrites || panel.status === "preparing" || panel.status === "pending"}>Prepare charter draft</button><button className="button button--quiet" type="button" onClick={() => setShowCreateForm(false)}>Close</button></div>
          </form> : null}

          {liveRecord && !expected ? <div className="form-actions">
            {canSeal ? <button className="button button--small" type="button" disabled={!canPrepareWrites} onClick={() => void prepareAction("seal_charter", [charter?.charter_id], charter?.charter_id)}>Seal frozen charter</button> : null}
            {canAdjudicate ? <button className="button button--small" type="button" disabled={!canPrepareWrites} onClick={() => void prepareAction("adjudicate", [charter?.charter_id, charter?.current_attempt], charter?.charter_id)}>Ask GenLayer to adjudicate</button> : null}
            {canCancel ? <button className="button button--quiet button--small" type="button" disabled={!canPrepareWrites} onClick={() => void prepareAction("cancel_charter", [charter?.charter_id], charter?.charter_id)}>Cancel unsealed draft</button> : null}
            {canExpire ? <button className="button button--quiet button--small" type="button" disabled={!canPrepareWrites} onClick={() => void prepareAction("expire_charter", [charter?.charter_id], charter?.charter_id)}>Record expired charter</button> : null}
            {acceptsHandoffs && isNextAgent ? <button className="button button--small" type="button" disabled={!canPrepareWrites} onClick={() => setShowHandoffForm((value) => !value)}>{showHandoffForm ? "Close handoff form" : `Submit ${SLOT_LABELS[nextAgent?.slot ?? ""]} handoff`}</button> : null}
            {acceptsHandoffs && !isNextAgent ? <p className="controls__foot">Next slot: {SLOT_LABELS[nextAgent?.slot ?? ""]}. Connect the assigned agent wallet to submit it.</p> : null}
          </div> : null}

          {showHandoffForm && liveRecord && nextAgent ? <form className="inline-form" onSubmit={(event) => {
            event.preventDefault();
            void prepareAction("submit_handoff", [charter?.charter_id, charter?.current_attempt, nextAgent.agent_id, handoffEvidenceUrl.trim(), handoffEvidenceHash.trim(), handoffArtifactUrl.trim(), handoffArtifactHash.trim(), handoffPreviousHash.trim()], charter?.charter_id);
          }}>
            <h3>{SLOT_LABELS[nextAgent.slot]} handoff · attempt {currentAttempt}</h3>
            <p>The contract accepts only the next assigned wallet. It freezes these URLs and hashes into the attempt, then checks the preceding output hash.</p>
            <div className="form-grid">
              <div className="field"><label htmlFor="handoff-evidence-url">Evidence URL</label><input id="handoff-evidence-url" type="url" required value={handoffEvidenceUrl} onChange={(event) => setHandoffEvidenceUrl(event.target.value)} /></div>
              <div className="field"><label htmlFor="handoff-evidence-hash">Evidence SHA-256</label><input id="handoff-evidence-hash" required pattern="[0-9a-fA-F]{64}" value={handoffEvidenceHash} onChange={(event) => setHandoffEvidenceHash(event.target.value)} /></div>
              <div className="field"><label htmlFor="handoff-artifact-url">Artifact URL</label><input id="handoff-artifact-url" type="url" required value={handoffArtifactUrl} onChange={(event) => setHandoffArtifactUrl(event.target.value)} /></div>
              <div className="field"><label htmlFor="handoff-artifact-hash">Artifact SHA-256</label><input id="handoff-artifact-hash" required pattern="[0-9a-fA-F]{64}" value={handoffArtifactHash} onChange={(event) => setHandoffArtifactHash(event.target.value)} /></div>
              {nextHandoffIndex > 0 ? <div className="field field--wide"><label htmlFor="handoff-previous-hash">Preceding output SHA-256</label><input id="handoff-previous-hash" required pattern="[0-9a-fA-F]{64}" value={handoffPreviousHash} onChange={(event) => setHandoffPreviousHash(event.target.value)} /></div> : null}
            </div>
            <div className="form-actions"><button className="button" type="submit" disabled={!canPrepareWrites}>Prepare handoff</button></div>
          </form> : null}

          {wallet.address && liveRecord && !isRequester && !isNextAgent ? <p className="controls__foot">Connected wallet is not the requester or the agent assigned to the next slot. Inspection remains open; state-changing controls stay locked.</p> : null}

          {preparedAction ? <div className="transaction-box" role="region" aria-label="Transaction fee review">
            <p className="transaction-box__title">Review before the wallet opens</p>
            <p>Action: <span className="mono">{preparedAction.method}</span> · Quote: {formatGen(preparedAction.prepared.quote.total)} · Source: {preparedAction.prepared.quote.source} · Fee policy: {preparedAction.prepared.quote.verification.status}</p>
            <p className="transaction-box__fee">The quote is a refundable protocol fee estimate, not a DEMO settlement amount. Confirm only if this action and fee look right.</p>
            <div className="form-actions"><button className="button" type="button" onClick={() => void confirmAction()}>Sign and submit with wallet</button><button className="button button--quiet" type="button" onClick={() => { setPreparedAction(null); setPanel({ status: "idle" }); }}>Cancel</button></div>
          </div> : null}

          {panel.status !== "idle" ? <div className={`transaction-box${panel.status === "error" ? " transaction-box__error" : ""}`} role={panel.status === "error" ? "alert" : "status"}>
            <p className="transaction-box__title">{panel.status === "preparing" ? "Preparing live fee quote…" : panel.status === "ready" ? "Quote ready. Review before signing." : panel.status === "pending" ? `Transaction ${panel.progress?.phase ?? "submitted"}` : panel.status === "success" ? "Finalized · execution succeeded" : "Transaction needs attention"}</p>
            {panel.status === "pending" && panel.progress?.genlayerTxId ? <p className="transaction-box__hash mono">{panel.progress.genlayerTxId}</p> : null}
            {panel.status === "pending" ? <p>Lifecycle: {panel.progress?.statusName ?? panel.progress?.phase ?? "pending"} · GenVM execution: {panel.progress?.executionResultName ?? "not reported yet"}</p> : null}
            {panel.status === "success" ? <p>{actionMessage} · <StudioNextLink href={panel.progress?.genlayerTxId ? explorerTransaction(panel.progress.genlayerTxId) : EXPLORER_URL}>Inspect transaction ↗</StudioNextLink></p> : null}
            {panel.status === "error" ? <p><strong>State change not confirmed.</strong> {panel.error ?? "The transaction did not reach verified success."} Refresh the contract before retrying.</p> : null}
          </div> : null}

          {actionMessage && panel.status === "success" ? <div className="status-message status-message--success" role="status"><span className="status-dot status-dot--ok" aria-hidden="true" /><p>{actionMessage}</p></div> : null}
          <p className="controls__foot">Never treat a wallet prompt, submitted hash, or FINALIZED status alone as a successful state change. Faultline waits for finalized lifecycle, checks GenVM execution, then reads the contract again.</p>
        </section>

        <footer className="footer">
          <p>FAULTLINE · Studio Next only · chain 61997 · synthetic evidence · DEMO accounting. No production escrow, no real customer data, no percentage blame.</p>
          <p>Fixtures: {fixtureItems.length} · live charters: {index?.total ?? (CONTRACT_ADDRESS ? "unavailable" : "not deployed")}</p>
        </footer>
       </div>
      </main>
    </div>
  );
}

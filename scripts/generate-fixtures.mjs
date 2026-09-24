import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public', 'evidence');
const sha256 = (name) => createHash('sha256').update(readFileSync(resolve(output, name))).digest('hex');
const sha256Text = (value) => createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
const cases = [
  {
    key: 'accepted',
    charterId: 'FLT-ACCEPT-001',
    title: 'Source-led market brief',
    purpose: 'Deliver a concise public market brief that follows the supplied source cards, distinguishes fact from uncertainty, and preserves the approved analysis.',
    clauses: [
      ['C1', 'Research must accurately summarize and cite both dated source cards supplied with this charter.'],
      ['C2', 'Analysis must separate supported observations from uncertainty and carry every material qualification forward.'],
      ['C3', 'Delivery must include Executive summary, Evidence, Analysis, Limitations, and References without changing approved facts.'],
    ],
    agents: {
      research: {
        evidence: 'Two source cards dated 2026-09-20 are included in this synthetic fixture. Card A reports a sample of 1,240 records with a 3.2% weekly change. Card B reports that coverage is incomplete in two regions and explicitly says the sample is not a population estimate.',
        artifact: 'Research handoff: Card A — 1,240 records; weekly change 3.2%. Card B — coverage is incomplete in two regions; the sample is not a population estimate. Both source-card references are included. No population-wide inference is made.',
      },
      analysis: {
        evidence: 'Cross-check of the research handoff against source cards A and B: both recorded values match. Card B limits interpretation to the observed sample because regional coverage is incomplete.',
        artifact: 'Analysis handoff: The observed sample contains 1,240 records and shows a 3.2% weekly change. The result is descriptive of this sample only; incomplete regional coverage prevents a population-wide conclusion.',
      },
      delivery: {
        evidence: 'The approved analysis digest matches the analysis handoff. The delivery checklist requires five sections and verifies that the sample limitation remains visible.',
        artifact: '<h1>Weekly market brief</h1><h2>Executive summary</h2><p>The observed sample contains 1,240 records and shows a 3.2% weekly change.</p><h2>Evidence</h2><p>Source cards A and B, dated 2026-09-20, support these observations.</p><h2>Analysis</h2><p>This result describes the sample only.</p><h2>Limitations</h2><p>Regional coverage is incomplete; no population-wide conclusion is supported.</p><h2>References</h2><p>Source cards A and B are cited.</p>',
      },
    },
  },
  {
    key: 'remediation',
    charterId: 'FLT-REMED-001',
    title: 'Research memo with repair path',
    purpose: 'Prepare a concise research memo from the supplied source cards and keep the final artifact complete enough for a reviewer to reproduce the key observations.',
    clauses: [
      ['C1', 'Research must accurately summarize both source cards and preserve their stated limitations.'],
      ['C2', 'Analysis must distinguish observed records from any broader inference.'],
      ['C3', 'Delivery must include a separate Open questions section naming unresolved evidence gaps.'],
    ],
    agents: {
      research: {
        evidence: 'Two source cards dated 2026-09-18 are in this synthetic fixture. Card R-4 records 620 reviewed entries. Card R-5 says 18 entries need follow-up and no reason is supplied for those entries.',
        artifact: 'Research handoff: 620 entries were reviewed. Eighteen entries need follow-up; source card R-5 does not provide a reason. Source cards R-4 and R-5 are cited.',
      },
      analysis: {
        evidence: 'Review of the research handoff confirms the two counts and preserves the uncertainty: the reason for the 18 follow-up entries is not stated in either source card.',
        artifact: 'Analysis handoff: The source cards describe 620 reviewed entries, including 18 requiring follow-up. The reason for follow-up is unknown; the records do not support a broader conclusion.',
      },
      delivery: {
        evidence: 'The final quality checklist requires Executive summary, Evidence, Analysis, Open questions, and References. The approved analysis is preserved; the final artifact has no separate Open questions heading.',
        artifact: '<h1>Review memo</h1><h2>Executive summary</h2><p>620 entries were reviewed, including 18 that need follow-up.</p><h2>Evidence</h2><p>Source cards R-4 and R-5, dated 2026-09-18.</p><h2>Analysis</h2><p>The reason for follow-up is unknown; no broader conclusion is supported.</p><h2>References</h2><p>Source cards R-4 and R-5.</p>',
      },
    },
  },
  {
    key: 'breached',
    charterId: 'FLT-BREACH-001',
    title: 'Unsupported source claim trace',
    purpose: 'Verify source claims before recommending them, preserve source-validation findings in analysis, and deliver only the approved analysis.',
    clauses: [
      ['C1', 'Research must not state a numeric claim unless a submitted source directly supports that exact claim.'],
      ['C2', 'Analysis must run the source-validation check and remove or flag any claim that lacks direct support.'],
      ['C3', 'Delivery must format the approved analysis without adding, removing, or changing factual claims.'],
    ],
    agents: {
      research: {
        evidence: 'The available source pack contains an index and two short records. Neither record mentions a 42% figure, a regional incidence estimate, or a supporting calculation. The pack explicitly marks that estimate as not supplied.',
        artifact: 'Research handoff: The regional incident rate is 42%. The estimate is presented as a source-backed numeric finding, but this handoff contains no source citation or calculation supporting 42%.',
      },
      analysis: {
        evidence: 'Required source-validation checklist: find the original source for every numeric claim. Result for “regional incident rate is 42%”: no matching statement or calculation appears in either source record. The claim should be removed or marked unsupported.',
        artifact: 'Analysis handoff: The regional incident rate is 42%, according to the research summary. The source-validation pass found no matching support, but this figure remains in the recommendation and is not marked unsupported.',
      },
      delivery: {
        evidence: 'The approved analysis digest contains the unsupported 42% claim. The delivery instruction is format-only, and a text comparison shows that delivery did not add, remove, or alter that factual claim.',
        artifact: '<h1>Regional operations note</h1><h2>Finding</h2><p>The regional incident rate is 42%, according to the research summary.</p><h2>Recommendation</h2><p>Use the figure in planning while the source-validation gap is resolved.</p>',
      },
    },
  },
  {
    key: 'tampered',
    charterId: 'FLT-TAMPER-001',
    title: 'Evidence changed after submission',
    purpose: 'Trace how a submitted evidence page can be edited after an agent commits its hash, and settle that integrity failure without a model verdict.',
    expectedBasis: 'EVIDENCE_TAMPERED',
    clauses: [
      ['C1', 'Research must preserve the submitted evidence bytes after recording their SHA-256 digest.'],
      ['C2', 'Analysis must compare every submitted handoff hash with the bytes fetched from its evidence URL.'],
      ['C3', 'Delivery must retain the source and hash references used by the frozen handoff.'],
    ],
    agents: {
      research: {
        evidence: 'Submitted research record: the review window contains 38 entries. Digest recorded at handoff time: the original evidence page is preserved without later edits.',
        evidence_after_submission: 'Edited research record: the review window contains 83 entries. This hosted page was changed after the agent submitted the original SHA-256 digest.',
        artifact: 'Research handoff: 38 entries were reviewed. The original evidence digest and source URL were recorded when this handoff was submitted.',
      },
      analysis: {
        evidence: 'Analysis receipt: the Research handoff was received with its source URL and submitted evidence digest. No independent change was made to this page.',
        artifact: 'Analysis handoff: the reported 38 entries are traced to the submitted Research artifact and its evidence digest.',
      },
      delivery: {
        evidence: 'Delivery checklist: retain the handoff trace, source URL, and original digest in the final record.',
        artifact: '<h1>Evidence integrity note</h1><h2>Trace</h2><p>The Research handoff recorded a SHA-256 digest with its source URL.</p><h2>Review</h2><p>The fetched Research evidence no longer matches the submitted digest, so contract code records an integrity breach.</p>',
      },
    },
  },
];

const safe = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const page = ({ caseData, kind, title, body, agent, attempt = 1 }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${safe(title)} · Faultline fixture</title><link rel="stylesheet" href="/evidence/fixture.css"></head>
<body><main class="sheet"><header><a class="wordmark" href="/">FAULTLINE / TRACE RECORD</a><span class="record-type">${safe(kind)}</span></header>
<p class="stamp">Synthetic reviewer fixture</p><h1>${safe(title)}</h1>
<dl class="context"><div><dt>Charter</dt><dd>${safe(caseData.charterId)}</dd></div><div><dt>Attempt</dt><dd>${attempt}</dd></div>${agent ? `<div><dt>Agent</dt><dd>${safe(agent)}</dd></div>` : ''}</dl>
<p class="notice">Not evidence of a real customer or production incident. This page is a synthetic reviewer fixture hosted by the application author.</p>
<article>${body}</article><footer>Fixture material · ${safe(caseData.key)} flow · for review only</footer></main></body></html>`;

const manifest = { accounting_unit: 'DEMO', cases: [] };
mkdirSync(output, { recursive: true });
const css = `:root{color-scheme:light;--paper:#f5f1e8;--ink:#232a2a;--muted:#56605e;--rule:#c8c5bb;--blue:#dfe9e6;--red:#f0ded7}*{box-sizing:border-box}body{margin:0;background:#e6e1d7;color:var(--ink);font:16px/1.65 Georgia,serif}.sheet{width:min(900px,calc(100% - 32px));min-height:100vh;margin:24px auto;padding:clamp(24px,6vw,72px);background:var(--paper);border:1px solid var(--rule)}header,.context div{display:flex;justify-content:space-between;gap:12px}.wordmark,.record-type,.stamp,dt,footer{font:600 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.wordmark{color:var(--ink);text-decoration:none}.record-type{color:var(--muted)}.stamp{display:inline-block;margin:58px 0 8px;padding:6px 8px;background:var(--blue);letter-spacing:.08em}h1{max-width:18ch;margin:0 0 22px;font-size:clamp(2.1rem,6vw,4rem);line-height:1.04;letter-spacing:-.035em}.context{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px 24px;padding:18px 0;border-block:1px solid var(--rule)}.context div{display:block}dt{color:var(--muted)}dd{margin:4px 0 0;font-family:Arial,sans-serif;font-size:14px}.notice{max-width:68ch;margin:18px 0 44px;padding:12px 14px;background:#efe8dc;border:1px solid var(--rule);font:13px/1.55 Arial,sans-serif}.body,article{max-width:70ch}article h2{margin:30px 0 8px;font-size:1.4rem;line-height:1.2}article p{margin:8px 0 18px}article blockquote{margin:24px 0;padding:0 0 0 18px;border-left:1px solid #647f79;color:#384a47}footer{margin-top:64px;padding-top:14px;border-top:1px solid var(--rule);color:var(--muted)}@media(max-width:520px){.sheet{width:100%;margin:0;border:0;padding:24px 18px}.stamp{margin-top:38px}header{align-items:flex-start;flex-direction:column}}`;
writeFileSync(resolve(output, 'fixture.css'), css, 'utf8');

for (const item of cases) {
  const charterName = `charter-${item.key}.html`;
  const clauses = item.clauses.map(([id, text]) => `<h2>${safe(id)}</h2><p>${safe(text)}</p>`).join('');
  const charterBody = `<p>${safe(item.purpose)}</p><h2>Frozen clauses</h2>${clauses}<h2>Settlement table</h2><p>Escrow: 100,000 DEMO units. Rewards: Research 50%, Analysis 30%, Delivery 20%. PRIMARY bond slash: 50%; CONTRIBUTING slash: 25%; CLEAR slash: 0%. Forfeited DEMO bond units are credited to the requester. The charter opens ${item.key === 'remediation' ? 'one' : 'zero'} retry.</p>`;
  writeFileSync(resolve(output, charterName), page({ caseData: item, kind: 'Frozen charter document', title: item.title, body: charterBody }), 'utf8');
  const expectedOutcome = item.key === 'accepted' ? 'ACCEPTED' : item.key === 'remediation' ? 'REMEDIATION_REQUIRED' : 'BREACHED';
  const entry = { key: item.key, charter_id: item.charterId, title: item.title, purpose: item.purpose, charter_document: charterName, charter_hash: sha256(charterName), expected_outcome: expectedOutcome, expected_basis: item.expectedBasis ?? 'VALIDATOR_JUDGMENT', clauses: item.clauses.map(([id, text]) => ({ id, text })), max_retries: item.key === 'remediation' ? 1 : 0, escrow_units: 100000, primary_slash_bps: 5000, contributing_slash_bps: 2500, agents: [] };
  for (const [index, [slot, agentId, role, clauseId]] of [
    ['research', 'AGENT-RESEARCH', 'Research agent', 'C1'],
    ['analysis', 'AGENT-ANALYSIS', 'Analysis agent', 'C2'],
    ['delivery', 'AGENT-DELIVERY', 'Delivery agent', 'C3'],
  ].entries()) {
    const data = item.agents[slot];
    const evidenceName = `${item.key}-${slot}-evidence.html`;
    const artifactName = `${item.key}-${slot}-artifact.html`;
    const submittedEvidencePage = page({ caseData: item, kind: 'Submitted evidence', title: `${role} · evidence notes`, body: `<h2>Evidence record</h2><p>${safe(data.evidence)}</p>`, agent: agentId });
    const publishedEvidencePage = page({ caseData: item, kind: 'Submitted evidence', title: `${role} · evidence notes`, body: `<h2>Evidence record</h2><p>${safe(data.evidence_after_submission ?? data.evidence)}</p>`, agent: agentId });
    writeFileSync(resolve(output, evidenceName), publishedEvidencePage, 'utf8');
    const artifactBody = data.artifact.startsWith('<h1>') ? data.artifact : `<p>${safe(data.artifact)}</p>`;
    writeFileSync(resolve(output, artifactName), page({ caseData: item, kind: 'Handoff artifact', title: `${role} · output`, body: artifactBody, agent: agentId }), 'utf8');
    const fixtureAgent = { agent_id: agentId, slot: slot.toUpperCase(), role, bond_units: 1000, reward_bps: [5000, 3000, 2000][index], responsibility_clause_ids: [clauseId], evidence: evidenceName, evidence_hash: sha256Text(submittedEvidencePage), artifact: artifactName, artifact_hash: sha256(artifactName) };
    if (data.evidence_after_submission) fixtureAgent.published_evidence_hash = sha256(evidenceName);
    entry.agents.push(fixtureAgent);
  }
  manifest.cases.push(entry);
}
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Generated ${manifest.cases.length} synthetic charters and ${manifest.cases.length * 6} handoff/evidence pages in ${output}`);

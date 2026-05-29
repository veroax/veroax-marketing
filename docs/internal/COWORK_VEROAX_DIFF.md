# Cowork skill vs Veroax analyzer, diff and triage

Captured 2026-05-28 in response to the founder's question, "why is the
report wildly off between the Cowork Skill and the app, and even
between Veroax runs of the same property?" This doc records the
diagnostic that drove the next batch of analyzer + UI changes.

## Source of truth

- Cowork SKILL.md v4.4.0, installed locally at
  `~/Library/Application Support/Claude/local-agent-mode-sessions/`
  `skills-plugin/<id>/skills/disclosure-analyzer/SKILL.md`. 1323
  lines, read in full.
- Veroax pipeline:
  - `lib/anthropic/analyze.ts` (2981 lines) — prompts + focused passes
  - `lib/anthropic/schema.ts` (1111 lines) — structured output schema
  - `lib/server/performAnalysis.ts` (862 lines) — orchestration

## What Cowork has that Veroax materially lacks

Ranked by (Impact desc, Cost asc).

### 1. Source-quote enforcement with fuzzy match against source text (HIGH impact, SMALL cost)

Cowork Step 2.5 Check 3 requires that EVERY Critical-severity
finding's verbatim `Quote:` field fuzzy-matches the source document's
extracted text at >=90% Levenshtein OR substring. Any failed match
is surfaced in the Discrepancy Report; the analyst either fixes the
quote or downgrades the severity. This is the single biggest defense
against hallucinated Critical findings.

Veroax: the prompt at `analyze.ts` line 668 INSTRUCTS Claude to
emit a verbatim source_quote, and the schema accepts it, but
`source_quote?` is OPTIONAL (line 29 of `schema.ts`) and there is
NO post-hoc validation. A Critical finding can ship with a quote
that exists nowhere in the source text. This is the most likely
cause of the "report content seems off" complaint.

Fix shape: validate every Critical finding's source_quote against
the concatenated extracted text of the cited document via
Levenshtein + substring match. On failure, demote severity to
"high" and stamp `quote_match_failed: true` so the dashboard can
render a "needs review" badge.

### 2. Run-to-run determinism: temperature: 0 on EVERY Claude call (HIGH impact, SMALL cost)

`analyze.ts` sets `temperature: 0` on lines 936 and 1175 (the two
focused-pass calls). But these other Claude calls do NOT set
temperature, so they run at the default 1.0:

- `lib/anthropic/market-context.ts:222`
- `lib/anthropic/listing-reconciliation.ts:471`
- `lib/anthropic/cost-reference-fetch.ts:211`
- `lib/server/syntheticHeartbeat.ts:68`

`market-context` and `listing-reconciliation` are the biggest
offenders because they BOTH use the web_search tool, which is
already a source of run-to-run variance, AND they run at full
temperature. The combination is exactly the failure mode the
founder described: same package, different report.

Fix shape: set `temperature: 0` on every messages.create call
across the codebase.

### 3. Scope-overreach guardrail (MEDIUM impact, SMALL cost)

Cowork Step 2.5 Check 5 flags findings whose wording exceeds the
source's wording: "common areas" -> "unit interior", "may contain"
-> "contains", "limited inspection" -> "comprehensive inspection".

Veroax: the focused-pass system prompt does not contain any
explicit scope-overreach rule. The 1544 San Antonio walk-through
flagged exactly this: a top-concern was an HOA-only item rendered
as a buyer concern. The analyzer was technically right that the
source mentioned it, but it scoped the finding past what the
source actually said.

Fix shape: append a "Scope guardrail" subsection to FOCUSED_SYSTEM_BASE
that lists the common overreach patterns Cowork names, plus a
mention that findings whose scope exceeds the source quote will be
demoted at verification time.

### 4. Per-finding flagging surface for the agent (MEDIUM impact, MEDIUM cost)

Cowork's customer success loop is built into the workflow: the
PDF cover renders a "Report a problem" mailto, the audit metadata
strip on the final page does too, and confirmed problems feed
back into the analyst prompt per `references/feedback-loop.md`.

Veroax has a bottom-of-page "Report an error" button but nothing
per-finding. The founder explicitly proposed building one so
they can flag specific findings on the 1544 San Antonio report
tonight and we triage tomorrow. This IS the operational equivalent
of Cowork's feedback loop, applied per-finding.

Fix shape: small flag icon on each FindingDetail card, opens a
modal with "what's wrong" categories + free text, writes to a
`finding_flags` table, surfaces on /admin/finding-flags. Founder
+ admin can scan flags in this chat as a feedback signal.

### 5. Run-to-run regression harness (MEDIUM impact, MEDIUM cost)

Independent of the Cowork diff: there's no way today to RUN
the same package N times and observe variance. Without that,
"the analyzer is inconsistent" is a vibe, not a measurable bug.

Fix shape: a script that re-runs an existing report's analysis
N times (the original PDFs are already in storage), captures
each run's findings, and computes a variance score (count of
findings that appear/disappear/change severity across runs).
Admin-only.

## What Cowork has that doesn't apply to Veroax

The agent diff over-indexed on these; flagging for the record so
we don't accidentally import them.

- **License verification gate (Cowork Step 0C).** Cowork verifies
  the SOLICITING agent's license before running. Veroax already
  authenticates users via Supabase and tracks DRE on profiles.
  No gap.
- **Agent QA hard gate (Cowork Step 3).** Cowork pauses for human
  approval before generating the PDF. Veroax is intentionally
  fully autonomous: the agent gets the report by email when it
  finishes. Adding a pause-for-approval step would break the
  product shape. The flagging surface is the post-hoc equivalent.
- **Property type detection (Cowork Step 0A).** Veroax's focused
  passes already handle condos differently because the HOA group
  has its own prompt. Cowork's explicit property_type config is
  more rigorous but probably not the high-leverage change here.
- **OCR fallback on image-based pages.** Veroax now sends NATIVE
  PDFs to Claude for seller_disclosures and inspections (the
  hybrid-mode commit from earlier in this loop), which means
  Claude reads the page images directly. The OCR concern only
  applies to text-mode groups (hoa, hazards), and those groups
  are typically born-digital so the risk is real but small.

## Sources of Veroax run-to-run inconsistency (independent of Cowork)

In rough order of impact:

1. **Temperature 1.0 on 4 of the 6 Claude calls** (fixed in
   commit 1, see above).
2. **Web search non-determinism** in market-context and
   listing-reconciliation. Even at temperature 0, the tool itself
   returns different results across runs because the underlying
   index updates. Cacheable per report_id but not done today.
3. **Verifier sub-batch coupling**. When the verifier's outcome
   is "no_tool_use" or "threw", the first-pass output ships
   unchecked. Already audited via the audit_log instrumentation
   added earlier; the rate is low but non-zero.
4. **PDF text extraction**. pdftotext output can vary slightly
   between binary versions, which would cascade into different
   batch boundaries. Believed stable in practice on Vercel
   because the binary is pinned.
5. **Sub-batching by token budget**. If extraction varies by even
   a few tokens, the document split into batches can change,
   moving findings between batches. Mitigated by hybrid mode for
   the per-page-budget groups.

## Decision: top 4 implementation picks

1. Set `temperature: 0` on every Claude call in lib/ (commit 1).
2. Schema mark source_quote required for Critical + post-hoc
   fuzzy-match validator + demote-to-high-on-mismatch
   (commit 2).
3. Per-finding flag UI + finding_flags table + admin surface
   (commit 3).
4. Regression-rerun harness with variance score, admin surface
   (commit 4).

Scope overreach guardrail (item 3 above) is folded into commit 2
as a prompt addition since it shares the same plumbing as the
quote-match check.

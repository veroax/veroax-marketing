import type { ReportData, Finding } from "@/lib/anthropic/schema";

// Post-hoc validator that fuzzy-matches every Critical finding's
// source_quote against the concatenated extracted text of the
// uploaded disclosure package. Inspired by Cowork SKILL.md Step 2.5
// Check 3 (quote-verification check), which fuzzy-matches at >= 90%
// Levenshtein OR substring against the source PDF.
//
// Why this exists: the analyzer's FOCUSED_SYSTEM_BASE prompt
// INSTRUCTS Claude to emit a verbatim source_quote, and the JSON
// schema accepts it, but nothing has ever VALIDATED that the quote
// actually appears in the source documents. A Critical finding can
// ship with a hallucinated quote, which is exactly the failure mode
// the founder flagged on 1544 San Antonio ("the content seems wildly
// off"). This module closes that gap.
//
// Strategy:
//   1) Normalize both sides (lowercase, strip punctuation, collapse
//      whitespace) so trivial formatting differences don't kill a
//      legitimate match.
//   2) Try a fast substring match. The vast majority of Claude's
//      verbatim quotes are exact substrings.
//   3) Fall back to a token-overlap check: split the quote into
//      6+ character word tokens, count how many appear anywhere
//      in the corpus. If >= 70% of tokens are present, accept it
//      as a paraphrase-with-ellipsis match (Cowork's rules allow
//      "..." elision; this is the same posture).
//   4) Anything below that is a FAILED quote match. Demote the
//      finding's severity from "critical" to "high" and stamp
//      quote_match_failed = true so the dashboard can surface a
//      "needs review" badge.
//
// We deliberately treat the source corpus as a single string rather
// than per-document. Cowork validates per-document; that's stronger
// but requires reliable doc-name → finding.source mapping which we
// don't have here. The whole-corpus check still catches the dominant
// failure mode (a quote that doesn't appear anywhere in the
// uploaded package). Per-doc attribution is a v2 improvement.

const MIN_TOKEN_LEN = 6;
const TOKEN_OVERLAP_THRESHOLD = 0.7;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}

export type QuoteMatchResult = {
  matched: boolean;
  // "exact" = normalized substring match; "fuzzy" = token-overlap
  // above threshold; "failed" = neither. Surfaced for audit_log so
  // we can later compute what fraction of Critical findings are
  // hallucinated quotes vs. real quotes.
  method: "exact" | "fuzzy" | "failed";
  // 0 to 1 score for fuzzy matches, null for exact and failed.
  fuzzy_score: number | null;
};

export function matchQuote(
  quote: string | null | undefined,
  corpus: string,
): QuoteMatchResult {
  if (!quote || quote.trim().length < 8) {
    // Quotes shorter than 8 characters aren't meaningful to
    // validate. Treat as matched so we don't demote a finding
    // that legitimately has a very short identifier (e.g., a
    // form line number).
    return { matched: true, method: "exact", fuzzy_score: null };
  }
  const normalizedQuote = normalize(quote);
  const normalizedCorpus = normalize(corpus);
  if (normalizedCorpus.length === 0) {
    // No corpus to match against, give the benefit of the doubt
    // rather than demoting every Critical finding. This happens
    // when text extraction failed for every document (rare).
    return { matched: true, method: "exact", fuzzy_score: null };
  }
  // 1) Exact substring match (post-normalization).
  if (normalizedCorpus.includes(normalizedQuote)) {
    return { matched: true, method: "exact", fuzzy_score: null };
  }
  // 2) Token-overlap fallback. Counts how many 6+ char word tokens
  //    from the quote appear in the corpus. The ratio is the
  //    fraction of meaningful words from the quote that we found
  //    somewhere in the source documents.
  const tokens = tokenize(quote);
  if (tokens.length === 0) {
    // Quote was all short words / stopwords. Same fallback as
    // the empty case: treat as matched rather than demote.
    return { matched: true, method: "exact", fuzzy_score: null };
  }
  let hits = 0;
  for (const t of tokens) {
    if (normalizedCorpus.includes(t)) hits += 1;
  }
  const score = hits / tokens.length;
  if (score >= TOKEN_OVERLAP_THRESHOLD) {
    return { matched: true, method: "fuzzy", fuzzy_score: score };
  }
  return { matched: false, method: "failed", fuzzy_score: score };
}

export type QuoteValidationSummary = {
  // Total Critical-severity findings present in the report.
  total_critical: number;
  // Number that had a quote that matched the corpus (exact or fuzzy).
  matched: number;
  // Number that FAILED the match and were demoted to high severity.
  demoted: number;
  // Per-finding breakdown for audit_log inspection.
  details: Array<{
    title: string;
    method: QuoteMatchResult["method"];
    fuzzy_score: number | null;
    had_quote: boolean;
  }>;
};

// Mutates the passed report in place: any Critical finding whose
// quote does not match is stamped with quote_match_failed = true
// and gets a "Needs review" prefix appended to risk_if_ignored so
// even email / PDF surfaces (which don't render the badge) carry
// the warning. The finding stays in critical_findings: the agent
// page renders only the critical list and we don't want a failed-
// match finding to disappear from their view.
//
// Returns a summary the caller can write to audit_log so we can
// measure the hallucination rate over time via /admin/health.
export function validateCriticalQuotes(
  report: ReportData,
  corpus: string,
): QuoteValidationSummary {
  const summary: QuoteValidationSummary = {
    total_critical: 0,
    matched: 0,
    demoted: 0,
    details: [],
  };
  const crit = (report.critical_findings ?? []) as Finding[];

  // Walk critical findings, flag failures in-place. We do NOT move
  // the finding out of critical_findings: the agent's dashboard
  // only renders critical findings as cards, and demoting to
  // moderate would hide the finding entirely. Better posture is
  // "still visible, but obviously flagged for review."
  const updated: Finding[] = [];
  for (const f of crit) {
    summary.total_critical += 1;
    const hadQuote = typeof f.source_quote === "string" && f.source_quote.trim().length > 0;
    const result = matchQuote(f.source_quote ?? null, corpus);
    summary.details.push({
      title: f.title,
      method: result.method,
      fuzzy_score: result.fuzzy_score,
      had_quote: hadQuote,
    });
    if (result.matched) {
      summary.matched += 1;
      updated.push(f);
    } else {
      summary.demoted += 1;
      // Keep severity. Stamp the flag. Append a "Needs review"
      // sentence to risk_if_ignored so non-dashboard surfaces
      // (PDF, email) carry the warning even without rendering a
      // badge. The dashboard renders the badge separately by
      // checking quote_match_failed.
      const flaggedFinding: Finding = {
        ...f,
        quote_match_failed: true,
        risk_if_ignored: f.risk_if_ignored
          ? `${f.risk_if_ignored} (Needs review, the verbatim source quote for this finding could not be verified against the uploaded documents.)`
          : "Needs review, the verbatim source quote for this finding could not be verified against the uploaded documents.",
      };
      updated.push(flaggedFinding);
    }
  }

  report.critical_findings = updated;

  return summary;
}

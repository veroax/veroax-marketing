# Multi-state expansion notes

> **Status:** California is the only fully-supported state.
> Domestic US expansion only — no international.
> Last updated 2026-05-22.

This file tracks every place California-specific assumptions are
baked into the codebase, plus the structural changes needed to
support a second state cleanly. Read this before expanding.

## Guiding principles

1. **Per-state config map, not per-state code branches.** A new state
   should be a config entry, not a rewrite. Anywhere the code
   currently hard-codes "California" or a CA-specific form name, it
   should accept a state key and look up the right value.
2. **Disclosure forms differ by state.** TDS, SPQ, AVID, NHD are
   California Association of Realtors (CAR) artifacts. Other states
   have their own — FL has the Seller's Real Property Disclosure
   Statement, TX has the Seller's Disclosure Notice, NY has the
   Property Condition Disclosure Statement. The classifier and the
   "required disclosures" list MUST move into per-state config.
3. **Always-Critical hazards are mostly national.** FPE panels,
   polybutylene plumbing, knob-and-tube wiring, asbestos friable, etc.
   are insurance/lender-blocking issues nationwide. These rules stay
   in the system prompt. State-specific add-ons (e.g., chinese drywall
   in FL post-2006, pyrrhotite foundations in CT, methamphetamine
   contamination disclosure in CO/TN) get appended via state config.
4. **Regional cost data needs national coverage.** The
   `lib/cost-reference/california-markets.ts` file structure becomes a
   per-state file pattern: `lib/cost-reference/{state}-markets.ts`.
   Same shape, different regions.
5. **Statute citations move out of prompt strings.** California Civ.
   Code §1102 (TDS), §1103 (NHD), §1102.6 — these appear in the
   analyzer prompt today. Pull them into per-state config so the
   prompt can render the correct citations.

## California-specific items in the codebase today

### Schema + analyzer (`lib/anthropic/`)

- `analyze.ts` `FOCUSED_SYSTEM_BASE` mentions "California" 4× — needs
  a `{stateName}` template variable.
- `FOCUSED_GROUP_INSTRUCTIONS.seller_disclosures` references CA-only
  form names (TDS, SPQ, AVID) and CA-only TDS quirks (street tree
  compliance, City of San Jose, etc.). Move the per-state forms +
  per-state quirks into the state config.
- `FOCUSED_GROUP_INSTRUCTIONS.hazards` references NHD specifically;
  FL has a different hurricane-disclosure flow, FL has wind
  mitigation forms, CO has wildfire disclosure. Each state's hazards
  group needs its own focus list.
- `STANDARD_CA_DISCLOSURE_TYPES` in `detectMissingDocuments` hard-
  codes TDS / SPQ / AVID / NHD / Preliminary Title Report. Move into
  the state config with the same structure (label + typeKeywords +
  classifiesAs).
- The HOA group instructions reference "CC&Rs" and the boilerplate
  patterns are likely similar nationwide, but rental/pet restriction
  enforcement varies dramatically — FL's "55+ community" rules and
  rental limits, NY co-op boards, HOA-vs-condo-vs-PUD distinctions
  differ. Keep the structure but expect per-state additions.

### Classifier (`lib/pdf/classify.ts`)

- `TYPE_RULES` matches filename patterns like "tds", "spq", "avid",
  "nhd". These tokens are CA-specific. The pattern set needs per-
  state augmentation (e.g., for FL: "wind_mit", "hurricane_disclosure",
  "sprds" for the Seller's Real Property Disclosure Statement).

### Property snapshot (`lib/anthropic/schema.ts`)

- `cost_reference_market` is fine as-is — it's a free-form string.
- `state` field doesn't exist yet on `property_snapshot`. Add it.
  Default to user's billing state or the report creator's chosen
  state. Eventually drive Claude's prompt from this field.

### Cost reference (`lib/cost-reference/california-markets.ts`)

- Self-evidently CA-only. Rename to `markets.ts` with a top-level map
  keyed by state code:
  ```ts
  export const MARKETS_BY_STATE: Record<string, Record<string, Market>> = {
    CA: { bay_area_silicon_valley: {...}, ... },
    FL: { south_florida: {...}, central_florida: {...}, ... },
    ...
  };
  ```
- `selectMarketReference` becomes
  `selectMarketReference(state: string, hint: string | null)`.

### Settings / profile

- `dre_license` field on `profiles` is CA-specific naming. Other
  states use different names:
  - CA: DRE license
  - FL: Florida Real Estate Commission (FREC) license
  - TX: TREC license
  - NY: DOS license
  - Generic: "Real Estate License #"
- Option A (less code change): rename the field UI to generic "Real
  estate license #" and use a separate `license_state` field.
- Option B: per-state field labels driven by state config.
- The PDF cover currently prints "DRE #..." — must accept the
  state-specific label.

### Marketing site copy (`app/page.tsx`, `app/(marketing)/*`)

- Homepage mentions "California disclosure analysis" / "CA agents"
  liberally. Once we go multi-state, the hero changes to "US
  disclosure analysis" or a state picker is offered.
- Privacy / terms reference California Civ. Code in places.
- Footer says "Serving California real estate professionals" — needs
  a generic version.

### Email + report-ready notification

- The new report-ready email uses generic language already. Good.
- The client-facing email draft uses the same shared helpers. Good.

## Suggested state-config shape

```ts
// lib/state-config/index.ts
export type StateConfig = {
  code: "CA" | "FL" | "TX" | "NY" | string;
  name: string; // "California"
  // Display label for the license field on the cover + PDFs.
  licenseLabel: string; // "DRE #" for CA, "FREC #" for FL, ...
  // Standard disclosures expected in a complete package for this state.
  standardDisclosures: Array<{
    label: string; // "TDS", "Wind Mitigation Form 1802"
    typeKeywords: string[]; // ["tds", "transfer disclosure"]
    classifiesAs: DocumentType[]; // which classifier output satisfies
  }>;
  // Per-state quirks to inject into the analyzer's system prompt.
  // Examples: "California requires TDS, NHD, and a Preliminary Title
  // Report. The TDS asks about street trees which condos don't have."
  analyzerNotes: string;
  // State-specific always-Critical hazards beyond the national set.
  // FL: Chinese drywall (2001-2008 builds), wind-resistance documentation,
  // post-1992 hurricane-zone construction standards.
  extraAlwaysCritical: Array<{ id: string; label: string; rule: string }>;
};

export const STATE_CONFIGS: Record<string, StateConfig> = {
  CA: { ... current behavior ... },
  // FL: { ... to be added ... },
};
```

## Migration plan (when ready to add Florida)

1. Add `state` column to `reports` table (`text not null default 'CA'`).
2. Add `state` field to `profiles` (the agent's primary operating state).
3. Move `STANDARD_CA_DISCLOSURE_TYPES`, the analyzer notes about CA
   quirks, the `dre_license` label, and the `california-markets.ts`
   into a per-state config file.
4. Build a `STATE_CONFIGS.FL` entry with FL's required disclosures,
   form names, license label, and cost-reference regions.
5. Update the upload form to capture / infer the property's state.
6. Update the analyzer entry to pull the correct state config and
   inject state-specific instructions into the system prompt.
7. Update the classifier to use the per-state filename rules.
8. Update marketing pages: hero copy, footer, and add a state badge
   on every report ("Florida disclosure analysis" vs "California
   disclosure analysis").

## Order of next states to support

Picked by California-adjacency in volume and inspection-package
similarity:

1. **Florida** — large agent population, distinct hazard regime
   (wind, hurricane, flood), Chinese drywall issues. Different
   disclosure form but similar inspection-report formats.
2. **Texas** — large agent population, dry/expansive-soil issues,
   foundation-movement concerns. Disclosure form is simpler.
3. **Washington** — mold + earthquake retrofit overlap with CA; smaller
   agent population but high inspection rigor.
4. **Colorado** — wildfire disclosure, methamphetamine disclosure,
   expansive-soil issues. Strong agent culture for buyer reps.
5. **Arizona** — adjacent to CA market dynamics, mostly straightforward
   disclosure regime.

National rollout to all 50 states is gated on (a) state-config
infrastructure being clean and (b) finding state-specific reviewers
who can validate the prompt outputs for accuracy.

## Structural patterns from the Cowork disclosure-analyzer skill (review)

A side-by-side comparison with the Cowork disclosure-analyzer skill
surfaced three structural patterns where Veroax is behind. Not
state-specific, but worth tracking here because they all benefit
multi-state expansion:

1. **Agent QA gate before PDF render.** The skill pauses Step 3 to
   present critical/high findings to the agent for explicit sign-off
   BEFORE generating the PDF. The agent must reply "approved" or the
   PDF is blocked. Catches Claude errors (wrong severity, misread
   source) before they're baked in. Veroax goes directly to
   "qa_pending" status — that label was supposed to gate human QA
   but no review step exists. To match the skill we'd need (a) a
   dashboard intermediate state where the agent reviews + edits
   findings, (b) only THEN flip to "Ready" + render PDF.

2. **Per-run fresh regional cost reference via web search.** The
   skill builds the cost-reference library at the START of every
   analysis via live web search, scoped to the property's market.
   Veroax bakes the cost reference into a static
   `lib/cost-reference/california-markets.ts`. Pro of the skill
   pattern: estimates are always current and defensible. Con:
   adds latency + a web-search dependency. Path forward: add an
   optional "web-search-grounded" mode behind a feature flag.

3. **Audit log as compliance instrument, not analytics.** The
   skill's audit log captures license-gate outcomes, retention-until
   dates (7-year floor), tenant isolation, and uses immutable
   backends (S3 Object Lock, Postgres with RLS). Veroax's
   `audit_log` table is for operational tracking — token usage,
   pass progress. For E&O / DRE inquiry survival we need a parallel
   compliance log with the skill's shape.

Already aligned with the skill:
- Multi-pass focused analysis (seller_disclosures / inspections /
  hoa / hazards)
- Code-based synthesis (both projects discovered Claude-driven
  synthesis hung in production and switched to deterministic code)
- HOA scoping ("DROP findings about OTHER units") — the prompt rules
  are nearly identical in both codebases as of this commit
- Always-Critical rules (FPE, polybutylene, KW, asbestos, lead)
- Severity ranking with cost + hazard + lender-blockability rubric
- Property-type filter (street trees not applicable to condos)
- Structured outputs via Claude tool-use

## Items already national-friendly (no change needed)

- Always-Critical hazard rules (FPE panels, polybutylene, asbestos,
  lead paint, knob-and-tube, etc.)
- Cost responsibility field (`owner` / `hoa` / `shared`)
- Property-type-aware findings filter (SFR vs condo)
- Generic obvious-fact filter
- Severity ranking + sort
- PDF layout, header/footer, dual-column strengths/concerns
- Email templates (client-facing and report-ready)
- Outstanding-questions cap + ranking
- Multi-pass hybrid PDF / text analyzer architecture
- Per-call PDF page budget
- Storage layout / archive / delete flows
- Dashboard list, search, sort, archive

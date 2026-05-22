import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// One-page roadmap PDF for the founder. Lists the major buckets of
// work that gate marketing readiness, with checkbox glyphs. Broad
// strokes only — no implementation detail — so the document fits on
// one Letter page even after a couple of additions. The render is
// deliberately spartan (Helvetica only, no images, no flexbox tricks)
// because it's meant to be a working document the founder marks up,
// not a customer-facing artifact.

const C = {
  navy: "#1E2A5E",
  text: "#0F172A",
  subtext: "#64748B",
  accent: "#FBBF24",
  done: "#059669",
  border: "#E2E8F0",
} as const;

const styles = StyleSheet.create({
  page: {
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: C.text,
    lineHeight: 1.4,
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 48,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: C.subtext,
    marginBottom: 14,
  },
  legend: {
    fontSize: 8.5,
    color: C.subtext,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginTop: 10,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  box: {
    width: 11,
    marginRight: 6,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: C.text,
  },
  doneBox: {
    width: 11,
    marginRight: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.done,
  },
  rowText: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  rowTextDone: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 9.5,
    lineHeight: 1.4,
    color: C.subtext,
  },
  footer: {
    marginTop: 14,
    paddingTop: 8,
    fontSize: 8,
    color: C.subtext,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: C.border,
  },
});

type Item = { done: boolean; text: string };
type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "1. Analysis quality — what makes the report worth paying for",
    items: [
      {
        done: true,
        text: "Hybrid PDF mode for seller disclosures + inspections (sees check-boxes, signatures, severity icons)",
      },
      {
        done: true,
        text: "California regional cost-reference data baked into the analyzer prompt",
      },
      {
        done: true,
        text: "Always-Critical rules: FPE panels, polybutylene, knob-and-tube, asbestos, lead paint, etc.",
      },
      {
        done: true,
        text: "HOA-paid vs owner-paid cost split; property-type-aware findings; obvious-fact filter; question cap",
      },
      {
        done: false,
        text: "Live regional cost lookup per run (skill-style web search at analyze time so estimates are current, not static)",
      },
      {
        done: false,
        text: "Test corpus (10+ packages, ground-truth findings) to catch prompt-change quality regressions",
      },
    ],
  },
  {
    title: "2. PDF + UX polish — what the buyer sees",
    items: [
      {
        done: true,
        text: "Cover page, talking-points panel, dual-column strengths/concerns, severity-sorted findings",
      },
      {
        done: true,
        text: "Header/footer on every page; stacked finding details so long text wraps; compact property snapshot",
      },
      {
        done: true,
        text: "Per-file upload date in document inventory; preliminary title detection by filename",
      },
      {
        done: false,
        text: "Print + render quality test on a long report (40+ findings, multiple HOA docs) before broad release",
      },
      {
        done: false,
        text: "Split each report section into its own forced-page-break BodyPage so no section can auto-overflow. Unlocks clean header/footer on every page without position:absolute (which crashes React-PDF on overflow pages — see 2026-05-22 incident)",
      },
      {
        done: false,
        text: "Optional client-branded variant — coffee-stained logo / brokerage colors / agent headshot polish",
      },
    ],
  },
  {
    title: "3. Agent product surface — the dashboard, email, and workflow",
    items: [
      {
        done: true,
        text: "Reports list with sort, search, archive, delete; per-row Archive/Delete actions; admin role",
      },
      {
        done: true,
        text: "File-removal + add-documents flows with forced re-analysis; remove-file confirmation modal",
      },
      {
        done: true,
        text: "Report-ready email overhauled: rating hero, agent summary, top strengths/concerns, big CTA",
      },
      {
        done: true,
        text: "Client-facing email draft mirrors the on-page summary visually + verbatim",
      },
      {
        done: true,
        text: "Admin section: dashboard metrics, users list + detail with promote/demote, all-reports list, audit log viewer, system-health (stuck/failed/slow) at /admin/*",
      },
      {
        done: false,
        text: "Bulk-upload by drag of a single ZIP (already supported) → polish, plus per-file progress + cancel",
      },
      {
        done: false,
        text: "Branded sub-domain / white-label option for large brokerage accounts",
      },
    ],
  },
  {
    title: "4. Billing + plans — how Veroax makes money",
    items: [
      {
        done: false,
        text: "Stripe pricing plan & seat tiers (individual agent / small brokerage / large brokerage)",
      },
      {
        done: false,
        text: "Per-report credit ledger; 30-day free-update window enforced; outside-window credit-gate",
      },
      {
        done: false,
        text: "Billing dashboard (usage by month, upgrade path, invoice history)",
      },
      {
        done: false,
        text: "Free-trial flow with watermarked sample report",
      },
    ],
  },
  {
    title: "5. Multi-state — beyond California",
    items: [
      {
        done: false,
        text: "Per-state config map (required disclosures, license label, analyzer notes, hazard add-ons)",
      },
      {
        done: false,
        text: "Florida: SRPDS form, wind mitigation, hurricane-zone hazards, Chinese drywall rule",
      },
      {
        done: false,
        text: "Texas: TREC disclosure notice, foundation-movement focus, expansive-soil rule",
      },
      {
        done: false,
        text: "Per-state market regions in cost-reference module",
      },
    ],
  },
  {
    title: "6. Reliability + trust — what makes this safe at scale",
    items: [
      {
        done: true,
        text: "Stuck-analysis recovery: detection UI + manual restart endpoint",
      },
      {
        done: true,
        text: "PDF context-window safety: per-call page budget + in-memory re-split for legacy chunks",
      },
      {
        done: false,
        text: "Compliance-grade audit log: 7-year retention, license-gate outcome captured, immutable backend",
      },
      {
        done: false,
        text: "Agent-visible activity timeline (per report) — what ran when, who did what",
      },
      {
        done: false,
        text: "GDPR / CCPA delete-on-request workflow",
      },
      {
        done: false,
        text: "Status page + simple uptime monitoring",
      },
    ],
  },
  {
    title: "7. Marketing readiness — when to flip the switch",
    items: [
      {
        done: false,
        text: "Marketing site: blog, FAQ, demo video, help-video library (currently stubs)",
      },
      {
        done: false,
        text: "Founder-led testimonials from 5+ real agents using the tool on real deals",
      },
      {
        done: false,
        text: "Comparison page: Veroax vs the alternatives (raw disclosure read, $$$ inspector consult, etc.)",
      },
      {
        done: false,
        text: "Pricing page live with public plans; signup flow without manual gating",
      },
      {
        done: false,
        text: "Outbound: 100-agent pilot list, first-touch email + 30-day follow-up cadence",
      },
    ],
  },
  {
    title: "Future considerations — track but not gating marketing",
    items: [
      {
        done: false,
        text: "Agent QA gate before PDF render (Cowork-skill style). Current direct-to-Ready workflow is the right call for now per founder feedback 2026-05-22",
      },
      {
        done: false,
        text: "Compliance-grade audit log fork (7-year retention, license-gate outcomes, immutable backend) for E&O / DRE inquiry survival",
      },
      {
        done: false,
        text: "International — explicitly out of scope; US-only roadmap",
      },
    ],
  },
  {
    title: "Pre-launch cleanup — REMOVE before going broadly live",
    items: [
      {
        done: false,
        text: "Remove DevRerunButton from the report detail page (admin-gated dev convenience). Files: app/dashboard/reports/[id]/_components/DevRerunButton.tsx + app/api/admin/force-rerun/[id]/route.ts + the import + render in page.tsx + the viewerProfile/viewerIsAdmin lookup",
      },
    ],
  },
];

export function RoadmapPDF() {
  return (
    <Document
      title="Veroax — roadmap to marketing-ready"
      author="Veroax"
      subject="Founder roadmap"
    >
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Veroax — roadmap to marketing-ready</Text>
        <Text style={styles.subtitle}>
          Broad-strokes punch list, grouped by phase. Filled boxes are
          already shipped; open boxes remain.
        </Text>
        <Text style={styles.legend}>
          ✓ shipped &nbsp;·&nbsp; ☐ remaining
        </Text>

        {SECTIONS.map((section, si) => (
          <View key={si} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, ii) => (
              <View key={ii} style={styles.row}>
                {item.done ? (
                  <Text style={styles.doneBox}>✓</Text>
                ) : (
                  <Text style={styles.box}>☐</Text>
                )}
                <Text style={item.done ? styles.rowTextDone : styles.rowText}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer}>
          <Text>
            Generated 2026-05-22 · veroax.com · Edit
            lib/pdf-render/RoadmapPDF.tsx and rerun scripts/build-roadmap.mjs
            to regenerate.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

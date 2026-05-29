import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";

// POST /api/reports/[id]/findings/flag
//
// Body: {
//   finding_title: string;
//   finding_severity?: string;       // "critical" / "high" / etc.
//   category:
//     | "inaccurate"
//     | "not_applicable"
//     | "wrong_severity"
//     | "missing_context"
//     | "scope_overreach"
//     | "other";
//   note?: string;                    // optional free text
// }
//
// Inserts a per-finding flag the agent surfaced on the report
// detail page. RLS on public.finding_flags (migration 0031)
// restricts inserts to the report owner; the policy guards us at
// the database layer even if the route-level auth slips. Admins
// triage open flags via /admin/finding-flags.

const ALLOWED_CATEGORIES = [
  "inaccurate",
  "not_applicable",
  "wrong_severity",
  "missing_context",
  "scope_overreach",
  "other",
];

const MAX_NOTE_LENGTH = 4000;
const MAX_TITLE_LENGTH = 500;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    finding_title?: unknown;
    finding_severity?: unknown;
    category?: unknown;
    note?: unknown;
  };

  const title =
    typeof body.finding_title === "string" ? body.finding_title.trim() : "";
  const severity =
    typeof body.finding_severity === "string"
      ? body.finding_severity.trim()
      : null;
  const category =
    typeof body.category === "string" ? body.category.trim() : "";
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : null;

  if (!title || title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      { error: "finding_title is required and must be under 500 characters." },
      { status: 400 },
    );
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json(
      {
        error: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  // Confirm the user owns this report before writing. RLS would
  // catch this too, but a clean 404 is a better UX than a generic
  // RLS rejection.
  const { data: report, error: readErr } = await supabase
    .from("reports")
    .select("id, user_id")
    .eq("id", reportId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { error: `Could not read report: ${readErr.message}` },
      { status: 500 },
    );
  }
  if (!report || (report as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("finding_flags")
    .insert({
      report_id: reportId,
      user_id: user.id,
      finding_title: title.slice(0, MAX_TITLE_LENGTH),
      finding_severity: severity,
      category,
      note,
    })
    .select("id, created_at")
    .single();
  if (insertErr) {
    return NextResponse.json(
      { error: `Could not save flag: ${insertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: (inserted as { id: string }).id,
    created_at: (inserted as { created_at: string }).created_at,
  });
}

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// POST /api/r/[code]/findings/flag
//
// Anonymous public-flag endpoint for the buyer-facing report at
// /r/<code>. No auth required: the share_code in the URL IS the
// auth token (whoever has the link is by definition someone the
// agent intended to give report access to, so we accept their
// feedback). Lands in the same finding_flags table as agent-side
// flags but with is_public = true so admin triage can distinguish
// the two streams.
//
// Body shape mirrors the agent-side route plus an optional name +
// email so the founder can follow up on a useful flag. Both are
// optional; we'd rather collect an anonymous "this is wrong" than
// gate the feedback behind a form.
//
// Rate-limit-ish posture: we don't enforce a hard limit here but
// we DO require a category from the allowlist and cap the note
// length so a spam wave at worst inflates the table without
// breaking the dashboard.

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
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 200;

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  if (!code || code.length < 4) {
    return NextResponse.json({ error: "Invalid share code." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    finding_title?: unknown;
    finding_severity?: unknown;
    category?: unknown;
    note?: unknown;
    submitter_name?: unknown;
    submitter_email?: unknown;
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
    typeof body.note === "string"
      ? body.note.trim().slice(0, MAX_NOTE_LENGTH)
      : null;
  const submitterName =
    typeof body.submitter_name === "string"
      ? body.submitter_name.trim().slice(0, MAX_NAME_LENGTH)
      : null;
  const submitterEmail =
    typeof body.submitter_email === "string"
      ? body.submitter_email.trim().slice(0, MAX_EMAIL_LENGTH)
      : null;

  if (!title || title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      { error: "finding_title is required." },
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

  const admin = createServiceRoleClient();

  // Resolve the share code to a report. Soft-deleted reports
  // refuse so the flag surface isn't usable on hidden reports.
  const { data: report } = await admin
    .from("reports")
    .select("id, deleted_at")
    .eq("share_code", code)
    .maybeSingle();
  if (!report || (report as { deleted_at?: string | null }).deleted_at) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { data: inserted, error: insertErr } = await admin
    .from("finding_flags")
    .insert({
      report_id: (report as { id: string }).id,
      user_id: null,
      is_public: true,
      submitter_name: submitterName || null,
      submitter_email: submitterEmail || null,
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

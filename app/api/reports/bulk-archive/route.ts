// POST /api/reports/bulk-archive
// Body: { reportIds: string[] }
//
// Bulk-archives a list of reports owned by the authenticated user.
// Hard-scoped to the caller's user_id: a crafted ID for someone
// else's report is silently ignored (the WHERE clause matches 0
// rows for it). Cap at MAX_BULK_REPORT_ARCHIVE.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";

const MAX_BULK_REPORT_ARCHIVE = 200;

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    reportIds?: unknown;
  };
  if (!Array.isArray(body.reportIds)) {
    return NextResponse.json(
      { error: "reportIds must be an array." },
      { status: 400 },
    );
  }
  const ids = Array.from(
    new Set(
      body.reportIds.filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ),
    ),
  );
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "No reports specified." },
      { status: 400 },
    );
  }
  if (ids.length > MAX_BULK_REPORT_ARCHIVE) {
    return NextResponse.json(
      {
        error: `Too many reports selected. Maximum ${MAX_BULK_REPORT_ARCHIVE} per request.`,
      },
      { status: 400 },
    );
  }

  // RLS on reports keeps this scoped to the caller automatically.
  // Belt-and-suspenders: add an explicit user_id filter too.
  const { data, error } = await supabase
    .from("reports")
    .update({
      archived: true,
      archived_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("user_id", user.id)
    .eq("archived", false)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: `Bulk archive failed: ${error.message}` },
      { status: 500 },
    );
  }
  const archivedCount = (data ?? []).length;

  // Audit a single 'report.bulk_archived' event rather than per-report
  // rows so the audit log stays readable on heavy bulk operations.
  try {
    await supabase.from("audit_log").insert({
      user_id: user.id,
      event_type: "report.bulk_archived",
      metadata: {
        requested_count: ids.length,
        archived_count: archivedCount,
      },
    });
  } catch (err) {
    console.error("[reports/bulk-archive] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    archived: archivedCount,
    requested: ids.length,
  });
}

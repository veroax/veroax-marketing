import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";

// Manual recovery endpoint. Resets a stuck "analyzing" report so the
// AnalysisRunner can kick off a fresh run. Useful when a Vercel function
// died mid-analysis (timeout, deploy, crash) and the user is staring at
// an indefinite spinner.
//
// Behavior:
//   - "analyzing" → "failed" with a reason marking it as user-initiated.
//     The detail page's retry path then kicks off a new analysis.
//   - "failed" → "failed" with refreshed reason (idempotent).
//   - "qa_pending" / "delivered" → 409, because the report already
//     succeeded and restarting would discard work.

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: report } = await supabase
    .from("reports")
    .select("id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (!["analyzing", "failed"].includes(report.status)) {
    return NextResponse.json(
      {
        error: `Report is ${report.status} — restarting would discard the existing analysis.`,
        status: report.status,
      },
      { status: 409 },
    );
  }

  await supabase
    .from("reports")
    .update({
      status: "failed",
      failure_reason:
        "Restart requested. The previous analysis appears to have stalled; click Retry to start fresh.",
      analysis_started_at: null,
    })
    .eq("id", reportId);

  return NextResponse.json({ ok: true });
}

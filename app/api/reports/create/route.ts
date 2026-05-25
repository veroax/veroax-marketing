import { NextResponse } from "next/server";
import { balanceForUser } from "@/lib/billing/credits";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Creates a new "reports" row owned by the authenticated user.
// Returns the report ID and user ID so the client can build the
// per-file storage path (disclosures/{user_id}/{report_id}/...).
//
// Credit gate: before creating the row, check that the user has at
// least one credit available (subscription / one-off / trial). The
// credit isn't actually consumed at create time. Consumption
// happens in performAnalysis when the report transitions to
// qa_pending, so a half-finished upload that the user abandons
// doesn't cost them a credit. The gate here is just "can this user
// SPEND a credit if they finish?"
//
// Team/brokerage stamping: at insert time, we look up the user's
// team_id and (if any) the team's brokerage_id (OR the user's direct
// brokerage_agents row) and stamp both columns on the new report.
// This is what powers the team-wide reports view and the brokerage
// admin reports view. Solo agents get nulls in both columns.

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  // Credit gate. balanceForUser checks subscription period, one-off
  // balance, and trial credits.
  const balance = await balanceForUser(user.id);
  if (!balance.canCreateReport) {
    return NextResponse.json(
      {
        error:
          "No credits available. Choose a plan or buy a single report from /pricing to keep going.",
        code: "NO_CREDITS",
        balance: {
          subscription: balance.subscriptionReportsRemaining,
          oneoff: balance.oneoffCredits,
          trial: balance.trialCredits,
        },
      },
      { status: 402 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const trim = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // report_name is the agent's label for the report. It is NOT the
  // property address; the analysis pulls the actual address from the
  // disclosure documents.
  const reportName = trim(body?.report_name);
  // client_name is the buyer client; rendered on the cover under
  // "PREPARED FOR".
  const clientName = trim(body?.client_name);

  // property_address remains accepted for backwards compatibility but
  // is deprecated as user input. New uploads should leave it null and
  // let the analysis derive the canonical address from the documents.
  const propertyAddress = trim(body?.property_address);
  const listingUrl = trim(body?.listing_url);
  const listingText = trim(body?.listing_text);

  // Resolve team + brokerage attribution. Service-role read because
  // the user-scoped client's RLS on team_members is own-row-only,
  // which is fine, but on teams/brokerages we want to read the team's
  // brokerage_id without forcing the user to pass a brokerage policy.
  const adminClient = createServiceRoleClient();
  let teamId: string | null = null;
  let brokerageId: string | null = null;
  try {
    const { data: memberRow } = await adminClient
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberRow && (memberRow as { team_id: string }).team_id) {
      teamId = (memberRow as { team_id: string }).team_id;
      const { data: teamRow } = await adminClient
        .from("teams")
        .select("brokerage_id")
        .eq("id", teamId)
        .maybeSingle();
      brokerageId =
        (teamRow as { brokerage_id: string | null } | null)
          ?.brokerage_id ?? null;
    }
    // Direct brokerage agent (no team) still gets brokerage_id stamped.
    if (!brokerageId) {
      const { data: directAgentRow } = await adminClient
        .from("brokerage_agents")
        .select("brokerage_id")
        .eq("user_id", user.id)
        .maybeSingle();
      brokerageId =
        (directAgentRow as { brokerage_id: string } | null)
          ?.brokerage_id ?? null;
    }
  } catch (err) {
    // Attribution is best-effort; if it fails for any reason we still
    // want the report to be creatable. Log and move on.
    console.error("[reports/create] team/brokerage lookup failed:", err);
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      status: "uploaded",
      report_name: reportName,
      client_name: clientName,
      property_address: propertyAddress,
      listing_url: listingUrl,
      listing_text: listingText,
      team_id: teamId,
      brokerage_id: brokerageId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create report." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: data.id,
    user_id: user.id,
    will_be_watermarked: balance.willBeWatermarked,
  });
}

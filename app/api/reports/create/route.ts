import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Creates a new "reports" row owned by the authenticated user.
// Returns the report ID and user ID so the client can build the
// per-file storage path (disclosures/{user_id}/{report_id}/...).

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const trim = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // report_name is the agent's label for the report (e.g., "Smith family
  // · 945 Catkin · Final offer prep"). It is NOT the property address —
  // the analysis pulls the actual address from the disclosure documents.
  const reportName = trim(body?.report_name);
  // client_name is the buyer client; rendered on the cover under
  // "PREPARED FOR".
  const clientName = trim(body?.client_name);

  // property_address remains accepted for backwards compatibility but is
  // deprecated as user input. New uploads should leave it null and let
  // the analysis derive the canonical address from the documents.
  const propertyAddress = trim(body?.property_address);
  const listingUrl = trim(body?.listing_url);
  const listingText = trim(body?.listing_text);

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
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create report." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id, user_id: user.id });
}

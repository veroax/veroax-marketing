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
  const propertyAddress: string | null =
    typeof body?.property_address === "string" && body.property_address.trim()
      ? body.property_address.trim()
      : null;
  const listingUrl: string | null =
    typeof body?.listing_url === "string" && body.listing_url.trim()
      ? body.listing_url.trim()
      : null;
  const listingText: string | null =
    typeof body?.listing_text === "string" && body.listing_text.trim()
      ? body.listing_text.trim()
      : null;

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      status: "uploaded",
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

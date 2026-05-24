// Handles the email verification redirect from Supabase.
// Supabase appends ?token_hash=...&type=... to this URL when the user
// clicks the link in the verification email; we exchange that for a
// session and forward them to the `next` URL (or /dashboard if none).

import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only accept same-origin relative paths so the email link can't be
// repurposed to redirect a freshly-verified user to a phishing site.
function safeNextPath(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard"; // protocol-relative
  if (raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Verification failed or missing params.
  return NextResponse.redirect(
    new URL("/login?error=verification_failed", request.url),
  );
}

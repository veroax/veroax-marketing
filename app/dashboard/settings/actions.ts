"use server";

// Server Action for saving the agent's profile from /dashboard/settings.
// The same columns drive the PDF report's "Prepared By" panel + footer,
// so what the agent saves here is what shows up on every downloaded
// report immediately after — no analyze rerun needed.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  verifyDreLicense,
  persistDreResult,
  shouldRecheckDre,
} from "@/lib/server/dreVerify";

function trim(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

// Normalize a URL field: empty stays empty; strings without a scheme
// gain "https://" so common paste shapes ("luxuriantrealty.com") still
// work. We do final validation afterward.
function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type SettingsActionState = {
  ok?: boolean;
  error?: string;
};

export async function updateProfileAction(
  _prev: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  // -------- Existing fields --------------------------------------
  const fullName = trim(formData, "full_name");
  const dreLicense = trim(formData, "dre_license");
  const brokerage = trim(formData, "brokerage");
  const brokerageDre = trim(formData, "brokerage_dre");
  const phone = trim(formData, "phone");
  const displayEmail = trim(formData, "display_email");

  // -------- New branding + public-detail fields ------------------
  const brokerageLogoUrl = trim(formData, "brokerage_logo_url");
  const headshotUrl = trim(formData, "headshot_url");
  const brandAccentHexRaw = trim(formData, "brand_accent_hex");
  const tagline = trim(formData, "tagline");
  const websiteUrl = normalizeUrl(trim(formData, "website_url"));
  const schedulingUrl = normalizeUrl(trim(formData, "scheduling_url"));
  const officeAddress = trim(formData, "office_address");
  const emailSignature = trim(formData, "email_signature");

  // -------- Validation -------------------------------------------
  // Hard requirements — these fields appear on every PDF cover and
  // the report itself is blocked from download (412) without them.
  if (!fullName) return { error: "Full name is required." };
  if (!dreLicense) return { error: "DRE license is required." };
  if (!brokerage) return { error: "Brokerage name is required." };

  if (!/^\d{5,10}$/.test(dreLicense)) {
    return { error: "DRE license should be 5-10 digits." };
  }
  if (brokerageDre && !/^\d{5,10}$/.test(brokerageDre)) {
    return { error: "Brokerage DRE should be 5-10 digits." };
  }

  if (displayEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayEmail)) {
    return { error: "Display email isn't a valid email address." };
  }

  // Accent color: must be #RRGGBB if provided. We store the hex
  // directly (no theme name), null means "use the Veroax gold default."
  if (brandAccentHexRaw && !/^#[0-9A-Fa-f]{6}$/.test(brandAccentHexRaw)) {
    return { error: "Brand accent must be a 6-character hex like #C9A84C." };
  }
  // Normalize to uppercase so the saved value is stable.
  const brandAccentHex = brandAccentHexRaw
    ? brandAccentHexRaw.toUpperCase()
    : null;

  if (websiteUrl && !isValidUrl(websiteUrl)) {
    return { error: "Website URL doesn't look like a valid URL." };
  }
  if (schedulingUrl && !isValidUrl(schedulingUrl)) {
    return { error: "Scheduling URL doesn't look like a valid URL." };
  }

  // Logos: we don't validate as URLs because they're produced by our
  // own Supabase Storage upload path. Trust what was uploaded.

  // -------- Persist ----------------------------------------------
  // upsert (rather than update) so this works for two distinct user
  // populations:
  //
  //   1. Agents who signed up AFTER the on-signup trigger was wired —
  //      they already have a profiles row, and we just update it.
  //   2. Agents who signed up BEFORE the trigger existed, or whose
  //      on-signup trigger didn't fire — they don't have a row, and a
  //      plain .update().eq("id", user.id) matches zero rows and
  //      returns success without persisting anything. That was the
  //      bug behind "I save my details, the page says Saved, then
  //      they're gone on reload."
  //
  // email is NOT NULL on profiles, so we include it on the upsert
  // payload — required when we're creating the row, ignored when the
  // row already exists.
  const { data: written, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? "",
        full_name: fullName,
        dre_license: dreLicense,
        brokerage: brokerage,
        brokerage_dre: brokerageDre,
        phone: phone,
        display_email: displayEmail,
        brokerage_logo_url: brokerageLogoUrl,
        headshot_url: headshotUrl,
        brand_accent_hex: brandAccentHex,
        tagline: tagline,
        website_url: websiteUrl,
        scheduling_url: schedulingUrl,
        office_address: officeAddress,
        email_signature: emailSignature,
      },
      { onConflict: "id" },
    )
    .select("id");

  if (error) {
    return { error: `Save failed: ${error.message}` };
  }
  // Belt-and-suspenders: if upsert silently affected zero rows for any
  // reason (RLS denial that doesn't surface as an error, etc.), don't
  // mislead the agent with a green "Saved" message.
  if (!written || written.length === 0) {
    return {
      error:
        "Save returned no rows. Your profile row may be missing — contact support.",
    };
  }

  // Invalidate the dashboard chrome (sidebar displays full_name; the
  // "complete your profile" banner reads dre_license + brokerage) and
  // any report-detail page that renders agent info.
  revalidatePath("/dashboard", "layout");

  // -------- DRE verification (best-effort, async) ----------------
  // Fire-and-forget against the CA DRE public license lookup. Runs
  // AFTER the response is sent so the save button stays snappy. We
  // skip the lookup when the cached check is fresh (<24h old) AND
  // neither the license number nor full name has changed since.
  after(async () => {
    try {
      const admin = createServiceRoleClient();
      const { data: existing } = await admin
        .from("profiles")
        .select(
          "dre_verification_status, dre_verification_checked_at, dre_verification_response, full_name, dre_license",
        )
        .eq("id", user.id)
        .maybeSingle();
      const existingRow = existing as
        | {
            dre_verification_status: string | null;
            dre_verification_checked_at: string | null;
            dre_verification_response: {
              license_id?: string | null;
            } | null;
            full_name: string | null;
            dre_license: string | null;
          }
        | null;

      const previousLicense =
        existingRow?.dre_verification_response?.license_id ?? null;
      const licenseChanged =
        (previousLicense ?? "").replace(/\D/g, "") !==
        dreLicense.replace(/\D/g, "");
      const nameChanged = (existingRow?.full_name ?? "") !== fullName;
      const stale = shouldRecheckDre(
        existingRow?.dre_verification_status as
          | Parameters<typeof shouldRecheckDre>[0]
          | null,
        existingRow?.dre_verification_checked_at ?? null,
      );

      if (!licenseChanged && !nameChanged && !stale) {
        return; // cached result is fresh, skip the network call
      }

      const result = await verifyDreLicense({
        licenseId: dreLicense,
        agentFullName: fullName,
      });
      await persistDreResult(admin, user.id, result);
    } catch (err) {
      // Verification is best-effort; never let a DRE outage break
      // settings save.
      console.error("[settings] dre verification failed:", err);
    }
  });

  return { ok: true };
}

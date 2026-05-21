"use server";

// Server Action for saving the agent's profile from /dashboard/settings.
// The same columns drive the PDF report's "Prepared By" panel + footer,
// so what the agent saves here is what shows up on every downloaded
// report immediately after — no analyze rerun needed.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function trim(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
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

  const fullName = trim(formData, "full_name");
  const dreLicense = trim(formData, "dre_license");
  const brokerage = trim(formData, "brokerage");
  const brokerageDre = trim(formData, "brokerage_dre");
  const phone = trim(formData, "phone");
  const displayEmail = trim(formData, "display_email");

  // Hard requirements — these fields appear on every PDF cover and
  // the report itself is blocked from download (412) without them.
  if (!fullName) return { error: "Full name is required." };
  if (!dreLicense) return { error: "DRE license is required." };
  if (!brokerage) return { error: "Brokerage name is required." };

  // DRE numbers are 5-10 digits in CA.
  if (!/^\d{5,10}$/.test(dreLicense)) {
    return { error: "DRE license should be 5-10 digits." };
  }
  if (brokerageDre && !/^\d{5,10}$/.test(brokerageDre)) {
    return { error: "Brokerage DRE should be 5-10 digits." };
  }

  // Display email is optional, but if provided it must look like one.
  if (displayEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayEmail)) {
    return { error: "Display email isn't a valid email address." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      dre_license: dreLicense,
      brokerage: brokerage,
      brokerage_dre: brokerageDre,
      phone: phone,
      display_email: displayEmail,
    })
    .eq("id", user.id);

  if (error) {
    return { error: `Save failed: ${error.message}` };
  }

  // Invalidate the dashboard chrome (sidebar displays full_name; the
  // "complete your profile" banner reads dre_license + brokerage) and
  // any report-detail page that renders agent info.
  revalidatePath("/dashboard", "layout");

  return { ok: true };
}

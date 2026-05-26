import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./_components/SettingsForm";
import {
  DreVerificationPill,
  type DreStatusEnum,
} from "@/app/_components/DreVerificationPill";

// /dashboard/settings — agent profile editor. The same five fields
// (full_name, dre_license, brokerage, brokerage_dre, phone) drive the
// "Prepared By" panel on every PDF cover plus the page footers. Saving
// here updates all future downloads immediately.

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, dre_license, brokerage, brokerage_dre, phone, display_email, brokerage_logo_url, headshot_url, brand_accent_hex, tagline, website_url, scheduling_url, office_address, email_signature, dre_verification_status, dre_verification_checked_at, dre_verification_response")
    .eq("id", user.id)
    .maybeSingle();

  // DRE verification fields, surfaced inline so the agent can see
  // immediately whether their license verified after saving. The
  // status pill renders below the page heading.
  const dreStatus =
    ((profile as { dre_verification_status?: string | null } | null)
      ?.dre_verification_status ?? null) as DreStatusEnum;
  const dreCheckedAt =
    (profile as { dre_verification_checked_at?: string | null } | null)
      ?.dre_verification_checked_at ?? null;

  // Tolerate undefined values from old profile rows that pre-date the
  // 0007/0008 migrations.
  const p = (profile ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof p[k] === "string" ? (p[k] as string) : "";

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          {/* DRE verification status pill. Inline + clickable tooltip
              keeps it visible without an extra panel. */}
          <div className="flex flex-col items-end">
            <DreVerificationPill status={dreStatus} />
            {dreCheckedAt ? (
              <span className="text-[10px] text-slate-400 mt-1">
                Last checked {new Date(dreCheckedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Edit the agent details that appear on your downloadable reports.
          Changes apply to every report you download from this point on,
          no re-analysis needed.
        </p>
      </header>

      <SettingsForm
        email={user.email ?? ""}
        userId={user.id}
        initial={{
          full_name: str("full_name"),
          dre_license: str("dre_license"),
          brokerage: str("brokerage"),
          brokerage_dre: str("brokerage_dre"),
          phone: str("phone"),
          display_email: str("display_email"),
          brokerage_logo_url: str("brokerage_logo_url"),
          headshot_url: str("headshot_url"),
          brand_accent_hex: str("brand_accent_hex"),
          tagline: str("tagline"),
          website_url: str("website_url"),
          scheduling_url: str("scheduling_url"),
          office_address: str("office_address"),
          email_signature: str("email_signature"),
        }}
      />
    </div>
  );
}

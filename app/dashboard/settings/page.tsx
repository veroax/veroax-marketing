import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./_components/SettingsForm";

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
    .select("full_name, dre_license, brokerage, brokerage_dre, phone, display_email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600 mt-1">
          Edit the agent details that appear on your downloadable reports.
          Changes apply to every report you download from this point on —
          no re-analysis needed.
        </p>
      </header>

      <SettingsForm
        email={user.email ?? ""}
        initial={{
          full_name: profile?.full_name ?? "",
          dre_license: profile?.dre_license ?? "",
          brokerage: profile?.brokerage ?? "",
          brokerage_dre:
            (profile as { brokerage_dre?: string | null } | null)
              ?.brokerage_dre ?? "",
          phone: profile?.phone ?? "",
          display_email:
            (profile as { display_email?: string | null } | null)
              ?.display_email ?? "",
        }}
      />
    </div>
  );
}

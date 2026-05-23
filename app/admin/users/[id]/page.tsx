// Single user detail. Shows the profile, lifetime report counts by
// status, the user's most recent reports, and a few actions (toggle
// admin role, jump into any of their reports). Reads via service-role
// so this works for users other than the viewing admin.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ToggleAdminButton } from "../../_components/ToggleAdminButton";
import { ToggleVipButton } from "../../_components/ToggleVipButton";
import { GrantCreditsPanel } from "../../_components/GrantCreditsPanel";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "User — Admin",
};

export default async function AdminUserDetail({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const admin = createServiceRoleClient();

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, brokerage, dre_license, phone, is_admin, is_vip, vip_granted_at, vip_notes, trial_credits_remaining, report_credits_balance, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const profileTyped = profile as {
    id: string;
    email: string;
    full_name: string | null;
    brokerage: string | null;
    dre_license: string | null;
    phone: string | null;
    is_admin: boolean | null;
    is_vip: boolean | null;
    vip_granted_at: string | null;
    vip_notes: string | null;
    trial_credits_remaining: number | null;
    report_credits_balance: number | null;
    created_at: string | null;
  };

  // Their reports — most recent 30, plus aggregate counts by status.
  const [{ data: reportsData }, { data: statusBuckets }] = await Promise.all([
    admin
      .from("reports")
      .select(
        "id, status, property_address, client_name, report_name, created_at, archived",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("reports")
      .select("status, archived")
      .eq("user_id", id),
  ]);

  const reports = reportsData ?? [];
  const buckets: Record<string, number> = {};
  let archivedCount = 0;
  for (const r of statusBuckets ?? []) {
    const status = (r as { status: string }).status;
    buckets[status] = (buckets[status] ?? 0) + 1;
    if ((r as { archived?: boolean }).archived) archivedCount += 1;
  }
  const totalReports = (statusBuckets ?? []).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← All users
        </Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">
            {profile.full_name?.trim() || (
              <span className="text-slate-400 italic">(no name)</span>
            )}
          </h1>
          {profileTyped.is_admin ? (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded">
              Admin
            </span>
          ) : null}
          {profileTyped.is_vip ? (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950 px-2 py-0.5 rounded">
              ★ VIP
            </span>
          ) : null}
        </div>
        <p className="text-sm text-gray-500 mt-1">{profile.email}</p>
        {profileTyped.is_vip && profileTyped.vip_notes ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mt-2 inline-block">
            VIP notes: {profileTyped.vip_notes}
          </p>
        ) : null}
      </div>

      {/* Profile + actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 text-sm">
            {profile.brokerage ? (
              <p>
                <span className="text-slate-500">Brokerage:</span>{" "}
                <span className="text-slate-900 font-medium">
                  {profile.brokerage}
                </span>
              </p>
            ) : null}
            {profile.dre_license ? (
              <p>
                <span className="text-slate-500">DRE #:</span>{" "}
                <span className="text-slate-900 font-medium">
                  {profile.dre_license}
                </span>
              </p>
            ) : null}
            {profile.phone ? (
              <p>
                <span className="text-slate-500">Phone:</span>{" "}
                <span className="text-slate-900 font-medium">
                  {profile.phone}
                </span>
              </p>
            ) : null}
            {profile.created_at ? (
              <p>
                <span className="text-slate-500">Joined:</span>{" "}
                <span className="text-slate-900 font-medium">
                  {new Date(profile.created_at).toLocaleDateString(undefined, {
                    dateStyle: "long",
                  })}
                </span>
              </p>
            ) : null}
            <p className="text-xs text-slate-400 font-mono mt-2">
              ID: {profile.id}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ToggleAdminButton
              userId={profile.id}
              currentIsAdmin={Boolean(profile.is_admin)}
              userLabel={profile.full_name?.trim() || profile.email}
            />
            <ToggleVipButton
              userId={profile.id}
              currentIsVip={Boolean(profileTyped.is_vip)}
              userLabel={profile.full_name?.trim() || profile.email}
            />
            <Link
              href={`/admin/audit?user=${profile.id}`}
              className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
            >
              View this user&apos;s audit trail →
            </Link>
          </div>
        </div>
      </div>

      {/* Grant credits panel — sits below the profile card so it's
          visible without scrolling but doesn't compete with the
          role / VIP buttons for the agent's attention. */}
      <GrantCreditsPanel
        userId={profile.id}
        currentTrial={profileTyped.trial_credits_remaining ?? 0}
        currentOneoff={profileTyped.report_credits_balance ?? 0}
      />

      {/* Report counts by status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Lifetime reports
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Stat label="Total" value={totalReports} />
          <Stat label="Ready" value={buckets.qa_pending ?? 0} tone="green" />
          <Stat
            label="Analyzing"
            value={buckets.analyzing ?? 0}
            tone={buckets.analyzing ? "amber" : "muted"}
          />
          <Stat
            label="Failed"
            value={buckets.failed ?? 0}
            tone={buckets.failed ? "red" : "muted"}
          />
          <Stat label="Archived" value={archivedCount} />
        </div>
      </div>

      {/* Recent reports */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Recent reports (last 30)
        </h2>
        {reports.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            This user hasn&apos;t generated any reports yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {reports.map((r) => (
              <li
                key={r.id}
                className="py-2.5 flex items-center gap-3"
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider w-12 text-center px-1 py-0.5 rounded shrink-0 ${statusTone(r.status)}`}
                >
                  {statusLabel(r.status)}
                </span>
                {r.archived ? (
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    Arc
                  </span>
                ) : null}
                <Link
                  href={`/dashboard/reports/${r.id}`}
                  className="flex-1 min-w-0 truncate text-slate-900 hover:text-indigo-700"
                >
                  {r.property_address?.trim() ||
                    r.report_name?.trim() ||
                    "Untitled report"}
                </Link>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "amber" | "red" | "green";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "green"
          ? "text-emerald-700"
          : "text-slate-900";
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Up";
    case "analyzing":
      return "Run";
    case "qa_pending":
    case "qa_approved":
      return "Rdy";
    case "delivered":
      return "Del";
    case "failed":
      return "Fail";
    default:
      return status.slice(0, 4);
  }
}

function statusTone(status: string): string {
  switch (status) {
    case "analyzing":
      return "bg-indigo-200 text-indigo-800";
    case "qa_pending":
    case "qa_approved":
    case "delivered":
      return "bg-emerald-200 text-emerald-800";
    case "failed":
      return "bg-red-200 text-red-800";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

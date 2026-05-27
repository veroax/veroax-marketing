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
import { SuspendUserButton } from "../../_components/SuspendUserButton";
import { DeleteUserButton } from "../../_components/DeleteUserButton";
import { AdminPasswordActions } from "../../_components/AdminPasswordActions";
import { AdminArchiveActions } from "../../_components/AdminArchiveActions";
import { DreRecheckButton } from "../../_components/DreRecheckButton";
import { DreVerificationPill } from "@/app/_components/DreVerificationPill";
import {
  computeProfitabilityForUsers,
  getActiveSubscription,
  formatUsdCents,
  marginLabel,
} from "@/lib/billing/profitability";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "User, Admin",
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
      "id, email, full_name, brokerage, dre_license, phone, is_admin, is_vip, vip_granted_at, vip_notes, trial_credits_remaining, report_credits_balance, created_at, is_suspended, suspended_at, suspended_reason, dre_verification_status, dre_verified_at, dre_verification_checked_at, dre_verification_method, dre_verification_response, archived_at, archived_scope",
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
    is_suspended: boolean | null;
    suspended_at: string | null;
    suspended_reason: string | null;
    dre_verification_status:
      | "verified"
      | "mismatch"
      | "inactive"
      | "expired"
      | "suspended"
      | "revoked"
      | "not_found"
      | "error"
      | "pending"
      | null;
    dre_verified_at: string | null;
    dre_verification_checked_at: string | null;
    dre_verification_method: string | null;
    dre_verification_response: {
      remote_status?: string | null;
      remote_name?: string | null;
      remote_license_type?: string | null;
      remote_expiration?: string | null;
      remote_responsible_broker?: string | null;
      error_message?: string | null;
    } | null;
    archived_at: string | null;
    archived_scope: "brokerage" | "site" | null;
  };

  // Their reports, most recent 30, plus aggregate counts by status.
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

  // Subscription + profitability lookup, lifetime + this-month.
  const [subscription, lifeMap, monthMap] = await Promise.all([
    getActiveSubscription({ userId: id }),
    computeProfitabilityForUsers({ userIds: [id], period: "lifetime" }),
    computeProfitabilityForUsers({ userIds: [id], period: "this_month" }),
  ]);
  const life = lifeMap.get(id) ?? {
    user_id: id,
    paid_cents: 0,
    cost_cents: 0,
    margin_cents: 0,
    report_count: 0,
    free_report_count: 0,
  };
  const month = monthMap.get(id) ?? {
    user_id: id,
    paid_cents: 0,
    cost_cents: 0,
    margin_cents: 0,
    report_count: 0,
    free_report_count: 0,
  };
  const lifeLabel = marginLabel(life);
  const monthLabel = marginLabel(month);

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
          {profileTyped.is_suspended ? (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white px-2 py-0.5 rounded">
              Suspended
            </span>
          ) : null}
        </div>
        <p className="text-sm text-gray-500 mt-1">{profile.email}</p>
        {profileTyped.is_vip && profileTyped.vip_notes ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mt-2 inline-block">
            VIP notes: {profileTyped.vip_notes}
          </p>
        ) : null}
        {profileTyped.is_suspended ? (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 mt-3 text-sm">
            <p className="font-bold text-red-900">
              This user is suspended
            </p>
            <p className="text-red-800 mt-1">
              Their auth login is blocked and any active Stripe
              subscription has been cancelled.{" "}
              {profileTyped.suspended_at ? (
                <>
                  Suspended on{" "}
                  {new Date(profileTyped.suspended_at).toLocaleDateString(
                    undefined,
                    { dateStyle: "long" },
                  )}
                  .
                </>
              ) : null}
            </p>
            {profileTyped.suspended_reason ? (
              <p className="text-red-800 mt-1 italic">
                Reason: {profileTyped.suspended_reason}
              </p>
            ) : null}
            <p className="text-xs text-red-700 mt-2">
              Click <strong>Unsuspend</strong> in the actions column to
              restore login. Subscription is NOT auto-restored; user
              re-subscribes via the pricing page.
            </p>
          </div>
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
            <SuspendUserButton
              userId={profile.id}
              userLabel={profile.full_name?.trim() || profile.email}
              isSuspended={Boolean(profileTyped.is_suspended)}
              suspendedReason={profileTyped.suspended_reason}
            />
            <AdminPasswordActions
              userId={profile.id}
              userEmail={profile.email}
            />
            <AdminArchiveActions
              userId={profile.id}
              userEmail={profile.email}
              isArchived={Boolean(profileTyped.archived_at)}
              archivedScope={profileTyped.archived_scope}
            />
            <DeleteUserButton
              userId={profile.id}
              userEmail={profile.email}
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

      {/* DRE verification card. Always rendered when the user has a
          license on file so the founder can see remote status + name
          + expiration alongside any mismatch reason, plus a button to
          re-run the check on demand. */}
      {profile.dre_license ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
                DRE verification
              </h2>
              <div className="mt-2">
                <DreVerificationPill
                  status={profileTyped.dre_verification_status}
                  showDescription
                />
              </div>
            </div>
            <DreRecheckButton
              userId={profile.id}
              licenseId={profile.dre_license}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <KeyValue label="License #" value={profile.dre_license} />
            <KeyValue
              label="License type"
              value={
                profileTyped.dre_verification_response?.remote_license_type ??
                null
              }
            />
            <KeyValue
              label="DRE name on file"
              value={profileTyped.dre_verification_response?.remote_name ?? null}
            />
            <KeyValue
              label="DRE status"
              value={
                profileTyped.dre_verification_response?.remote_status ?? null
              }
            />
            <KeyValue
              label="Expiration"
              value={
                profileTyped.dre_verification_response?.remote_expiration ?? null
              }
            />
            <KeyValue
              label="Responsible broker"
              value={
                profileTyped.dre_verification_response
                  ?.remote_responsible_broker ?? null
              }
            />
          </div>

          {profileTyped.dre_verification_response?.error_message ? (
            <p className="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 leading-relaxed">
              <strong>Check note:</strong>{" "}
              {profileTyped.dre_verification_response.error_message}
            </p>
          ) : null}

          <p className="mt-4 text-[11px] text-slate-500">
            {profileTyped.dre_verification_checked_at
              ? `Last checked ${new Date(profileTyped.dre_verification_checked_at).toLocaleString()}`
              : "Never checked. Trigger a recheck or have the user save settings."}
            {profileTyped.dre_verified_at
              ? `, verified at ${new Date(profileTyped.dre_verified_at).toLocaleString()}.`
              : "."}
          </p>
        </div>
      ) : null}

      {/* Subscription + profitability summary. Sits above credits so
          the founder reads "who is this person paying us as" first,
          then sees the per-user margin, then can grant credits with
          context. */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-4">
          Plan + profitability
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-2">
              Current plan
            </p>
            {subscription ? (
              <div className="space-y-1">
                <p className="text-lg font-bold text-slate-900 capitalize">
                  {subscription.plan}{" "}
                  {subscription.billing ? (
                    <span className="text-slate-500 text-sm font-medium">
                      / {subscription.billing}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-600">
                  Status:{" "}
                  <span className="capitalize font-medium text-slate-900">
                    {subscription.status}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Monthly equivalent:{" "}
                  <span className="font-mono font-semibold text-slate-900">
                    ${subscription.monthly_usd.toFixed(2)}
                  </span>
                </p>
                {subscription.current_period_end ? (
                  <p className="text-xs text-slate-500">
                    Period ends{" "}
                    {new Date(
                      subscription.current_period_end,
                    ).toLocaleDateString(undefined, {
                      dateStyle: "medium",
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">
                No active subscription. May be on pay-as-you-go,
                trial credits, or VIP.
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-2">
              Profitability
            </p>
            <div className="grid grid-cols-2 gap-3">
              <ProfitTile
                label="Lifetime paid"
                value={formatUsdCents(life.paid_cents)}
              />
              <ProfitTile
                label="Lifetime cost"
                value={formatUsdCents(life.cost_cents)}
              />
              <ProfitTile
                label="Lifetime margin"
                value={formatUsdCents(life.margin_cents)}
                tone={lifeLabel.tone}
                sublabel={lifeLabel.label}
              />
              <ProfitTile
                label="Free credits granted"
                value={String(life.free_report_count)}
                tone={life.free_report_count > 0 ? "amber" : "muted"}
              />
              <ProfitTile
                label="This month paid"
                value={formatUsdCents(month.paid_cents)}
              />
              <ProfitTile
                label="This month cost"
                value={formatUsdCents(month.cost_cents)}
              />
              <ProfitTile
                label="This month margin"
                value={formatUsdCents(month.margin_cents)}
                tone={monthLabel.tone}
                sublabel={monthLabel.label}
              />
              <ProfitTile
                label="Reports analyzed"
                value={`${life.report_count} life / ${month.report_count} mo`}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
              Paid blends active subscription value plus pay-as-you-go
              purchases. Cost is Anthropic Sonnet 4.5 list price applied
              to every analyzed report&apos;s input + output tokens.
              Refunds are not subtracted yet.
            </p>
          </div>
        </div>
      </div>

      {/* Grant credits panel. Sits below the profile + profitability
          card so the founder makes grants with the margin already in
          their head. */}
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

function ProfitTile({
  label,
  value,
  sublabel,
  tone = "muted",
}: {
  label: string;
  value: string;
  sublabel?: string;
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
      <p className={`text-base font-bold mt-1 font-mono ${toneClass}`}>
        {value}
      </p>
      {sublabel ? (
        <p className={`text-[10px] uppercase tracking-wider mt-0.5 ${toneClass}`}>
          {sublabel}
        </p>
      ) : null}
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

function KeyValue({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
        {label}
      </p>
      <p className="text-sm text-slate-900 font-medium mt-0.5 break-words">
        {value && value.trim() ? value : (
          <span className="text-slate-400 italic">not set</span>
        )}
      </p>
    </div>
  );
}

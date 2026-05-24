// Free credits administration view. Every row in report_credit_ledger
// with reason='admin_grant' is an admin-issued comp. This page rolls
// those up by recipient so the founder can see:
//
//   - Who has received free credits (lifetime total)
//   - Which admin granted each batch (actor_user_id in metadata)
//   - When the last grant happened and what notes were attached
//   - Whether the recipient has converted to a paying plan
//
// Use case: "who do I need to talk to about paying for future use?"
// Sort by total credits granted desc to see the heaviest comps first.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSubscriptionsForUsers } from "@/lib/billing/profitability";

export const metadata = {
  title: "Free credits, Admin",
};

type LedgerRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  metadata: {
    type?: "trial" | "oneoff";
    notes?: string | null;
    actor_user_id?: string;
    actor_email?: string;
  } | null;
  created_at: string;
};

type Aggregate = {
  user_id: string;
  total_credits: number;
  grant_count: number;
  last_granted_at: string;
  last_granted_by_email: string | null;
  last_notes: string | null;
  by_type: { trial: number; oneoff: number };
};

export default async function FreeCreditsPage() {
  const admin = createServiceRoleClient();

  const { data: ledgerData } = await admin
    .from("report_credit_ledger")
    .select("id, user_id, amount, reason, metadata, created_at")
    .eq("reason", "admin_grant")
    .order("created_at", { ascending: false })
    .limit(1000);
  const rows = (ledgerData ?? []) as LedgerRow[];

  // Aggregate by recipient.
  const byUser = new Map<string, Aggregate>();
  for (const r of rows) {
    const existing = byUser.get(r.user_id) ?? {
      user_id: r.user_id,
      total_credits: 0,
      grant_count: 0,
      last_granted_at: r.created_at,
      last_granted_by_email:
        (r.metadata?.actor_email as string | undefined) ?? null,
      last_notes: (r.metadata?.notes as string | null) ?? null,
      by_type: { trial: 0, oneoff: 0 },
    };
    existing.total_credits += Math.max(0, r.amount);
    existing.grant_count += 1;
    if (r.created_at > existing.last_granted_at) {
      existing.last_granted_at = r.created_at;
      existing.last_granted_by_email =
        (r.metadata?.actor_email as string | undefined) ?? null;
      existing.last_notes = (r.metadata?.notes as string | null) ?? null;
    }
    const type = r.metadata?.type;
    if (type === "trial") existing.by_type.trial += Math.max(0, r.amount);
    if (type === "oneoff") existing.by_type.oneoff += Math.max(0, r.amount);
    byUser.set(r.user_id, existing);
  }

  const sorted = Array.from(byUser.values()).sort(
    (a, b) => b.total_credits - a.total_credits,
  );

  // Resolve recipients + plan info in two batched queries.
  const userIds = sorted.map((a) => a.user_id);
  const [{ data: recipientsData }, planMap] = await Promise.all([
    userIds.length > 0
      ? admin
          .from("profiles")
          .select("id, email, full_name, brokerage, is_vip")
          .in("id", userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; full_name: string | null; brokerage: string | null; is_vip: boolean | null }> }),
    getActiveSubscriptionsForUsers({ userIds }),
  ]);
  const profiles = (recipientsData ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    brokerage: string | null;
    is_vip: boolean | null;
  }>;
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const totalCreditsGranted = sorted.reduce(
    (acc, a) => acc + a.total_credits,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Free credits</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Every admin-granted credit, by recipient. Use this to identify
          who has been comp&apos;d so far so you know who to follow up
          with about converting to a paid plan. Heaviest comps appear
          first.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryTile label="Recipients" value={String(sorted.length)} />
        <SummaryTile
          label="Total credits granted"
          value={String(totalCreditsGranted)}
        />
        <SummaryTile
          label="Grant events"
          value={String(rows.length)}
        />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500 italic bg-white rounded-2xl border border-slate-200 p-6">
          No admin grants on the ledger yet. Use the &quot;Grant credits&quot;
          panel on any user&apos;s detail page to comp them a report.
        </p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-6 py-3">Recipient</th>
                <th className="text-left font-semibold px-6 py-3">Current plan</th>
                <th className="text-right font-semibold px-6 py-3">Total comp&apos;d</th>
                <th className="text-right font-semibold px-6 py-3">Grants</th>
                <th className="text-left font-semibold px-6 py-3">Last grant</th>
                <th className="text-left font-semibold px-6 py-3">By admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((agg) => {
                const profile = profileMap.get(agg.user_id);
                const plan = planMap.get(agg.user_id) ?? null;
                return (
                  <tr key={agg.user_id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3.5">
                      <Link
                        href={`/admin/users/${agg.user_id}`}
                        className="block"
                      >
                        <div className="font-medium text-slate-900 hover:text-indigo-700 flex items-center gap-2 flex-wrap">
                          {profile?.full_name?.trim() ||
                            profile?.email ||
                            <span className="text-slate-400 italic">unknown</span>}
                          {profile?.is_vip ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded">
                              ★ VIP
                            </span>
                          ) : null}
                        </div>
                        {profile?.full_name?.trim() && profile.email ? (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {profile.email}
                          </div>
                        ) : null}
                        {profile?.brokerage?.trim() ? (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {profile.brokerage}
                          </div>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-sm">
                      {plan ? (
                        <span className="capitalize text-slate-900 font-medium">
                          {plan.plan}
                          {plan.billing ? (
                            <span className="text-slate-500 font-normal">
                              {" "}
                              / {plan.billing}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-amber-700 text-xs italic">
                          no paid plan
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-900 font-semibold font-mono">
                      {agg.total_credits}
                      <div className="text-[10px] text-slate-500 font-normal">
                        {agg.by_type.trial > 0 ? (
                          <span title="trial credits, watermarked output">
                            {agg.by_type.trial} trial
                          </span>
                        ) : null}
                        {agg.by_type.trial > 0 && agg.by_type.oneoff > 0
                          ? " · "
                          : null}
                        {agg.by_type.oneoff > 0 ? (
                          <span title="one-off credits, full-quality output">
                            {agg.by_type.oneoff} comp
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-700 text-sm font-mono">
                      {agg.grant_count}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-700">
                      {new Date(agg.last_granted_at).toLocaleDateString(
                        undefined,
                        { dateStyle: "medium" },
                      )}
                      {agg.last_notes ? (
                        <div
                          className="text-[11px] text-slate-500 mt-0.5 italic truncate max-w-xs"
                          title={agg.last_notes}
                        >
                          {agg.last_notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-700">
                      {agg.last_granted_by_email || (
                        <span className="text-slate-400 italic">unknown</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500 italic max-w-3xl">
        Audit detail: every admin grant also writes a row to{" "}
        <Link
          href="/admin/audit?event=credits.granted_by_admin"
          className="text-indigo-700 underline underline-offset-2"
        >
          audit_log
        </Link>{" "}
        with the granting admin&apos;s user_id, the credit count, the type
        (trial / oneoff), and any notes. Use that view for a
        chronological trail; this page rolls the same data up by
        recipient.
      </p>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-bold text-slate-900 font-mono">{value}</p>
    </div>
  );
}

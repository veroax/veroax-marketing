import { createServiceRoleClient } from "@/lib/supabase/server";
import { SubmissionRow } from "./_components/SubmissionRow";

export const metadata = {
  title: "Report-error inbox — Admin",
};

type Submission = {
  id: string;
  report_id: string | null;
  user_id: string | null;
  email: string;
  phone: string | null;
  categories: string[];
  message: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

type ProfileMini = { id: string; full_name: string | null; email: string };

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  open: { label: "Open", tone: "bg-amber-100 text-amber-800" },
  acknowledged: {
    label: "Acknowledged",
    tone: "bg-slate-100 text-slate-700",
  },
  credit_granted: {
    label: "Credit granted",
    tone: "bg-emerald-100 text-emerald-800",
  },
  dismissed: { label: "Dismissed", tone: "bg-slate-200 text-slate-700" },
};

export default async function ReportErrorsInbox({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status?.trim() ?? "open";

  const admin = createServiceRoleClient();
  let query = admin
    .from("report_error_submissions")
    .select(
      "id, report_id, user_id, email, phone, categories, message, status, admin_notes, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data: subData, count } = await query;
  const submissions = (subData ?? []) as Submission[];

  // Resolve owning profiles in one query.
  const userIds = Array.from(
    new Set(submissions.map((s) => s.user_id).filter(Boolean) as string[]),
  );
  const { data: profilesData } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds)
      : { data: [] as ProfileMini[] };
  const profileMap = new Map<string, ProfileMini>();
  for (const p of (profilesData ?? []) as ProfileMini[]) {
    profileMap.set(p.id, p);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Report-error inbox
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Agent + buyer submissions about errors in delivered reports.
            Grant a credit when an error is confirmed; acknowledge or
            dismiss otherwise.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {count ?? submissions.length} match
          {(count ?? submissions.length) === 1 ? "" : "es"}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(["open", "acknowledged", "credit_granted", "dismissed", "all"] as const).map(
          (s) => (
            <a
              key={s}
              href={`/admin/report-errors${s === "all" ? "" : `?status=${s}`}`}
              className={
                statusFilter === s
                  ? "px-3 py-1.5 rounded-full bg-slate-900 text-white font-semibold"
                  : "px-3 py-1.5 rounded-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              }
            >
              {s.replace("_", " ")}
            </a>
          ),
        )}
      </div>

      {submissions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-sm text-slate-500">
            Nothing matches that filter. Try widening to &quot;all&quot;.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {submissions.map((s) => {
            const owner = s.user_id ? profileMap.get(s.user_id) : null;
            return (
              <SubmissionRow
                key={s.id}
                submission={s}
                ownerName={owner?.full_name ?? null}
                ownerEmail={owner?.email ?? null}
                statusLabel={STATUS_LABEL[s.status] ?? {
                  label: s.status,
                  tone: "bg-slate-100 text-slate-700",
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

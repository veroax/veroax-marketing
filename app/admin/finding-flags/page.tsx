import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Admin triage surface for per-finding flags submitted by agents
// via the FindingFlagButton on the report detail page. Default
// filter is open flags; the URL search param ?status=all|reviewed|
// fixed_in_prompt|wont_fix filters by status. Flags are sorted
// newest first.
//
// This is the Veroax equivalent of the Cowork feedback loop, see
// docs/internal/COWORK_VEROAX_DIFF.md item 4. The founder reads
// open flags, decides what's a real prompt regression, and updates
// the analyzer prompts accordingly. The "fixed_in_prompt" status
// is the closure marker so we know which flags drove which prompt
// changes when grepping the audit trail later.

export const metadata = {
  title: "Finding flags, Admin",
};

type Flag = {
  id: string;
  report_id: string;
  user_id: string;
  finding_title: string;
  finding_severity: string | null;
  category: string;
  note: string | null;
  status: string;
  admin_response: string | null;
  created_at: string;
};

type ProfileMini = { id: string; full_name: string | null; email: string };

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  open: { label: "Open", tone: "bg-amber-100 text-amber-800" },
  reviewed: { label: "Reviewed", tone: "bg-slate-100 text-slate-700" },
  fixed_in_prompt: {
    label: "Fixed in prompt",
    tone: "bg-emerald-100 text-emerald-800",
  },
  wont_fix: { label: "Won't fix", tone: "bg-slate-200 text-slate-700" },
};

const CATEGORY_LABEL: Record<string, string> = {
  inaccurate: "Inaccurate",
  not_applicable: "Not applicable",
  wrong_severity: "Wrong severity",
  missing_context: "Missing context",
  scope_overreach: "Scope overreach",
  other: "Other",
};

export default async function FindingFlagsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status?.trim() ?? "open";

  const admin = createServiceRoleClient();
  let q = admin
    .from("finding_flags")
    .select(
      "id, report_id, user_id, finding_title, finding_severity, category, note, status, admin_response, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }
  const { data: flagData } = await q;
  const flags = (flagData ?? []) as Flag[];

  const userIds = Array.from(new Set(flags.map((f) => f.user_id)));
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

  const counts = await getStatusCounts(admin);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Finding flags</h1>
        <p className="text-sm text-slate-600 mt-1">
          Per-finding feedback the agents submit from the report
          detail page. Use the categories to spot recurring analyzer
          failure modes, then update the focused-pass prompt.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-sm">
        <FilterLink current={statusFilter} value="open" label={`Open (${counts.open})`} />
        <FilterLink current={statusFilter} value="reviewed" label={`Reviewed (${counts.reviewed})`} />
        <FilterLink
          current={statusFilter}
          value="fixed_in_prompt"
          label={`Fixed in prompt (${counts.fixed_in_prompt})`}
        />
        <FilterLink current={statusFilter} value="wont_fix" label={`Won't fix (${counts.wont_fix})`} />
        <FilterLink current={statusFilter} value="all" label={`All (${counts.total})`} />
      </div>

      {flags.length === 0 ? (
        <p className="text-sm text-slate-500 italic">
          No flags match this filter.
        </p>
      ) : (
        <div className="space-y-3">
          {flags.map((f) => {
            const profile = profileMap.get(f.user_id);
            const status = STATUS_LABEL[f.status] ?? {
              label: f.status,
              tone: "bg-slate-100 text-slate-700",
            };
            return (
              <div
                key={f.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 break-words">
                      {f.finding_title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {CATEGORY_LABEL[f.category] ?? f.category}
                      {f.finding_severity ? `, ${f.finding_severity}` : ""}
                      {" "}from{" "}
                      {profile?.full_name?.trim() ||
                        profile?.email ||
                        "Unknown agent"}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </div>
                {f.note && (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {f.note}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
                  <Link
                    href={`/admin/reports/${f.report_id}`}
                    className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
                  >
                    Open report
                  </Link>
                  <span>
                    {new Date(f.created_at).toLocaleString("en-US", {
                      timeZone: "America/Los_Angeles",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

async function getStatusCounts(admin: ReturnType<typeof createServiceRoleClient>) {
  const statuses = ["open", "reviewed", "fixed_in_prompt", "wont_fix"];
  const counts: Record<string, number> = {
    open: 0,
    reviewed: 0,
    fixed_in_prompt: 0,
    wont_fix: 0,
    total: 0,
  };
  for (const s of statuses) {
    const { count } = await admin
      .from("finding_flags")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    counts[s] = count ?? 0;
    counts.total += counts[s];
  }
  return counts as {
    open: number;
    reviewed: number;
    fixed_in_prompt: number;
    wont_fix: number;
    total: number;
  };
}

function FilterLink({
  current,
  value,
  label,
}: {
  current: string;
  value: string;
  label: string;
}) {
  const active = current === value;
  return (
    <Link
      href={`/admin/finding-flags?status=${value}`}
      className={
        active
          ? "px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-semibold"
          : "px-3 py-1 rounded-full bg-white border border-slate-300 text-slate-700 text-xs hover:bg-slate-50"
      }
    >
      {label}
    </Link>
  );
}

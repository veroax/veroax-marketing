// Alert notifications history. Every email the alerting system
// sent, newest first. Use this to audit what the founder was
// notified about, when, and what the active situation looked like.
//
// The same table also backs the cooldown logic in
// lib/server/alerting.ts, so this page is genuinely the single
// source of truth.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Alert history, Admin",
};

type AlertRow = {
  id: string;
  alert_key: string;
  severity: "critical" | "warning" | "info";
  status: "firing" | "recovered";
  subject: string;
  body: string;
  sent_to: string;
  sent_at: string;
  metadata: Record<string, unknown> | null;
};

export default async function AdminAlertsPage() {
  const admin = createServiceRoleClient();
  const since30d = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: rowsData, count }, lastByKeyRes] = await Promise.all([
    admin
      .from("alert_notifications")
      .select(
        "id, alert_key, severity, status, subject, body, sent_to, sent_at, metadata",
        { count: "exact" },
      )
      .gte("sent_at", since30d)
      .order("sent_at", { ascending: false })
      .limit(200),
    admin
      .from("alert_notifications")
      .select("alert_key, status, sent_at")
      .order("sent_at", { ascending: false })
      .limit(500),
  ]);

  const rows = (rowsData ?? []) as AlertRow[];

  // Per-key "current state" summary. For each unique alert_key,
  // pick the most recent row to determine whether the issue is
  // currently firing or has recovered.
  type LastByKey = {
    alert_key: string;
    status: "firing" | "recovered";
    sent_at: string;
  };
  const lastByKey = (lastByKeyRes.data ?? []) as LastByKey[];
  const stateByKey = new Map<string, LastByKey>();
  for (const r of lastByKey) {
    if (!stateByKey.has(r.alert_key)) stateByKey.set(r.alert_key, r);
  }
  const firingKeys = Array.from(stateByKey.values()).filter(
    (s) => s.status === "firing",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Alert history</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Every email the alerting system has sent in the last 30 days,
          newest first. Use this to audit what the on-call person was
          notified about. The same table powers the cooldown logic so
          a sustained outage does not spam the inbox.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryTile
          label="Currently firing"
          value={String(firingKeys.length)}
          tone={firingKeys.length > 0 ? "red" : "green"}
          sublabel={
            firingKeys.length === 0
              ? "all clear"
              : firingKeys.map((k) => k.alert_key).join(", ")
          }
        />
        <SummaryTile
          label="Alerts (30d)"
          value={String(count ?? rows.length)}
          tone="muted"
          sublabel={`${rows.filter((r) => r.status === "firing").length} firing / ${rows.filter((r) => r.status === "recovered").length} recovered`}
        />
        <SummaryTile
          label="Distinct alert keys"
          value={String(stateByKey.size)}
          tone="muted"
          sublabel="unique sources active in window"
        />
      </div>

      <form
        action="/api/admin/test-alert"
        method="POST"
        className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 flex-wrap"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">Send a test alert</p>
          <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
            Fires a sample alert email to every address in
            <span className="font-mono"> ADMIN_ALERT_EMAILS</span> (falls back
            to <span className="font-mono">support@veroax.com</span> when
            unset). Useful to confirm Resend + recipients are wired before
            you wait for a real failure.
          </p>
        </div>
        <button
          type="submit"
          className="text-sm font-semibold bg-indigo-700 text-white px-4 py-2 rounded-lg hover:bg-indigo-600"
        >
          Send test alert
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-6 py-3">When</th>
              <th className="text-left font-semibold px-6 py-3">Alert</th>
              <th className="text-left font-semibold px-6 py-3">Severity</th>
              <th className="text-left font-semibold px-6 py-3">Status</th>
              <th className="text-left font-semibold px-6 py-3">Recipients</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-sm text-slate-500"
                >
                  No alerts in the last 30 days. The system has either been
                  quiet, or no recipient is configured.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50 align-top">
                  <td className="px-6 py-3 text-xs text-slate-700 whitespace-nowrap">
                    {new Date(r.sent_at).toLocaleString("en-US", {
                      timeZone: "America/Los_Angeles",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-6 py-3 max-w-md">
                    <p className="font-medium text-slate-900 break-words">
                      {r.subject}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {r.alert_key}
                    </p>
                  </td>
                  <td className="px-6 py-3">
                    <SeverityPill severity={r.severity} />
                  </td>
                  <td className="px-6 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-700">
                    {r.sent_to}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 italic max-w-3xl">
        Configure recipients via the{" "}
        <span className="font-mono">ADMIN_ALERT_EMAILS</span> environment
        variable on Vercel (comma-separated). Cooldown between repeated
        firing emails of the same alert key is 4 hours; recovery emails
        always send. To wire SMS, add a carrier email-to-text gateway
        (e.g.,{" "}
        <span className="font-mono">5551234567@vtext.com</span>) as another
        recipient, or ask for Twilio integration.{" "}
        <Link href="/admin/health" className="text-indigo-700 underline underline-offset-2">
          Go to system health →
        </Link>
      </p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sublabel,
  tone = "muted",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "muted" | "red" | "green";
}) {
  const valueClass =
    tone === "red"
      ? "text-red-700"
      : tone === "green"
        ? "text-emerald-700"
        : "text-slate-900";
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
      {sublabel ? (
        <p className="text-[11px] text-slate-500 mt-1 break-words">
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}

function SeverityPill({
  severity,
}: {
  severity: "critical" | "warning" | "info";
}) {
  const map = {
    critical: "bg-red-100 text-red-800",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${map[severity]}`}
    >
      {severity}
    </span>
  );
}

function StatusPill({ status }: { status: "firing" | "recovered" }) {
  return status === "firing" ? (
    <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white px-2 py-0.5 rounded">
      Firing
    </span>
  ) : (
    <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded">
      Recovered
    </span>
  );
}

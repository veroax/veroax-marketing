// POST /api/admin/test-alert
// Manual trigger that fires a sample alert email to every recipient
// in ADMIN_ALERT_EMAILS. Used from the "Send test alert" button on
// /admin/alerts to verify the wiring before a real failure occurs.
//
// Bypasses cooldown intentionally so repeated tests always send.

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require";
import { notifyAlert } from "@/lib/server/alerting";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const result = await notifyAlert({
    alert_key: `manual.test_alert.${Date.now()}`, // unique key bypasses cooldown
    severity: "info",
    status: "firing",
    subject: "Test alert from /admin/alerts",
    body: `This is a manual test of the Veroax alerting system. If you are reading this, your email is configured correctly to receive alerts.\n\nTriggered by: ${auth.user.email ?? auth.user.id}\nAt: ${new Date().toISOString()}\n\nReal alerts only fire on actual problems (synthetic heartbeat failures, stale-sweep batches, etc.) and respect a 4-hour cooldown so you don't get spammed during a sustained outage.`,
    metadata: {
      triggered_by_email: auth.user.email,
      triggered_by_user_id: auth.user.id,
    },
  });

  // If the form was the trigger (HTML form submit), redirect back to
  // the alerts page so the founder sees the new row immediately.
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const url = new URL("/admin/alerts", request.url);
    if (!result.sent) {
      url.searchParams.set("error", result.reason);
      if (result.detail) url.searchParams.set("detail", result.detail);
    } else {
      url.searchParams.set("sent", "1");
    }
    redirect(url.toString());
  }

  return NextResponse.json(result);
}

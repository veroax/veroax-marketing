// POST /api/admin/tasks/[id]/toggle
//
// Site-admin action: flip a task's is_done state, stamp
// completed_at + completed_by on completion, write an audit_log
// entry so we have a tamper-evident record of what got marked done
// and when.
//
// Toggling a completed task back to undone clears completed_at +
// completed_by (it's a "I marked this done by mistake" undo) but
// still writes an audit_log entry tagged 'task.uncompleted'.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  // Site-admin only.
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("is_admin, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!(callerProfile as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json(
      { error: "Site admin access required." },
      { status: 403 },
    );
  }

  // Read current state so we know whether we're checking or unchecking.
  const { data: existing, error: readErr } = await admin
    .from("tasks")
    .select("id, title, is_done")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const task = existing as { id: string; title: string; is_done: boolean };

  const nowDoing = !task.is_done;
  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = {
    is_done: nowDoing,
    completed_at: nowDoing ? nowIso : null,
    completed_by: nowDoing ? user.id : null,
  };

  const { error: updErr } = await admin
    .from("tasks")
    .update(update)
    .eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { error: updErr.message ?? "Failed to update task." },
      { status: 500 },
    );
  }

  // Audit trail. Both directions are logged so the founder can see
  // the full history of toggles per task if ever needed.
  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: nowDoing ? "task.completed" : "task.uncompleted",
      metadata: {
        task_id: task.id,
        task_title: task.title.slice(0, 200),
        actor_email:
          (callerProfile as { email?: string } | null)?.email ?? null,
      },
    });
  } catch (err) {
    console.error("[tasks/toggle] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    is_done: nowDoing,
    completed_at: nowDoing ? nowIso : null,
  });
}

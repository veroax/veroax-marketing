// PATCH /api/admin/tasks/[id]   edit title / body / category / owner
// DELETE /api/admin/tasks/[id]  remove a task entirely

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

const VALID_CATEGORIES = ["now", "beta", "launch", "deferred", "polish"];
const VALID_OWNERS = ["you", "me", "either"];

type Body = {
  title?: string;
  body?: string | null;
  claude_prompt?: string | null;
  category?: string;
  owner?: string;
  sort_order?: number;
};

async function gateAsAdmin() {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const { user } = auth;
  const admin = createServiceRoleClient();
  return { ok: true as const, user, admin };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const gate = await gateAsAdmin();
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => ({}))) as Body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (t) update.title = t.slice(0, 200);
  }
  if ("body" in body) {
    update.body =
      typeof body.body === "string" && body.body.trim()
        ? body.body.trim().slice(0, 10_000)
        : null;
  }
  if ("claude_prompt" in body) {
    update.claude_prompt =
      typeof body.claude_prompt === "string" && body.claude_prompt.trim()
        ? body.claude_prompt.trim().slice(0, 20_000)
        : null;
  }
  if (body.category && VALID_CATEGORIES.includes(body.category)) {
    update.category = body.category;
  }
  if (body.owner && VALID_OWNERS.includes(body.owner)) {
    update.owner = body.owner;
  }
  if (typeof body.sort_order === "number" && body.sort_order >= 0) {
    update.sort_order = Math.floor(body.sort_order);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update." },
      { status: 400 },
    );
  }

  const { error } = await gate.admin
    .from("tasks")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to update task." },
      { status: 500 },
    );
  }

  try {
    await gate.admin.from("audit_log").insert({
      user_id: gate.user.id,
      event_type: "task.edited",
      metadata: {
        task_id: id,
        fields_changed: Object.keys(update),
      },
    });
  } catch (err) {
    console.error("[tasks/edit] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const gate = await gateAsAdmin();
  if (!gate.ok) return gate.response;

  // Snapshot the task before deletion so the audit log retains the
  // title (the row itself is about to vanish).
  const { data: row } = await gate.admin
    .from("tasks")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  const { error } = await gate.admin.from("tasks").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to delete task." },
      { status: 500 },
    );
  }

  try {
    await gate.admin.from("audit_log").insert({
      user_id: gate.user.id,
      event_type: "task.deleted",
      metadata: {
        task_id: id,
        title:
          (row as { title?: string } | null)?.title?.slice(0, 200) ?? null,
      },
    });
  } catch (err) {
    console.error("[tasks/delete] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}

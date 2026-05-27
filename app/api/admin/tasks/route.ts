// POST /api/admin/tasks
//
// Create a new task. Used by the "Add task" form on /admin/tasks.
// Body: { title, body?, category, owner, sort_order? }

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

type Body = {
  title?: string;
  body?: string | null;
  category?: string;
  owner?: string;
  sort_order?: number;
};

const VALID_CATEGORIES = ["now", "beta", "launch", "deferred", "polish"];
const VALID_OWNERS = ["you", "me", "either"];

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!(callerProfile as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json(
      { error: "Site admin access required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const detail =
    typeof body.body === "string" && body.body.trim()
      ? body.body.trim().slice(0, 10_000)
      : null;
  const category =
    typeof body.category === "string" && VALID_CATEGORIES.includes(body.category)
      ? body.category
      : null;
  const owner =
    typeof body.owner === "string" && VALID_OWNERS.includes(body.owner)
      ? body.owner
      : null;

  if (!title) {
    return NextResponse.json(
      { error: "Title is required." },
      { status: 400 },
    );
  }
  if (!category) {
    return NextResponse.json(
      { error: "Category is required (now, beta, launch, deferred, polish)." },
      { status: 400 },
    );
  }
  if (!owner) {
    return NextResponse.json(
      { error: "Owner is required (you, me, either)." },
      { status: 400 },
    );
  }

  // Default sort_order: end of the category (max + 10) so new tasks
  // land at the bottom unless explicitly placed.
  let sortOrder =
    typeof body.sort_order === "number" && body.sort_order >= 0
      ? Math.floor(body.sort_order)
      : null;
  if (sortOrder === null) {
    const { data: maxRow } = await admin
      .from("tasks")
      .select("sort_order")
      .eq("category", category)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder =
      ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  }

  const { data: row, error: insErr } = await admin
    .from("tasks")
    .insert({
      title,
      body: detail,
      category,
      owner,
      sort_order: sortOrder,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create task." },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "task.created",
      metadata: {
        task_id: (row as { id: string }).id,
        title: title.slice(0, 200),
        category,
        owner,
      },
    });
  } catch (err) {
    console.error("[tasks/create] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true, id: (row as { id: string }).id });
}

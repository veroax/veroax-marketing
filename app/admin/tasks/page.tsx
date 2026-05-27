// /admin/tasks
//
// Web-UI version of TODO.md. Tasks live in public.tasks; the founder
// checks them off here. Each row is collapsible: click the title and
// the markdown-rendered body expands inline. Checkbox marks the task
// done, stamps completed_at, and writes a task.completed audit_log
// entry.
//
// Categories displayed in this fixed order:
//   now      Right now (this week)
//   beta     Before first beta customer
//   launch   Before public launch
//   deferred Deferred until real users
//   polish   Long-tail polish
//
// Completed tasks fold into a "Completed" section at the bottom by
// default; can be toggled via ?show_done=1 if you want them mixed in.

import { createServiceRoleClient } from "@/lib/supabase/server";
import { TaskList } from "./_components/TaskList";
import { NewTaskForm } from "./_components/NewTaskForm";

export const metadata = {
  title: "Tasks, Veroax admin",
};

type Task = {
  id: string;
  title: string;
  body: string | null;
  claude_prompt: string | null;
  category: "now" | "beta" | "launch" | "deferred" | "polish";
  owner: "you" | "me" | "either";
  sort_order: number;
  is_done: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
};

const CATEGORY_LABELS: Record<Task["category"], { label: string; tagline: string; tone: string }> = {
  now: {
    label: "Right now",
    tagline: "This week. Bug fixes, signup tests, GA verification, PAT rotation.",
    tone: "text-red-700",
  },
  beta: {
    label: "Before first beta customer",
    tagline: "End-to-end brokerage walk, Resend DNS, legal review, trademark.",
    tone: "text-amber-700",
  },
  launch: {
    label: "Before public launch",
    tagline: "GSC, Google Business Profile, blog posts, demo + help videos.",
    tone: "text-emerald-700",
  },
  deferred: {
    label: "Deferred until real users",
    tagline: "PDF gate, DRE re-verify cron, roster controls, analytics widget.",
    tone: "text-indigo-700",
  },
  polish: {
    label: "Long-tail polish",
    tagline: "Refactors, alt text, code-quality cleanup. No urgency.",
    tone: "text-slate-600",
  },
};

const CATEGORY_ORDER: Task["category"][] = [
  "now",
  "beta",
  "launch",
  "deferred",
  "polish",
];

export default async function AdminTasksPage() {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("tasks")
    .select(
      "id, title, body, claude_prompt, category, owner, sort_order, is_done, completed_at, completed_by, created_at",
    )
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-3">
          Could not load tasks: {error.message}. Migration 0024 may not
          be applied yet. Run it in Supabase, then refresh.
        </p>
      </div>
    );
  }

  const allTasks = (data ?? []) as Task[];

  // Bucket open vs completed. Completed go to a fold-out section at
  // the bottom so the active list stays focused on what's pending.
  const openByCategory = new Map<Task["category"], Task[]>();
  const completed: Task[] = [];
  for (const t of allTasks) {
    if (t.is_done) {
      completed.push(t);
    } else {
      const bucket = openByCategory.get(t.category) ?? [];
      bucket.push(t);
      openByCategory.set(t.category, bucket);
    }
  }
  // Sort completed by completion timestamp, newest first.
  completed.sort((a, b) => {
    const aT = a.completed_at ? Date.parse(a.completed_at) : 0;
    const bT = b.completed_at ? Date.parse(b.completed_at) : 0;
    return bT - aT;
  });

  const openCount = allTasks.length - completed.length;

  // Resolve email for the "completed by" display so we render the
  // founder's email next to each closed task instead of a uuid.
  const completedByIds = Array.from(
    new Set(
      completed
        .map((t) => t.completed_by)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: profilesData } =
    completedByIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", completedByIds)
      : { data: [] };
  const profileMap = new Map<
    string,
    { email: string; full_name: string | null }
  >();
  for (const p of (profilesData ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
  }>) {
    profileMap.set(p.id, { email: p.email, full_name: p.full_name });
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
            <p className="text-sm text-slate-500 mt-1">
              {openCount} open, {completed.length} completed. Click a
              task to see detail. Completion times are logged.
            </p>
          </div>
        </div>
      </header>

      {/* Active tasks, grouped by category */}
      {CATEGORY_ORDER.map((cat) => {
        const tasks = openByCategory.get(cat) ?? [];
        if (tasks.length === 0) return null;
        const cfg = CATEGORY_LABELS[cat];
        return (
          <section key={cat}>
            <div className="mb-3">
              <h2 className={`text-base font-bold ${cfg.tone}`}>
                {cfg.label}{" "}
                <span className="text-slate-400 font-normal">
                  ({tasks.length})
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{cfg.tagline}</p>
            </div>
            <TaskList tasks={tasks} profileMap={null} />
          </section>
        );
      })}

      {openCount === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <p className="text-emerald-800 font-semibold">
            All open tasks complete.
          </p>
          <p className="text-sm text-emerald-700 mt-1">
            Add a new task below or scroll down to review what is done.
          </p>
        </div>
      ) : null}

      {/* Completed tasks */}
      {completed.length > 0 ? (
        <section>
          <details className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <summary className="px-5 py-4 cursor-pointer hover:bg-slate-50 select-none">
              <span className="text-base font-bold text-slate-700">
                Completed{" "}
                <span className="text-slate-400 font-normal">
                  ({completed.length})
                </span>
              </span>
              <span className="text-xs text-slate-500 ml-2">
                click to expand
              </span>
            </summary>
            <div className="px-3 pb-3 pt-1 border-t border-slate-100">
              <TaskList tasks={completed} profileMap={profileMap} />
            </div>
          </details>
        </section>
      ) : null}

      {/* New task form */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">
          Add a task
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <NewTaskForm />
        </div>
      </section>
    </div>
  );
}

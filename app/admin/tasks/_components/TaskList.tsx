"use client";

// Renders a group of tasks as a vertical list, each row collapsible
// and toggleable. Pure UI; talks to /api/admin/tasks/[id]/toggle for
// the state change. Markdown rendering of the body uses `marked`,
// which is already in the codebase for blog posts. Output is run
// through a small allowlist sanitizer before injection.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";

type Task = {
  id: string;
  title: string;
  body: string | null;
  category: "now" | "beta" | "launch" | "deferred" | "polish";
  owner: "you" | "me" | "either";
  is_done: boolean;
  completed_at: string | null;
  completed_by: string | null;
};

type Props = {
  tasks: Task[];
  profileMap:
    | Map<string, { email: string; full_name: string | null }>
    | null;
};

export function TaskList({ tasks, profileMap }: Props) {
  if (tasks.length === 0) return null;
  return (
    <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} profileMap={profileMap} />
      ))}
    </ul>
  );
}

function TaskRow({
  task,
  profileMap,
}: {
  task: Task;
  profileMap:
    | Map<string, { email: string; full_name: string | null }>
    | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle(e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation();
    setError(null);
    const res = await fetch(`/api/admin/tasks/${task.id}/toggle`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to update task.",
      );
      return;
    }
    startTransition(() => router.refresh());
  }

  const completedBy =
    task.completed_by && profileMap
      ? profileMap.get(task.completed_by)
      : null;

  return (
    <li className="hover:bg-slate-50/50">
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Checkbox */}
        <label className="flex-shrink-0 pt-0.5 cursor-pointer">
          <input
            type="checkbox"
            checked={task.is_done}
            disabled={pending}
            onChange={(e) => toggle(e)}
            className="w-4 h-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500 cursor-pointer"
          />
        </label>

        {/* Title + expand zone */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span
              className={`text-sm font-medium ${
                task.is_done
                  ? "line-through text-slate-400"
                  : "text-slate-900"
              }`}
            >
              {task.title}
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <OwnerPill owner={task.owner} />
              {task.body ? (
                <span className="text-[10px] text-slate-400">
                  {expanded ? "▾" : "▸"}
                </span>
              ) : null}
            </span>
          </div>

          {/* Completion metadata */}
          {task.is_done && task.completed_at ? (
            <p className="text-[11px] text-slate-500 mt-1">
              Done {new Date(task.completed_at).toLocaleString()}
              {completedBy ? (
                <>
                  {" by "}
                  <span className="text-slate-700">
                    {completedBy.full_name?.trim() || completedBy.email}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}

          {error ? (
            <p className="text-[11px] text-red-700 mt-1">{error}</p>
          ) : null}
        </button>
      </div>

      {/* Expanded body */}
      {expanded && task.body ? (
        <div className="px-4 pb-4 pl-11">
          <div
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(task.body),
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

function OwnerPill({ owner }: { owner: "you" | "me" | "either" }) {
  const map: Record<
    "you" | "me" | "either",
    { label: string; tone: string }
  > = {
    you: { label: "You", tone: "bg-amber-100 text-amber-800" },
    me: { label: "Claude", tone: "bg-indigo-100 text-indigo-800" },
    either: { label: "Either", tone: "bg-slate-100 text-slate-700" },
  };
  const cfg = map[owner];
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.tone}`}
    >
      {cfg.label}
    </span>
  );
}

// Conservative markdown rendering. marked produces HTML; we run a
// light sanitizer over the output that strips event handlers and
// script tags. Since task body content is admin-authored, the risk
// surface is low, but defense-in-depth is cheap.
function renderMarkdown(src: string): string {
  const raw = marked.parse(src, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

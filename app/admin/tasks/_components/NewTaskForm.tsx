"use client";

// Compact form to add a new task. Posts to /api/admin/tasks and
// refreshes the page so the new row shows up immediately.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NewTaskForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [claudePrompt, setClaudePrompt] = useState("");
  const [category, setCategory] = useState<
    "now" | "beta" | "launch" | "deferred" | "polish"
  >("now");
  const [owner, setOwner] = useState<"you" | "me" | "either">("you");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const res = await fetch("/api/admin/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim() || null,
        claude_prompt: claudePrompt.trim() || null,
        category,
        owner,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to create task.",
      );
      return;
    }
    setTitle("");
    setBody("");
    setClaudePrompt("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title (short, action-oriented)"
        required
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Optional detail. Supports markdown."
        rows={3}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
      />
      <textarea
        value={claudePrompt}
        onChange={(e) => setClaudePrompt(e.target.value)}
        placeholder="Optional prompt for Claude (only relevant for owner=Claude). Self-contained: include file paths, code snippets, and the desired change. Will be exposed as a 'Copy prompt' button on the task row."
        rows={4}
        className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono bg-indigo-50/30"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
            Category
          </span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as typeof category)
            }
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="now">Right now</option>
            <option value="beta">Before first beta customer</option>
            <option value="launch">Before public launch</option>
            <option value="deferred">Deferred</option>
            <option value="polish">Polish</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
            Owner
          </span>
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value as typeof owner)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="you">You</option>
            <option value="me">Claude</option>
            <option value="either">Either</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="ml-auto bg-indigo-700 text-white font-semibold text-sm px-5 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add task"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      ) : null}
    </form>
  );
}

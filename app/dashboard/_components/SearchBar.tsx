"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// Search input that pushes ?q=... onto the URL. The parent server
// component reads searchParams to filter the DB query. We keep
// the existing sort params (?sort, ?dir) when the agent types so
// search doesn't reset their sort preference.

type Props = {
  initialQuery: string;
  placeholder?: string;
};

export function SearchBar({ initialQuery, placeholder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initialQuery);

  // Keep input in sync if the user navigates (e.g. clicks Archive in
  // the sidebar and the URL changes underneath).
  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    const trimmed = value.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    router.push(`${pathname}?${next.toString()}`);
  }

  function clear() {
    setValue("");
    const next = new URLSearchParams(params.toString());
    next.delete("q");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 max-w-md">
      <div className="relative flex-1">
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? "Search by address or client…"}
          className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
      <button
        type="submit"
        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm"
      >
        Search
      </button>
    </form>
  );
}

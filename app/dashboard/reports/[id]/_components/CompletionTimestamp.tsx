"use client";

import { useEffect, useState } from "react";

// Renders an ISO timestamp in the BROWSER's local timezone. The
// surrounding page is a server component, so server-side rendering
// would freeze the time at whatever the Vercel function's timezone
// is (UTC) — which is technically correct but unfriendly for an
// agent skimming "Analysis completed Mar 14 at 2:47 PM" against
// their own clock.
//
// SSR shows the ISO string raw to avoid hydration mismatch flicker;
// the useEffect re-renders into the user's locale on the client tick.

type Props = {
  iso: string;
  // Optional label prefix, default "Analysis completed".
  label?: string;
};

export function CompletionTimestamp({
  iso,
  label = "Analysis completed",
}: Props) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      setFormatted(iso);
      return;
    }
    setFormatted(
      d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }, [iso]);

  return (
    <span>
      <span className="font-semibold text-slate-700">{label}</span>{" "}
      {formatted ?? iso}
    </span>
  );
}

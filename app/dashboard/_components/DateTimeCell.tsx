"use client";

import { useEffect, useState } from "react";

// Renders an ISO timestamp in the BROWSER's local timezone. Same
// pattern as CompletionTimestamp from the report-detail page ,
// SSR shows the raw ISO string to avoid hydration mismatch flicker;
// the client useEffect tick re-renders into the agent's actual
// timezone with date + short time.

type Props = {
  iso: string;
};

export function DateTimeCell({ iso }: Props) {
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

  return <span>{formatted ?? iso.slice(0, 10)}</span>;
}

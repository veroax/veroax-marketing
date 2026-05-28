// Time-formatting helpers, default to Pacific Time.
//
// Veroax is California-focused: every agent, every property, every
// audit event happens in or near Pacific time. The Vercel
// serverless runtime is UTC by default, which means
// toLocaleString() without a timeZone option renders UTC timestamps
// to anyone reading server-rendered pages (admin audit log, admin
// reports list, PDF reports, etc.). That made "8:30 AM completed"
// show as "4:30 PM" to anyone in California reading the dashboard,
// which was confusing and wrong.
//
// Use these helpers anywhere server code formats a date for a
// human to read. Client-side components that run in the user's
// browser (DateTimeCell, CompletionTimestamp) don't need this,
// the browser's own toLocaleString already uses the user's local
// time, which for California agents is the same answer.
//
// When/if Veroax launches in other states, the helpers can grow
// a state-specific override. For now they default to
// America/Los_Angeles unambiguously.

const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function formatLocalDateTime(
  input: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    timeZone: DEFAULT_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
    ...opts,
  });
}

export function formatLocalDate(
  input: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    timeZone: DEFAULT_TIME_ZONE,
    ...opts,
  });
}

// Mostly for compact short displays in admin tables (e.g.,
// "Nov 7" or "5/27/2026"). Optional time when the caller wants
// "5/27/26, 8:12 PM" style.
export function formatLocalShort(
  input: string | Date | null | undefined,
  withTime = false,
): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (!Number.isFinite(date.getTime())) return "";
  if (withTime) {
    return date.toLocaleString("en-US", {
      timeZone: DEFAULT_TIME_ZONE,
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return date.toLocaleDateString("en-US", {
    timeZone: DEFAULT_TIME_ZONE,
  });
}

export { DEFAULT_TIME_ZONE };

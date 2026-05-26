// Compact pill that summarizes an agent's DRE verification status.
// Used in two places:
//   - /dashboard/settings (agent sees their own pill next to the
//     DRE license field, so they get a confirmation that their
//     license verified)
//   - /admin/users + /admin/users/[id] (site admin sees the pill
//     alongside every agent so unverified accounts stand out)
//
// Pure presentation, no hooks; safe to render in server components.

export type DreStatusEnum =
  | "verified"
  | "mismatch"
  | "inactive"
  | "expired"
  | "suspended"
  | "revoked"
  | "not_found"
  | "error"
  | "pending"
  | null
  | undefined;

const STATUS_MAP: Record<
  Exclude<DreStatusEnum, null | undefined>,
  { label: string; tone: string; description: string }
> = {
  verified: {
    label: "DRE verified",
    tone: "bg-emerald-100 text-emerald-800 border-emerald-300",
    description: "License is active on the CA DRE site and the name matches.",
  },
  mismatch: {
    label: "Name mismatch",
    tone: "bg-amber-100 text-amber-900 border-amber-300",
    description:
      "License is active on the CA DRE site but the name on file doesn't match. Update the full name in settings, then save.",
  },
  inactive: {
    label: "DRE inactive",
    tone: "bg-red-100 text-red-800 border-red-300",
    description: "License status on the CA DRE site is not Active.",
  },
  expired: {
    label: "DRE expired",
    tone: "bg-red-100 text-red-800 border-red-300",
    description: "License is expired on the CA DRE site.",
  },
  suspended: {
    label: "DRE suspended",
    tone: "bg-red-100 text-red-800 border-red-300",
    description: "License is suspended on the CA DRE site.",
  },
  revoked: {
    label: "DRE revoked",
    tone: "bg-red-200 text-red-900 border-red-400",
    description: "License is revoked on the CA DRE site.",
  },
  not_found: {
    label: "DRE not found",
    tone: "bg-red-100 text-red-800 border-red-300",
    description:
      "No license with this number on the CA DRE site. Re-check the number for typos.",
  },
  error: {
    label: "Check failed",
    tone: "bg-slate-200 text-slate-700 border-slate-300",
    description:
      "Could not reach the CA DRE site, or the response was unparseable. We'll try again on next save.",
  },
  pending: {
    label: "Checking",
    tone: "bg-slate-100 text-slate-600 border-slate-300",
    description: "DRE verification is in flight.",
  },
};

export function DreVerificationPill({
  status,
  className,
  showDescription,
}: {
  status: DreStatusEnum;
  className?: string;
  showDescription?: boolean;
}) {
  // Null/undefined: nothing has been checked yet. Render the
  // pending-style pill so the UI still communicates the situation.
  const cfg = status
    ? STATUS_MAP[status]
    : {
        label: "Not yet verified",
        tone: "bg-slate-100 text-slate-600 border-slate-300",
        description:
          "DRE check has not run yet. Save your settings to trigger one.",
      };
  return (
    <span className={className}>
      <span
        className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${cfg.tone}`}
        title={cfg.description}
      >
        {cfg.label}
      </span>
      {showDescription ? (
        <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
          {cfg.description}
        </span>
      ) : null}
    </span>
  );
}

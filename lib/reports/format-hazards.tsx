import React from "react";

/**
 * Format a hazard_zone_summary string with IN segments rendered in
 * bold. The hazard_zone_summary is a semicolon-delimited IN / NOT IN
 * inventory like:
 *
 *   "NOT IN FEMA flood zone; NOT IN earthquake fault zone;
 *    IN Seismic Hazard Zone (Liquefaction); NOT IN landslide zone"
 *
 * IN segments mean the property IS subject to that hazard, the
 * agent's eye should land on those first. NOT IN segments stay
 * regular weight; they're context (which hazards don't apply).
 *
 * Used by the public report, dashboard report page, admin report
 * page, and the PDF cover (via the PDF-specific variant below).
 */
export function FormattedHazardSummary({
  summary,
  className,
}: {
  summary: string;
  className?: string;
}) {
  const segments = summary
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        // "NOT IN ..." is regular weight; bare "IN ..." is the
        // hazard the property IS subject to, render bold.
        const isInHazard = /^in\s+/i.test(seg) && !/^not\s+in\b/i.test(seg);
        const sep = i < segments.length - 1 ? "; " : "";
        return (
          <React.Fragment key={i}>
            {isInHazard ? <strong>{seg}</strong> : <span>{seg}</span>}
            {sep}
          </React.Fragment>
        );
      })}
    </span>
  );
}

/**
 * Split a hazard_zone_summary into structured segments. Useful when
 * a renderer (e.g., the PDF) can't take JSX and needs to build its
 * own bolding logic. `inHazard=true` means this segment describes a
 * hazard the property IS subject to.
 */
export function splitHazardSummary(
  summary: string,
): Array<{ text: string; inHazard: boolean }> {
  return summary
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => ({
      text: seg,
      inHazard: /^in\s+/i.test(seg) && !/^not\s+in\b/i.test(seg),
    }));
}

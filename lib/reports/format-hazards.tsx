import React from "react";

/**
 * Format a hazard_zone_summary string with positive (NOT IN) segments
 * rendered in bold. The hazard_zone_summary is a semicolon-delimited
 * IN / NOT IN inventory like:
 *
 *   "NOT IN FEMA flood zone; NOT IN earthquake fault zone;
 *    IN Seismic Hazard Zone (Liquefaction); NOT IN landslide zone"
 *
 * NOT IN segments are good news (the property is not in a hazard
 * zone) and get bold styling to help the reader's eye land on the
 * positives. IN segments stay regular weight; their severity is
 * communicated by the rest of the section's content.
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
        const isPositive = /^not\s+in\b/i.test(seg);
        const sep = i < segments.length - 1 ? "; " : "";
        return (
          <React.Fragment key={i}>
            {isPositive ? <strong>{seg}</strong> : <span>{seg}</span>}
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
 * own bolding logic.
 */
export function splitHazardSummary(
  summary: string,
): Array<{ text: string; positive: boolean }> {
  return summary
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => ({
      text: seg,
      positive: /^not\s+in\b/i.test(seg),
    }));
}

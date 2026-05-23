// Helpers for writing safe metadata into audit_log rows.
//
// PII RULE: audit_log must NEVER contain buyer / seller / lender / client
// names, financial details, or property addresses. Filenames are an
// indirect leak vector because California disclosure packages are
// routinely named "Smith_TDS.pdf", "123_Main_St_SPQ.pdf", or include
// the listing agent's brokerage. This module strips the human-readable
// filename and returns a safe digest that still supports de-duplication
// in audit replay (same name on the same user yields the same hash).
//
// If you ever need to map a hash back to a filename for support, the
// customer can compute the SHA-256 of their own filename and match it.
// The audit log itself stays clean.

import { createHash } from "node:crypto";

/**
 * Produce safe-to-log metadata for a single file. Replaces the raw
 * filename with a 12-character SHA-256 prefix (~48 bits, plenty of
 * collision resistance for any one user's report) plus the lowercase
 * extension. Drop into an audit_log.metadata object instead of the
 * raw filename.
 *
 * Example:
 *   const safe = safeFileMetadata("Smith_TDS.pdf");
 *   // { filename_sha256_12: "9d3c4f0a7b2e", extension: "pdf" }
 */
export function safeFileMetadata(name: string | null | undefined): {
  filename_sha256_12: string;
  extension: string | null;
} {
  const trimmed = (name || "").trim();
  const dotIdx = trimmed.lastIndexOf(".");
  const extension =
    dotIdx > 0 && dotIdx < trimmed.length - 1
      ? trimmed.slice(dotIdx + 1).toLowerCase().slice(0, 12)
      : null;
  const sha = createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
  return { filename_sha256_12: sha, extension };
}

/**
 * Same as safeFileMetadata but for arrays of filenames. Returns a
 * parallel array of safe digests. Useful for `added_filenames`-style
 * fields.
 */
export function safeFileMetadataList(
  names: ReadonlyArray<string | null | undefined>,
): Array<{ filename_sha256_12: string; extension: string | null }> {
  return names.map(safeFileMetadata);
}

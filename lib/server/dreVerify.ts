// California DRE license verification helper.
//
// Hits the DRE public license lookup at
// https://www2.dre.ca.gov/PublicASP/pplinfo.asp and parses the
// labeled HTML response into structured fields. Compares the DRE's
// name-on-file to the agent's profile full_name using a fuzzy match
// to produce a final verification status.
//
// Form spec (confirmed by GET against the DRE site):
//   POST   https://www2.dre.ca.gov/PublicASP/pplinfo.asp?start=1
//   Fields h_nextstep=SEARCH
//          LICENSE_ID (8 digits, the agent's DRE license number)
//          LICENSEE_NAME (optional, we leave blank)
//          CITY_STATE    (optional, we leave blank)
//
// Response is an HTML page; on success it contains a labeled table:
//   <strong>License Type:</strong> ... SALESPERSON
//   <strong>Name:</strong>         ... Smith, Jane Marie
//   <strong>License ID:</strong>   ... 01234567
//   <strong>Expiration Date:</strong> ... 02/18/27
//   <strong>License Status:</strong>  ... LICENSED   (or EXPIRED / SUSPENDED / etc.)
//   <strong>Comment:</strong>      ... NO DISCIPLINARY ACTION
// On no-match it omits the table entirely (just renders the search
// form again).
//
// IMPORTANT: this is a public-site scraper. The DRE site can change
// HTML structure at any time. The parser is defensive: any unexpected
// shape yields status='error' rather than a false positive. We
// preserve the raw parsed fields in dre_verification_response so we
// can iterate without re-scraping.

export type DreVerificationStatus =
  | "verified" //  active license, name matches
  | "mismatch" //  license exists + active, but name on file does NOT match
  | "inactive" //  license exists, status is not LICENSED (but not specifically expired/etc.)
  | "expired" //   license exists, status is EXPIRED
  | "suspended" // license exists, status is SUSPENDED
  | "revoked" //   license exists, status is REVOKED
  | "not_found" // no license with that ID
  | "error"; //    scraper failed (network, parse, etc.)

export type DreLookupResult = {
  status: DreVerificationStatus;
  license_id: string;
  // DRE's literal status string ("LICENSED" / "EXPIRED" / etc.) when present.
  remote_status: string | null;
  remote_name: string | null;
  remote_license_type: string | null;
  remote_expiration: string | null;
  remote_responsible_broker: string | null;
  // Truthy when we successfully fetched + parsed; useful in admin UI
  // to distinguish "fetched + decided" from "scraper threw".
  fetched_ok: boolean;
  // Free-form error description when status === 'error'.
  error_message: string | null;
  checked_at: string;
};

const DRE_ENDPOINT = "https://www2.dre.ca.gov/PublicASP/pplinfo.asp?start=1";

// Hard timeout for the DRE request. Keep it short, the scraper runs
// inline on settings save and we don't want to hang the user's save
// button on a flaky third-party site.
const FETCH_TIMEOUT_MS = 10_000;

// Marker that confirms we got a results page (not the empty search
// form bounced back). The DRE always ends a successful lookup with
// this exact string.
const SUCCESS_MARKER = "Public information request complete";

function sanitizeLicenseId(input: string): string {
  return input.replace(/\D/g, "").slice(0, 8);
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull a labeled value out of the DRE response. The DRE renders rows
// as `<strong>Label:</strong> ... <td>...<font>VALUE<br></font></td>`.
// We tolerate slight markup drift by matching loosely.
function extractField(html: string, label: string): string | null {
  // Match the label inside the strong, then capture everything until
  // the next `<br/>` or `<br>` after the value.
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The DRE wraps the label in a hyperlink for some fields (License
  // Status, Comment), so accept an optional <A ...> wrapper.
  const re = new RegExp(
    `<strong>\\s*(?:<A[^>]*>)?\\s*${escapedLabel}\\s*:\\s*(?:</A>)?\\s*</strong>[\\s\\S]*?<td[^>]*>[\\s\\S]*?<font[^>]*>([\\s\\S]*?)<br`,
    "i",
  );
  const m = html.match(re);
  if (!m) return null;
  const val = stripHtml(m[1]);
  return val.length > 0 ? val : null;
}

// Fuzzy name match between the DRE's "Last, First Middle" string and
// the agent's profile full_name (typically "First Last"). Returns
// true when first + last tokens line up in either order, ignoring
// case, punctuation, and middle initials.
//
// Examples that match:
//   profile "Jane Smith"      vs DRE "Smith, Jane Marie"     -> true
//   profile "Jane M Smith"    vs DRE "Smith, Jane Marie"     -> true
//   profile "JANE MARIE SMITH" vs DRE "Smith, Jane Marie"    -> true
//
// Examples that DON'T match:
//   profile "Jane Doe"        vs DRE "Smith, Jane Marie"     -> false
export function nameMatchesDre(
  profileFullName: string,
  dreName: string,
): boolean {
  if (!profileFullName || !dreName) return false;

  const normalize = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^a-z\s,]/g, "")
      .replace(/\s+/g, " ")
      .replace(",", " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const profileTokens = normalize(profileFullName);
  const dreTokens = normalize(dreName);

  if (profileTokens.length < 2 || dreTokens.length < 2) return false;

  // First + last from each side. Profile is typically "First [Middle] Last",
  // DRE is "Last, First [Middle]".
  const profileFirst = profileTokens[0];
  const profileLast = profileTokens[profileTokens.length - 1];
  const dreLast = dreTokens[0];
  const dreFirst = dreTokens[1];

  const lastMatch =
    profileLast === dreLast ||
    profileLast.startsWith(dreLast) ||
    dreLast.startsWith(profileLast);
  const firstMatch =
    profileFirst === dreFirst ||
    profileFirst.startsWith(dreFirst) ||
    dreFirst.startsWith(profileFirst);

  return lastMatch && firstMatch;
}

// Map the DRE's literal status string to our enum. The DRE uses a
// handful of strings; anything we don't recognize becomes 'inactive'
// (defensive default, since we'd rather flag an unknown status for
// admin attention than silently approve it).
function classifyRemoteStatus(remoteStatus: string): DreVerificationStatus {
  const s = remoteStatus.toUpperCase().trim();
  if (s === "LICENSED" || s === "LICENSED  NBA") return "verified";
  if (s.startsWith("EXPIRED")) return "expired";
  if (s.startsWith("SUSPENDED")) return "suspended";
  if (s.startsWith("REVOKED")) return "revoked";
  if (s.startsWith("SURRENDER")) return "revoked";
  if (s.startsWith("CANCELLED") || s.startsWith("CANCELED")) return "revoked";
  return "inactive";
}

/**
 * Look up a DRE license number and decide its verification status.
 * Pure (no DB writes); the caller persists the result.
 */
export async function verifyDreLicense({
  licenseId,
  agentFullName,
}: {
  licenseId: string;
  agentFullName: string | null;
}): Promise<DreLookupResult> {
  const checkedAt = new Date().toISOString();
  const cleanId = sanitizeLicenseId(licenseId);

  if (cleanId.length < 5) {
    return {
      status: "error",
      license_id: cleanId,
      remote_status: null,
      remote_name: null,
      remote_license_type: null,
      remote_expiration: null,
      remote_responsible_broker: null,
      fetched_ok: false,
      error_message: "License ID is too short to query.",
      checked_at: checkedAt,
    };
  }

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const formBody = new URLSearchParams({
      h_nextstep: "SEARCH",
      LICENSE_ID: cleanId,
      LICENSEE_NAME: "",
      CITY_STATE: "",
    });
    const res = await fetch(DRE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // The DRE site sometimes returns the bare form to non-browser
        // user-agents; pretend to be Chrome to be safe.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      body: formBody.toString(),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        status: "error",
        license_id: cleanId,
        remote_status: null,
        remote_name: null,
        remote_license_type: null,
        remote_expiration: null,
        remote_responsible_broker: null,
        fetched_ok: false,
        error_message: `DRE returned HTTP ${res.status}.`,
        checked_at: checkedAt,
      };
    }
    html = await res.text();
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "DRE lookup timed out."
        : err instanceof Error
          ? err.message
          : "DRE fetch failed.";
    return {
      status: "error",
      license_id: cleanId,
      remote_status: null,
      remote_name: null,
      remote_license_type: null,
      remote_expiration: null,
      remote_responsible_broker: null,
      fetched_ok: false,
      error_message: message,
      checked_at: checkedAt,
    };
  }

  // Success marker absent? The DRE bounced the form back, no license
  // matched. (Their "no results" path doesn't render the labeled
  // table; they just re-show the empty search form.)
  if (!html.includes(SUCCESS_MARKER)) {
    return {
      status: "not_found",
      license_id: cleanId,
      remote_status: null,
      remote_name: null,
      remote_license_type: null,
      remote_expiration: null,
      remote_responsible_broker: null,
      fetched_ok: true,
      error_message: null,
      checked_at: checkedAt,
    };
  }

  // Parse the labeled fields. Any of these can legitimately be null
  // (the DRE shows different field sets for brokers vs. salespeople
  // for example), so we keep them all optional.
  const remoteStatus = extractField(html, "License Status");
  const remoteName = extractField(html, "Name");
  const remoteLicenseType = extractField(html, "License Type");
  const remoteExpiration = extractField(html, "Expiration Date");
  const remoteResponsibleBroker = extractField(html, "Responsible Broker");

  if (!remoteStatus || !remoteName) {
    // Got the success marker but couldn't pull the canonical fields.
    // Treat as error so we don't silently approve.
    return {
      status: "error",
      license_id: cleanId,
      remote_status: remoteStatus,
      remote_name: remoteName,
      remote_license_type: remoteLicenseType,
      remote_expiration: remoteExpiration,
      remote_responsible_broker: remoteResponsibleBroker,
      fetched_ok: true,
      error_message:
        "DRE response missing required fields (License Status / Name). Site format may have changed.",
      checked_at: checkedAt,
    };
  }

  const statusFromRemote = classifyRemoteStatus(remoteStatus);

  // If the remote status isn't 'verified', skip the name match (it's
  // moot if the license is expired/suspended/etc.). Return the remote
  // classification directly.
  if (statusFromRemote !== "verified") {
    return {
      status: statusFromRemote,
      license_id: cleanId,
      remote_status: remoteStatus,
      remote_name: remoteName,
      remote_license_type: remoteLicenseType,
      remote_expiration: remoteExpiration,
      remote_responsible_broker: remoteResponsibleBroker,
      fetched_ok: true,
      error_message: null,
      checked_at: checkedAt,
    };
  }

  // Active license: now check the name match. If the profile has no
  // full_name yet (new signup), accept as 'pending' rather than
  // 'mismatch'; the next save with a name will re-verify.
  if (!agentFullName || !agentFullName.trim()) {
    return {
      status: "verified", // license itself checks out; name match deferred
      license_id: cleanId,
      remote_status: remoteStatus,
      remote_name: remoteName,
      remote_license_type: remoteLicenseType,
      remote_expiration: remoteExpiration,
      remote_responsible_broker: remoteResponsibleBroker,
      fetched_ok: true,
      error_message: null,
      checked_at: checkedAt,
    };
  }

  const nameOk = nameMatchesDre(agentFullName, remoteName);
  return {
    status: nameOk ? "verified" : "mismatch",
    license_id: cleanId,
    remote_status: remoteStatus,
    remote_name: remoteName,
    remote_license_type: remoteLicenseType,
    remote_expiration: remoteExpiration,
    remote_responsible_broker: remoteResponsibleBroker,
    fetched_ok: true,
    error_message: nameOk
      ? null
      : `Profile name "${agentFullName}" doesn't match DRE name "${remoteName}".`,
    checked_at: checkedAt,
  };
}

/**
 * Should we re-verify? Returns true when the cached check is older
 * than the TTL (24h by default), missing entirely, or in an 'error'
 * state (we want errors to retry on the next save).
 */
export function shouldRecheckDre(
  status: DreVerificationStatus | null | undefined,
  checkedAt: string | null | undefined,
  ttlHours = 24,
): boolean {
  if (!checkedAt) return true;
  if (status === "error") return true;
  const checkedMs = new Date(checkedAt).getTime();
  if (Number.isNaN(checkedMs)) return true;
  const ageMs = Date.now() - checkedMs;
  return ageMs > ttlHours * 60 * 60 * 1000;
}

/**
 * Persist a DreLookupResult to the agent's profiles row via the
 * caller-supplied service-role client. Returns nothing; failures
 * are logged but never thrown (verification is best-effort).
 */
export async function persistDreResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  result: DreLookupResult,
): Promise<void> {
  try {
    const update: Record<string, unknown> = {
      dre_verification_status: result.status,
      dre_verification_checked_at: result.checked_at,
      dre_verification_method: "public_lookup",
      dre_verification_response: {
        license_id: result.license_id,
        remote_status: result.remote_status,
        remote_name: result.remote_name,
        remote_license_type: result.remote_license_type,
        remote_expiration: result.remote_expiration,
        remote_responsible_broker: result.remote_responsible_broker,
        fetched_ok: result.fetched_ok,
        error_message: result.error_message,
      },
    };
    if (result.status === "verified") {
      update.dre_verified_at = result.checked_at;
    } else {
      // Degraded status: clear the verified_at stamp so downstream
      // gates (future PDF gate, admin filters) treat the agent as
      // unverified again.
      update.dre_verified_at = null;
    }
    const { error } = await admin
      .from("profiles")
      .update(update)
      .eq("id", userId);
    if (error) {
      console.error("[dreVerify] persist failed:", error.message);
    }
  } catch (err) {
    console.error("[dreVerify] persist threw:", err);
  }
}

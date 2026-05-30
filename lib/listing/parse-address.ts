/**
 * Parse a Zillow / Redfin listing URL into a human-readable property
 * address. Used at report-creation time so the AnalysisRunner can
 * display "what report is running" before the focused analyzer
 * passes extract the canonical address from the documents themselves.
 *
 * Returns null when the URL doesn't match any known pattern. The
 * analyzer's downstream extraction will eventually populate the real
 * address; this helper just provides an instant placeholder.
 */

export function extractAddressFromListingUrl(
  url: string | null | undefined,
): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();

  // Zillow homedetails URL pattern:
  //   https://www.zillow.com/homedetails/{slug}/{zpid}_zpid/
  //   https://www.zillow.com/homes/{slug}/{zpid}_zpid/
  // Slug examples:
  //   560-Saint-Remi-Ter-1-Sunnyvale-CA-94085
  //   1234-Oak-St-San-Jose-CA-95123
  const zillowMatch = trimmed.match(
    /zillow\.com\/(?:homedetails|homes)\/([^/]+)\/\d+_zpid/i,
  );
  if (zillowMatch && zillowMatch[1]) {
    const formatted = formatSlugAddress(zillowMatch[1]);
    if (formatted) return formatted;
  }

  // Redfin URL pattern:
  //   https://www.redfin.com/CA/Sunnyvale/560-Saint-Remi-Ter-94085/unit-1/home/...
  // The city is in path segment 3, ZIP at end of segment 4.
  const redfinMatch = trimmed.match(
    /redfin\.com\/([A-Z]{2})\/([^/]+)\/([^/]+?)-(\d{5})(?:\/|$)/i,
  );
  if (redfinMatch) {
    const state = redfinMatch[1];
    const city = redfinMatch[2].replace(/-/g, " ");
    const streetRaw = redfinMatch[3];
    const zip = redfinMatch[4];
    const street = streetRaw.replace(/-/g, " ");
    return `${street}, ${city}, ${state} ${zip}`.trim();
  }

  return null;
}

/**
 * Convert a Zillow address slug into "Street, City, State ZIP" format
 * with best-effort comma placement. Zillow slugs end in either
 *   {state-abbr}-{zip}                         (most common)
 *   {state-abbr}-{zip-prefix}-{zip-suffix}     (occasional)
 * and the city is some number of tokens before the state. The street
 * is everything before the city.
 *
 * Heuristic: anchor on the state token (two-letter all-caps after
 * dashing, or known California sentinel "CA"). The token immediately
 * before the state is the LAST city word. Step backwards through
 * tokens; if a token has internal capitalization (e.g., "San" in "San
 * Jose") OR is short (3 chars or less), it's likely part of a
 * multi-word city. Cap at 3 city tokens because California city names
 * "Los Angeles" / "San Francisco" / "San Luis Obispo" / "Half Moon
 * Bay" cover the relevant cases.
 *
 * For California-only properties this is reliable. For other states
 * we just return the slug with dashes replaced by spaces (still a
 * useful placeholder).
 */
function formatSlugAddress(slug: string): string {
  const tokens = slug.split("-").filter((t) => t.length > 0);
  if (tokens.length < 3) return slug.replace(/-/g, " ");

  // Find the state token, work back from the end.
  const stateIdx = findStateIndex(tokens);
  if (stateIdx < 0) {
    // Unknown state pattern; return dash-cleaned slug as fallback.
    return tokens.join(" ");
  }

  // Tokens after state = ZIP (1 or 2 segments).
  const zipTokens = tokens.slice(stateIdx + 1);
  const zip = zipTokens.join(" ");
  const state = tokens[stateIdx];

  // Tokens before state = street + city. Heuristic: California city
  // names are at most 3 tokens (San Luis Obispo, Half Moon Bay). Step
  // backwards from the state token, accumulating city tokens until
  // we hit a token that's clearly a street suffix (St, Ave, Blvd, Ct,
  // Ter, Ln, Dr, Way, Pl, Cir, Pkwy, Trl, Rd, Hwy) or a number unit
  // suffix like "1" or "Apt".
  const STREET_SUFFIXES = new Set([
    "St",
    "Street",
    "Ave",
    "Avenue",
    "Blvd",
    "Boulevard",
    "Ct",
    "Court",
    "Ter",
    "Terrace",
    "Ln",
    "Lane",
    "Dr",
    "Drive",
    "Way",
    "Pl",
    "Place",
    "Cir",
    "Circle",
    "Pkwy",
    "Parkway",
    "Trl",
    "Trail",
    "Rd",
    "Road",
    "Hwy",
    "Highway",
    "Loop",
    "Plaza",
    "Sq",
    "Square",
    "Walk",
    "Row",
    "Mall",
    "Path",
  ]);
  // Single-letter or single-digit tokens like the unit number "1" in
  // "560 Saint Remi Ter 1 Sunnyvale CA 94085" should attach to the
  // street, not start the city. We treat them as part of the street.
  const cityTokens: string[] = [];
  let cityStart = stateIdx;
  for (let i = stateIdx - 1; i >= 0 && cityTokens.length < 3; i--) {
    const tok = tokens[i];
    if (STREET_SUFFIXES.has(tok)) {
      // hit a street suffix: everything after this is the city.
      // No, wait, the street suffix is BEFORE the city. So the city
      // starts at i+1.
      cityStart = i + 1;
      break;
    }
    // Prepend candidate city token.
    cityTokens.unshift(tok);
    cityStart = i;
  }
  // If we didn't find a street suffix in the lookback, default to 1
  // city token (most CA cities are single-word: Sunnyvale, Fremont,
  // Oakland, Berkeley). Reset.
  if (
    cityTokens.length > 1 &&
    !tokens.slice(0, stateIdx - cityTokens.length).some((t) => STREET_SUFFIXES.has(t))
  ) {
    cityTokens.splice(0, cityTokens.length - 1);
    cityStart = stateIdx - 1;
  }

  const streetTokens = tokens.slice(0, cityStart);
  const street = streetTokens.join(" ");
  const city = cityTokens.join(" ");

  if (!street || !city) return tokens.join(" ");
  return `${street}, ${city}, ${state} ${zip}`.trim();
}

/**
 * Find the index of the state-abbreviation token in a slug. Falls
 * back to a position-based guess when no obvious state token is
 * present (e.g., for international URLs).
 */
function findStateIndex(tokens: string[]): number {
  const STATE_ABBRS = new Set([
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
  ]);
  // Walk from the end. The state is the last two-letter all-caps
  // token that matches the abbreviation list.
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STATE_ABBRS.has(tokens[i])) return i;
  }
  return -1;
}

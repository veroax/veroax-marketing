// US phone-number formatter shared across every form that accepts a
// phone field. Centralized so the signup form, settings form, future
// brokerage-admin form, and any contact-us inputs all behave the
// same way.
//
// Input: any user-typed string ("4155550100", "415-555-0100", "+1
//   415 555 0100", etc.). Output: the canonical "(415) 555-0100"
//   shape, truncated at 10 digits. Extension numbers are NOT
//   formatted, capture extensions in a separate free-form field.
//
// Pure function. No state, no hooks, safe to call from server code
// (e.g., when reformatting a stored value before render).

export function formatUsPhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

// Single source of truth for Veroax's user-facing contact info.
//
// Before this module existed, the phone, hours, email, and mailing
// address were hardcoded across roughly 10 files (homepage footer,
// /contact page, dashboard sidebar, /privacy page, email templates,
// etc.). Any change required a grep + 10 separate edits.
//
// Now: edit SUPPORT here, every surface picks it up on the next
// render or rebuild.
//
// SCOPE NOTE: this does NOT consolidate the email 'from:' addresses
// used when Veroax sends mail via Resend (hello@, alerts@, contact@,
// feedback@, noreply@). Those are a separate consolidation, handled
// by a different task in /admin/tasks. SUPPORT.email below is the
// inbound address customers contact us at, not the outbound one.

export const SUPPORT = {
  // Display form for the phone, formatted as US customers expect.
  phone: "(866) 247-8833",
  // tel: link form. Apple's iOS phone app + most desktop dialers
  // require the bare +country-code-and-digits.
  phoneTel: "+18662478833",
  // Inbound support email. Replies go here. Outbound 'from:'
  // addresses live in their respective email-template files (and
  // are scoped to be consolidated in a separate task).
  email: "support@veroax.com",
  // Free-form description of when the phone is monitored.
  hours: "8:00 AM to 8:00 PM Pacific, every day",
  // Mailing address. Structured so individual fields can be rendered
  // separately (e.g., on a JSON-LD PostalAddress block) without
  // string parsing.
  address: {
    street: "3964 Rivermark Plaza Unit #2783",
    city: "Santa Clara",
    region: "CA",
    postalCode: "95054",
    country: "US",
  },
} as const;

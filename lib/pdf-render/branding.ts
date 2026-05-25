// Resolves the final branding (logo, DRE, accent color, name text)
// for a report's PDF cover, given the agent profile, plus optional
// brokerage and team rows.
//
// Hierarchy (override stack; first non-null wins):
//
//   logo_url:
//     1. team.logo_url        (team-tier reports brand at team level)
//     2. brokerage.logo_url   (direct brokerage agents)
//     3. profile.brokerage_logo_url  (solo / Pro agents)
//
//   brokerage_dre:
//     1. brokerage.dre_license   (cover prints the brokerage's DRE)
//     2. profile.brokerage_dre   (solo agents enter it themselves)
//
//   brand_accent_hex:
//     1. team.brand_accent_hex
//     2. brokerage.brand_accent_hex
//     3. profile.brand_accent_hex
//
//   brokerage (the text label printed under the agent name):
//     1. brokerage.name   (brokerage-tier reports)
//     2. team.name        (standalone team-tier reports)
//     3. profile.brokerage (free-text the agent typed in /settings)
//
// agent fullName + DRE + phone + email + headshot ALWAYS come from
// the agent profile, the founder rule is that the producing agent
// is always identifiable on the cover.
//
// FOLLOW-UP scope: when BOTH brokerage_id AND team_id are set on a
// report, the cover should display brokerage as the parent header
// AND team as the secondary section. The current PDF component takes
// a single AgentBranding so we cannot show both at once. The override
// logic below prefers the team's logo/accent in that case (it's the
// closest container to the agent); the brokerage's name still wins
// for the "brokerage" text label. A future PDF refactor will add
// a `parentBrokerage` slot so brokerage+team renders both brandings
// stacked.

import type { AgentBranding } from "@/lib/pdf-render/ReportPDF";

export type ProfileBranding = {
  full_name?: string | null;
  brokerage?: string | null;
  dre_license?: string | null;
  brokerage_dre?: string | null;
  phone?: string | null;
  display_email?: string | null;
  brokerage_logo_url?: string | null;
  headshot_url?: string | null;
  brand_accent_hex?: string | null;
  tagline?: string | null;
  website_url?: string | null;
  office_address?: string | null;
};

export type BrokerageBranding = {
  name?: string | null;
  dre_license?: string | null;
  logo_url?: string | null;
  brand_accent_hex?: string | null;
};

export type TeamBranding = {
  name?: string | null;
  logo_url?: string | null;
  brand_accent_hex?: string | null;
};

const trimOrNull = (v: string | null | undefined): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export function resolveReportBranding({
  profile,
  brokerage,
  team,
  authEmail,
}: {
  profile: ProfileBranding | null;
  brokerage: BrokerageBranding | null;
  team: TeamBranding | null;
  // Fallback for the agent's display email when profile.display_email
  // is blank. Typically supabase user.email.
  authEmail: string | null;
}): AgentBranding {
  // Logo: team > brokerage > profile.
  const logoUrl =
    trimOrNull(team?.logo_url) ??
    trimOrNull(brokerage?.logo_url) ??
    trimOrNull(profile?.brokerage_logo_url);

  // Brokerage DRE: prefer the brokerage's DRE, then the agent's
  // brokerage_dre field. Standalone teams + solo agents don't have
  // a brokerage DRE source other than what they typed themselves.
  const brokerageDre =
    trimOrNull(brokerage?.dre_license) ?? trimOrNull(profile?.brokerage_dre);

  // Accent color: team > brokerage > profile.
  const brandAccentHex =
    trimOrNull(team?.brand_accent_hex) ??
    trimOrNull(brokerage?.brand_accent_hex) ??
    trimOrNull(profile?.brand_accent_hex);

  // Brokerage text label: brokerage > team > profile free-text.
  const brokerageLabel =
    trimOrNull(brokerage?.name) ??
    trimOrNull(team?.name) ??
    trimOrNull(profile?.brokerage);

  const displayEmail = trimOrNull(profile?.display_email);

  return {
    fullName: trimOrNull(profile?.full_name),
    brokerage: brokerageLabel,
    dreLicense: trimOrNull(profile?.dre_license),
    brokerageDre,
    phone: trimOrNull(profile?.phone),
    email: displayEmail ?? authEmail,
    brokerageLogoUrl: logoUrl,
    headshotUrl: trimOrNull(profile?.headshot_url),
    brandAccentHex,
    tagline: trimOrNull(profile?.tagline),
    websiteUrl: trimOrNull(profile?.website_url),
    officeAddress: trimOrNull(profile?.office_address),
  };
}

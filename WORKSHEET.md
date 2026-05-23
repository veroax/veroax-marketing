# Veroax worksheet, picked up after autonomous session

Generated during the "I'm taking off for a few hours" run. This is the
single document to read when you come back. It captures what I shipped,
what is still open, and what I'd recommend doing next.

## What shipped while you were away

### Brand integration (Option 1, coral wordmark + teal dot)
- Canonical asset set saved under `/public/brand/final/`:
  - `veroax-lockup-light.svg` (transparent, light bg use)
  - `veroax-lockup-dark.svg` (transparent, dark bg use, brighter shades)
  - `veroax-mark.svg` (64x64 favicon / app-icon variant)
- App Router icon conventions: `app/icon.svg` + `app/apple-icon.svg` (Next 16 auto-wires these as the browser favicon and Apple touch icon).
- Homepage header and footer now render the dark lockup.
- Dashboard sidebar uses the dark lockup; mobile header uses the light lockup.
- Mobile dashboard now exposes phone + email + Feedback link in a thin row under the logo (was completely missing before since the sidebar is desktop only).
- PDF report cover renders a discreet "Powered by veroax •" credit below the Prepared By block. Uses new `C.brandCoral` and `C.brandTeal` palette constants reserved only for this credit.
- Root layout: title shortened to `"Veroax | AI Disclosure Analysis for California Real Estate"`, description rewritten without em dash, `themeColor` moved to the `viewport` export per Next 16 conventions.

URLs to spot-check on the live deploy:
- `/` (homepage header + footer logo)
- `/dashboard` (sidebar logo; mobile view should show support row)
- A finished report's PDF (look at the very bottom of the cover page)
- `/brand/comparison` (still live, all four finalists visible)

### Security fixes (CRITICAL + HIGH from audit)
- `audit_log` PII leak on report delete: removed `property_address` and `report_name` from the row's metadata. Only operational fields (`deleted_report_id`, `actor_user_id`, `actor_is_admin`, `actor_is_owner`, `storage_objects_deleted`) remain.
- PDF render 500 response: no longer leaks `message` or `stack` to the client in production. Server logs still capture both.
- Watermark billing leak in email send: `/api/reports/[id]/email/send` now reads `watermarked` from the report row and passes it through to `ReportPDF`. Previously a trial user could email an unwatermarked PDF to a buyer.
- Stripe webhook: returns 503 (not 200) when `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is unset. Silent 200s during misconfig dropped real events.
- Public share page (`/r/[code]`): no longer falls back to `profiles.email` when `display_email` is unset. The agent's signup mailbox stays private. ProfileRow type updated to match.

### Privacy / SEO
- `app/admin/layout.tsx` now exports `robots: { index: false, follow: false }`. Cascades to every `/admin/*` page.
- `app/dashboard/layout.tsx` does the same. Cascades to every `/dashboard/*` page.
- New `app/(auth)/layout.tsx` carries the same metadata for `/login` and `/signup` (client components cannot export metadata themselves).
- `/checkout/cancel`, `/checkout/success`, `/feedback` each got their own `robots: noindex`.

### Code quality
- `/api/checkout` now uses `priceIdFor()` from `lib/billing/plans` instead of reimplementing the price-env lookup. Removes the drift hazard the audit flagged.
- Stale `ONEOFF_REPORT_PRICE_ENV` import + the `void` suppression hack removed from `app/api/webhook/route.ts`.
- `.claude/` and `.cursor/` added to `.gitignore`. The accidentally-committed `.claude/settings.local.json` was untracked.

### UX polish
- Homepage hero: replaced `"Veroax - An AI-assisted disclosure analysis for residential real estate."` (bare hyphen + ungrammatical) with `"Veroax. AI-assisted disclosure analysis for residential real estate."`. Sub-paragraph split into shorter sentences with "client-ready" properly hyphenated.
- FAQ pricing answer: removed literal `"$49/mo for X reports"` placeholder, replaced with concrete plan numbers matching the homepage pricing cards.
- Dashboard reports list table: switched `overflow-hidden` to `overflow-x-auto` and added `min-w-[640px]` so phones get a horizontal scroll instead of clipped columns.
- Dashboard description: "see the Archive link in the sidebar" replaced with a direct link to `/dashboard/archive` (sidebar doesn't exist on mobile).
- Profile-completion banner em dash replaced with a period.
- All user-visible em dashes in the following files swept clean: `app/blog/page.tsx`, `app/demo/page.tsx`, `app/faq/page.tsx`, `app/help/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/checkout/*`, `app/feedback/page.tsx`, `app/(auth)/actions.ts`, `app/feedback/actions.ts`, `app/dashboard/page.tsx`, `app/dashboard/_components/RowActions.tsx`, `app/admin/health/page.tsx`, `app/admin/users/page.tsx`, `app/admin/_components/ToggleVipButton.tsx`, `app/r/[code]/_components/PublicReportView.tsx`.

## Open items, prioritized for when you return

### Decisions needed from you (low effort, only you can make)
1. **File a USPTO standard-character mark on VEROAX** (classes 9 + 42, about $350 each). This is the highest-leverage permanence move and does not block anything else. I cannot file this for you, but I can prep the application text if you want.
2. **Stripe Test mode**: you were going to set this up manually. Confirm the test keys are loaded and the test webhook is firing before we promote to live mode.
3. **Pick blog + help video topics**: `/blog` and `/help` are still placeholder pages. The audit flagged them as feeling broken to a first-time visitor. Even 2 to 3 evergreen posts and a "Launching Q3 2026" estimate on Help would make them feel real. Suggested topics:
   - Blog: "How to read a TDS", "What a Critical finding means", "The 30-day re-analysis window explained"
   - Help: short Loom videos of the upload + report + email flow once those are stable

### Security items I deferred (need your sign-off on approach)
4. **HIGH: Email-match attack in Stripe webhook**: `/api/webhook/route.ts:298-311` matches Stripe sessions to Veroax profiles via `customer_details.email`. An attacker can pay with the victim's email at Stripe checkout and grant credits to that victim's account. The fix: pass `metadata.user_id` from `/api/checkout/route.ts` into the Checkout Session, match on that first, fall back to email only when `user_id` is absent. I held off because it touches both checkout creation and webhook matching, and I wanted you to confirm the fallback behavior.
5. **MEDIUM: Filenames in audit_log**: `/api/reports/[id]/update/route.ts:216` writes `added_filenames`, `/api/reports/[id]/remove-file/route.ts:230` writes `removed_filename`, and `lib/server/performAnalysis.ts` writes filenames in 5 places. Filenames often contain seller/client names (e.g. `Smith_TDS.pdf`). Per the PII rule, scrub or hash filenames before logging. The simplest fix: keep only file type + size + page count, store SHA-256 of the filename if you need de-dup in audit replay. Held off because a clean fix touches 7 files and you may want the original filenames preserved for support debugging.
6. **MEDIUM: Unauthenticated stripe-health and roadmap endpoints**: `/api/stripe-health` reveals which env keys are configured (boolean only, but a backend fingerprint). `/api/roadmap` renders a PDF on every request with no rate limit. Both should be gated behind admin or rate-limited.
7. **MEDIUM: `/api/contact` and `/api/report-errors/submit`**: both are anonymous POST endpoints with no rate limit or CAPTCHA. Free spam relay risk. Add per-IP rate limiting or a honeypot field.
8. **LOW: `getOrigin()` trusts `x-forwarded-host`**: pin to `NEXT_PUBLIC_SITE_URL` in production to prevent redirect poisoning if ever deployed behind a non-Vercel proxy.

### Code quality refactors (medium effort, would benefit from your input)
9. **Shared `requireUser()` and `requireAdmin()` helpers**: the audit found the 6-line auth-gate pattern duplicated across 21 route files. Extracting to `lib/supabase/server.ts` would shrink the codebase noticeably. The shape would be: `const auth = await requireUser(); if (auth instanceof NextResponse) return auth; const { supabase, user } = auth;`. Want me to do this?
10. **Promote duplicated PDF/analyzer constants**: `PDF_PER_CALL_PAGE_BUDGET` and `GROUP_TRANSPORT` exist in both `lib/server/performAnalysis.ts` and `lib/anthropic/analyze.ts` with comments saying "must stay in sync." Move to `lib/pdf/limits.ts` (or similar shared module) and import.
11. **Split `app/page.tsx` into server component + client islands**: the entire 1000+ line landing page is marked `"use client"` because two small bits of inline state (contact form, billing toggle) exist. Splitting saves a meaningful chunk of JS shipped to every visitor. Audit suggested moving `ContactForm` and `PricingToggle` into their own files under `_components/`.
12. **Split `ReportPDF.tsx` (2731 lines) and `analyze.ts` (2058 lines)** into per-section subcomponents. No correctness issue, just maintenance pain at those sizes.

### Stub pages to fill
13. **`/blog`**: needs at least 2 to 3 evergreen posts. List of suggested topics above. RSS feed and email signup form would be nice-to-haves.
14. **`/demo`**: currently says "We're assembling a short walkthrough." Either record one or remove the route from the marketing footer until it exists.
15. **`/help`**: placeholder list of 6 video titles all labeled "Coming". Same deal as `/demo`.
16. **Privacy + Terms links from the dashboard footer**: currently only linked from the marketing footer. Logged-in users have no way to re-read either.

### Smaller polish (LOW priority, fast wins)
17. Color contrast: `text-indigo-300` on indigo-950 sits at about 4.0:1, below the WCAG AA 4.5:1 floor. Bump to `text-indigo-200` anywhere it appears below 18px bold. Spots: `app/page.tsx:294,933`, `app/dashboard/layout.tsx:84,107`.
18. Hero stat bar units: `"14" / "4" / "12+" / "7 yr"` mixes plain numbers with units. Either drop "yr" from the last one or pluralize the rest ("14 sections", "4 levels", "12+ markets", "7-year retention").
19. `(866) AISTUFF` vanity number: screen readers read "A-I-S-T-U-F-F". Add `aria-label="Call 866 247 8833"` on the `<a>` and visually hide the AISTUFF text or mark it `aria-hidden`.
20. `(auth)/signup/page.tsx` password input: no show/hide toggle, no strength meter. Add an eye toggle and a 4-tier strength bar.
21. Homepage contact form on success: the entire form is replaced by a centered confirmation line. No "send another" path. Keep the form, swap the submit button for a green confirmation, let the user reset.
22. Hero `"Start your free report"` CTA anchors to `#pricing` (paid plans), not to the free trial banner. Either anchor it to `#contact` (the dark banner with the trial message) or rephrase to `"See pricing"`.

### Long-tail audit findings (cleanup pass)
23. Em dashes in code comments: ~600+ remain. Not user-visible, so not in the sweep I did. A separate pass with `grep -rl "—" app/ lib/ components/` and a careful sed replacement could clear them.
24. `DevRerunButton` and `/api/admin/force-rerun/[id]` carry "REMOVE BEFORE PRODUCTION LAUNCH" banners. Bundle their removal into a single pre-launch commit so nothing slips through.
25. `lib/cost-reference/california-markets.ts:39` exports `COST_REFERENCE_LAST_REFRESHED` but nothing imports it. Either render it on the report (under the Cost Summary / Methodology footer) or drop the export.
26. `lib/share/code.ts:8` comment says "27-char alphabet" but the constant has 31. Fix the math comment.
27. `/blog`, `/demo`, `/help` brand-page logos under `app/brand/*` use `alt=""`. The pages are noindexed so empty alt is technically fine, but descriptive alt would help anyone using a screen reader on the brand picker.
28. The brand picker pages (`/brand/round-2`, `/brand/round-3`, `/brand/comparison`, `/brand/variations`) are now noindex-disabled by default for the public site, but they remain accessible. Once you commit to the final logo, consider removing all five pages.

## How I'd recommend spending the next session

1. **10 minutes**: respond to decisions in items 1 to 3 above. File the trademark, confirm Stripe test mode, and pick 2 blog topics.
2. **30 minutes**: I do the email-match attack fix (item 4) and the filename PII fix (item 5) in one commit. These are real risks and the cleanups don't take long once you confirm the approach.
3. **30 minutes**: I add `requireUser()` / `requireAdmin()` helpers and refactor the 21 routes (item 9). Significant code shrinkage, low risk.
4. **15 minutes**: I split the landing page into server + client islands (item 11) for the JS bundle savings.
5. **As time allows**: I write the first blog post draft for you to edit, fix the polish items in 17 to 22.

## How to verify the work shipped

```
git log --oneline d4cfe42..HEAD   # last 4 commits
```

Latest commits:
- `660e069` chore: drop void ONEOFF_REPORT_PRICE_ENV hack in webhook
- `d4cfe42` chore: sweep user-visible em dashes per founder rule
- `5b4f5c5` audit fixes: noindex, mobile dashboard, hero copy, pdf credit
- `e4eaee9` brand + security: integrate veroax lockup, fix critical audit findings

Spot-check URLs once Vercel deploys (within a minute or two):
- `https://www.veroax.com/` (homepage logo lockup + footer)
- `https://www.veroax.com/dashboard` (logged-in; check mobile view too)
- A finished report PDF (the bottom of the cover should now say "Powered by veroax •")
- View source on `/dashboard/*` and confirm `<meta name="robots" content="noindex, nofollow">` is present
- Google "site:veroax.com/dashboard" in a week and confirm zero pages indexed

If anything looks wrong, the rollback is one commit back: `git revert e4eaee9..660e069`.

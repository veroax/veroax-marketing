# Veroax: to-do list

Working document. Forward-looking only (completed items live in
WORKSHEET.md). Each item is a single concrete action with a clear
"done" state. **You** = Michael does it. **Me** = Claude does it
when asked.

Last updated: 2026-05-26 (end of session adding GA + emails + SEO)

---

## 🔴 Right now (this week)

### Bugs found in the code review (~30 min total if you ask me to do them)

- [ ] **Me**: Fix DRE name matcher to handle apostrophes / hyphens / accented characters (`lib/server/dreVerify.ts:183`). Current normalization strips `'` and `-`, will falsely mismatch agents like O'Connor, D'Angelo, Mary-Jane.
- [ ] **Me**: Fix GA dashboard deep link on `/admin/integrations` (`app/admin/integrations/page.tsx:47`). Uses Measurement ID where GA expects numeric Property ID; link 404s.
- [ ] **Me**: Wrap GA inline script interpolation in `JSON.stringify()` (`app/_components/GoogleAnalytics.tsx:34`). Defense-in-depth, 5-character fix.
- [ ] **Me**: Fix `getSiteConfig` cache-poisoning on transient DB error (`lib/siteConfig.ts:53`). Don't cache when `error` is non-null; only cache empty-result responses.
- [ ] **You**: Decide what canonical `from:` email address Veroax should use for outbound transactional mail. Currently `contact@`, `hello@`, `alerts@`, `feedback@` are all in use across 8 files. Pick one (recommend `noreply@veroax.com` with Reply-To routing) and I'll consolidate.

### Test the signup flow

- [ ] **You**: Sign up a fresh test account at `https://www.veroax.com/signup` using `michael+welcomtest@veroax.com`.
- [ ] **You**: Verify the welcome email lands in inbox (not spam). Subject: "Welcome to Veroax". From: `hello@veroax.com`.
- [ ] **You**: Verify the admin signup notification lands in `michael@veroax.com` inbox. Subject: "Veroax signup: michael+welcometest@veroax.com".
- [ ] **You**: Sign up AGAIN with the same email to trigger a duplicate-email failure. Verify the admin gets the "Veroax signup attempt FAILED" notification.

### Confirm GA is collecting data

- [ ] **You**: Open https://analytics.google.com → Veroax property → **Reports → Realtime**.
- [ ] **You**: Visit https://www.veroax.com/ from another browser tab.
- [ ] **You**: Confirm "1 active user" appears in Realtime within 30 seconds.
- [ ] **You**: Wait 24 hours, then check Reports → Engagement → Pages and screens. Should have data.

### Stripe + payment flow sanity check

- [ ] **You**: Set Stripe to test mode in Vercel env vars (if not already).
- [ ] **You**: Sign up a fresh test account, navigate to `/pricing`, click "Start Solo, $49/mo".
- [ ] **You**: Complete Stripe checkout with test card `4242 4242 4242 4242`. Confirm:
  - [ ] Lands back on `/checkout/success`
  - [ ] Stripe webhook fires (check Vercel logs)
  - [ ] Subscription row created in Supabase (`select * from subscriptions where user_id = '...';`)
  - [ ] User can now download a non-watermarked report PDF

### Security: rotate the leaked GitHub PAT (paused earlier)

- [ ] **You**: Generate a fresh GitHub PAT under `@veroax` (or whatever you decide).
- [ ] **You**: Update Vercel + local git remote to use the new token.
- [ ] **You**: Revoke the old `ghp_TuiV...` token on github.com/settings/tokens.

---

## 🟡 Before your first beta customer (next ~1-2 weeks)

### Walk the brokerage end-to-end flow (~15 min)

The seven-step loop in WORKSHEET.md. Two browser windows (owner + agent incognito):

- [ ] **You**: Owner signs up at `/signup` with `michael+brokerage@veroax.com`.
- [ ] **You**: Owner navigates to `/dashboard/team` → creates "Test Brokerage".
- [ ] **You**: Owner sends invite to `michael+agent1@veroax.com`, role Agent.
- [ ] **You**: Agent (incognito) accepts the invite via the email link.
- [ ] **You**: Owner refreshes `/dashboard/team`, sees the agent.
- [ ] **You**: Agent uploads a test report.
- [ ] **You**: Owner sees the report at `/dashboard/team/reports` with the agent's name on the row.

### Verify Resend DNS for all sender subdomains

- [ ] **You**: Log into Resend → Domains → veroax.com. Confirm SPF + DKIM verified.
- [ ] **You**: Confirm `hello@veroax.com`, `alerts@veroax.com`, `contact@veroax.com`, `feedback@veroax.com`, `noreply@veroax.com` all route correctly (or consolidate per item above).

### Legal + trust

- [ ] **You**: File USPTO trademark on VEROAX, classes 9 + 42 (~$350 each). I can prep the application text when you're ready.
- [ ] **You**: Have a lawyer review Terms of Service for SaaS-specific clauses (existing TOS hasn't been reviewed).

### Sign up your first brokerage

- [ ] **You**: When ready, send the brokerage owner the signup link with a custom welcome message.
- [ ] **You**: Use `/admin/users/[id]` to grant them free credits during the pilot if you don't want them paying yet.
- [ ] **You**: Confirm they can create their team, invite agents, and generate a report end-to-end.

---

## 🟢 Before public launch (next ~3-4 weeks)

### Get found by Google

- [ ] **You**: Verify the domain in Google Search Console (https://search.google.com/search-console).
- [ ] **You**: Submit your sitemap.xml in GSC ("Sitemaps" left nav → "https://www.veroax.com/sitemap.xml").
- [ ] **You**: Wait 24-72 hours for Google to crawl. Track indexing progress in GSC.

### Local SEO (biggest single lever for finding actual customers)

- [ ] **You**: Create Google Business Profile for Veroax, Inc. (https://business.google.com).
  - Business name: "Veroax, AI Disclosure Analysis"
  - Category: Software Company (primary), Real Estate Services (secondary)
  - Service area: California (statewide)
  - 5+ photos of the product UI
- [ ] **You**: Claim Apple Maps Connect listing (https://mapsconnect.apple.com).

### Content

- [ ] **You**: Edit + ship 5-10 blog posts from `content/blog/*.md`. 10 drafts exist; pick the best ones first.
- [ ] **You**: Record a 3-5 minute Loom or screen-capture demo, wire it into `/demo` page (currently a "coming soon" stub).
- [ ] **You**: Record short help videos (upload flow, results review, email send). Wire into `/help` page.

### Other UX

- [ ] **Me**: Add Privacy + Terms links to the dashboard footer (currently only marketing footer has them).
- [ ] **Me**: Consolidate support constants (`(866) 247-8833`, hours, email) into `lib/site.ts` so the next change is one file.
- [ ] **Me**: Decide whether to remove the brand-picker pages at `/brand/*` (they're noindexed but accessible).
- [ ] **Me**: Improve sitemap `lastModified` to use deploy time instead of `new Date()` so Google's priority signal stays meaningful.

---

## 🔵 Deferred until you have real users (Tier 3)

- [ ] **Me**: DRE PDF gate (block branded PDFs for unverified accounts). Today they're soft-flagged only. Decide thresholds first based on real data.
- [ ] **Me**: Cron job for periodic DRE re-verification (renewal expiry tracking, weekly sweep).
- [ ] **Me**: Brokerage-side roster controls (currently site admin can do everything; brokerage admins are view-only). Add: remove agent, transfer team owner, revoke invites.
- [ ] **Me**: Cover with BOTH brokerage AND team branding stacked (PDF picks one today). Needs a `parentBrokerage` slot on ReportPDF.
- [ ] **Me**: File removal in report inventory with forced re-analysis (build a "remove this file and re-run" action).
- [ ] **Me**: In-app analytics widget on `/admin` (GA Data API integration). Wait for at least a month of real GA data first to know if you want it.

---

## ⚪ Long-tail polish (whenever)

- [ ] **Me**: Phone normalization should add `+1` country code prefix when missing 10-digit US format.
- [ ] **Me**: Consolidate `signupAction`'s three `after()` blocks into one `Promise.allSettled` for predictable parallel email delivery.
- [ ] **Me**: Refactor `ReportPDF.tsx` (2731 lines) and `analyze.ts` (2058 lines) into smaller modules.
- [ ] **Me**: Add a comment to the `extractField` regex in `dreVerify.ts` explaining the double `</a>` placement.
- [ ] **Me**: Add descriptive alt text on any other `<img>` tags I missed in the brand-page sweep.
- [ ] **You**: Decide if the brand-picker pages should remain accessible or be removed entirely.

---

## ✅ Already done (so you know what's behind you)

These were live as of this session's last commit. No action needed.

- Migrations 0021 (brokerage/team), 0022 (DRE verification), 0023 (site config) applied.
- michael@veroax.com promoted to site admin.
- Supabase SMTP via Resend configured.
- GA4 Measurement ID `G-6HTNT4ZBZ5` saved and injecting on every public page.
- Sitemap.xml live at https://www.veroax.com/sitemap.xml with all 18 public pages.
- Robots.txt live, blocks AI training crawlers, allows search engines.
- Welcome email + admin signup notification wired into signupAction.
- DRE verification working end-to-end (verified on `michael@veroax.com`).
- Brokerage admin pages, invite flow, PDF branding integration all live.
- Pricing page + homepage synced to 4-tier structure (Solo / Pro / Team / Brokerage).
- `/contact` and `/investors` pages live, polished.
- Em dashes swept from 92 code files.
- Backup mirror moved out of project root to `~/Backups/github/`.

---

## How to use this list

- Things marked **You** need a human touch (decisions, accounts, tests, business calls).
- Things marked **Me** I can do autonomously when you say so. Tell me "do P1 fixes" or "knock out the polish items" and I'll start.
- The 🔴 / 🟡 / 🟢 / 🔵 / ⚪ markers are priority, not time-to-do. A 🔴 might take 5 minutes; a 🟢 might take an hour.
- Strikethrough items by changing `[ ]` to `[x]` so the next session knows what's done.
- This file lives in the repo; commit changes so future sessions see the current state.

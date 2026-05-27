-- 0025_seed_tasks_from_todo.sql
--
-- Seed the public.tasks table with the contents of TODO.md as of
-- this commit. Idempotent: uses ON CONFLICT DO NOTHING against the
-- unique (title, category) index created in 0024 so re-running this
-- migration is a no-op for already-seeded rows.
--
-- To wipe + reseed from scratch: `truncate public.tasks;` then run
-- this file again.

-- ============================================================
-- NOW (this week) - code-review bugs + signup tests + GA + Stripe + PAT
-- ============================================================

insert into public.tasks (title, body, category, owner, sort_order) values
  ('Fix DRE name matcher to handle apostrophes / hyphens / accented characters',
   E'**File:** `lib/server/dreVerify.ts:183`\n\nThe normalization regex strips apostrophes and hyphens, falsely returning `mismatch` for real California agents named O''Connor, D''Angelo, Mary-Jane, etc.\n\n**Fix:** decompose NFD + keep apostrophe + hyphen in the kept-char regex.',
   'now', 'me', 10),

  ('Fix GA dashboard deep link on /admin/integrations',
   E'**File:** `app/admin/integrations/page.tsx:47`\n\nThe link uses the GA Measurement ID (`G-XXXXXXXX`) but GA dashboard URLs need the numeric Property ID. Link 404s today.\n\n**Fix:** point at `https://analytics.google.com/` or surface a separate Property ID config field.',
   'now', 'me', 20),

  ('Wrap GA inline script interpolation in JSON.stringify',
   E'**File:** `app/_components/GoogleAnalytics.tsx:34`\n\nDefense-in-depth, 5-character fix. The regex validation makes this safe today; JSON.stringify is the correct primitive for server-rendered JS-context interpolation.',
   'now', 'me', 30),

  ('Fix getSiteConfig cache poisoning on transient DB error',
   E'**File:** `lib/siteConfig.ts:53`\n\nCurrently caches the default empty config for 60s on ANY error. A momentary DB hiccup leaves the site without GA tracking for up to 60s after recovery.\n\n**Fix:** only cache when row is genuinely empty (data null, no error). Skip caching on errors.',
   'now', 'me', 40),

  ('Decide canonical from: email address',
   E'5 different sender mailboxes are in use across 8 files: `contact@`, `hello@`, `alerts@`, `feedback@`, `noreply@`. Each needs verified in Resend; unverified ones fail silently.\n\n**Recommendation:** consolidate to `noreply@veroax.com` everywhere with Reply-To routing. Tell Claude when you''ve decided and they''ll do the consolidation.',
   'now', 'you', 50),

  ('Test signup flow end-to-end',
   E'1. Sign up at /signup with `michael+welcometest@veroax.com`\n2. Verify welcome email lands in inbox. Subject: "Welcome to Veroax". From: hello@veroax.com.\n3. Verify admin signup notification lands in michael@veroax.com.\n4. Sign up AGAIN with the same email to trigger duplicate-email failure. Verify admin gets the "FAILED" notification.',
   'now', 'you', 60),

  ('Confirm Google Analytics is collecting data',
   E'1. Open https://analytics.google.com -> Veroax property -> Reports -> Realtime\n2. Visit https://www.veroax.com/ from another tab\n3. Confirm "1 active user" within 30 seconds\n4. Wait 24 hours, check Reports -> Engagement -> Pages and screens. Should have data.',
   'now', 'you', 70),

  ('Stripe + payment flow sanity check',
   E'1. Confirm Stripe is in test mode\n2. Sign up fresh, go to /pricing, click "Start Solo, $49/mo"\n3. Pay with test card `4242 4242 4242 4242`\n4. Verify:\n  - Lands on /checkout/success\n  - Stripe webhook fires (check Vercel logs)\n  - Subscription row created in Supabase\n  - User can download non-watermarked PDF',
   'now', 'you', 80),

  ('Rotate the leaked GitHub PAT',
   E'Steps:\n1. Generate fresh PAT under `@veroax`\n2. Update Vercel + local git remote\n3. Revoke old `ghp_TuiV...` token on github.com/settings/tokens\n\nFull walkthrough in chat history; ping Claude for a refresher.',
   'now', 'you', 90)
on conflict (title, category) do nothing;

-- ============================================================
-- BETA (before first paying brokerage)
-- ============================================================

insert into public.tasks (title, body, category, owner, sort_order) values
  ('Walk the brokerage end-to-end flow',
   E'Two browser windows, owner + agent in incognito:\n1. Owner signs up with `michael+brokerage@veroax.com`\n2. Owner creates "Test Brokerage" at /dashboard/team\n3. Owner invites `michael+agent1@veroax.com` as Agent\n4. Agent accepts invite via email link\n5. Owner refreshes /dashboard/team, sees agent\n6. Agent uploads a test report\n7. Owner sees report at /dashboard/team/reports with agent name on row',
   'beta', 'you', 10),

  ('Verify Resend DNS for all sender subdomains',
   E'Resend -> Domains -> veroax.com. Confirm SPF + DKIM verified. Confirm all these route:\n- hello@veroax.com\n- alerts@veroax.com\n- contact@veroax.com\n- feedback@veroax.com\n- noreply@veroax.com',
   'beta', 'you', 20),

  ('File USPTO trademark on VEROAX, classes 9 + 42',
   'Roughly $350 per class. Highest-leverage permanence move. Ask Claude to prep the application text when ready.',
   'beta', 'you', 30),

  ('Have a lawyer review Terms of Service',
   'Existing /terms hasn''t had legal review. SaaS-specific clauses (limitation of liability, indemnification, DMCA, GDPR cross-references) need real legal eyes before driving traffic.',
   'beta', 'you', 40),

  ('Sign up your first brokerage customer',
   E'When ready:\n- Send the brokerage owner the signup link\n- Use /admin/users/[id] to grant free credits during pilot\n- Confirm they can create team, invite agents, generate a report end-to-end',
   'beta', 'you', 50)
on conflict (title, category) do nothing;

-- ============================================================
-- LAUNCH (before public marketing push)
-- ============================================================

insert into public.tasks (title, body, category, owner, sort_order) values
  ('Verify the domain in Google Search Console',
   'https://search.google.com/search-console. Use DNS TXT record verification.',
   'launch', 'you', 10),

  ('Submit sitemap.xml in Google Search Console',
   'After verification: GSC -> Sitemaps (left nav) -> add `https://www.veroax.com/sitemap.xml`. Wait 24-72h for crawl.',
   'launch', 'you', 20),

  ('Create Google Business Profile for Veroax, Inc.',
   E'https://business.google.com\n\n- Business name: "Veroax, AI Disclosure Analysis"\n- Primary category: Software Company\n- Secondary: Real Estate Services\n- Service area: California (statewide)\n- 5+ photos of the product UI',
   'launch', 'you', 30),

  ('Claim Apple Maps Connect listing',
   'https://mapsconnect.apple.com. 5 minutes. iOS users increasingly skip Google for local search.',
   'launch', 'you', 40),

  ('Edit + ship 5-10 blog posts',
   E'10 first drafts in `content/blog/*.md`. Topics: TDS, SPQ, inspections, NHD, HOA, mold/asbestos/lead, solar, severity rubric, 30-day window, post-disclosure negotiation.\n\nEdit in place, commit, posts auto-appear at /blog and in the sitemap.',
   'launch', 'you', 50),

  ('Record a 3-5 minute Loom demo',
   'Wire into /demo page (currently a stub). Show: upload flow, results review, branded PDF output, email send.',
   'launch', 'you', 60),

  ('Record short help videos',
   '/help has 6 stub video tiles. Walkthroughs of: upload flow, results review, email send, team management.',
   'launch', 'you', 70),

  ('Add Privacy + Terms links to dashboard footer',
   'Currently only marketing footer has them. Logged-in users have no way to re-read either without leaving the dashboard.',
   'launch', 'me', 80),

  ('Consolidate support constants to lib/site.ts',
   'Phone, hours, email hardcoded in ~10 files. One change should not require greping 10 places.',
   'launch', 'me', 90),

  ('Decide whether to remove brand-picker pages at /brand/*',
   'Noindexed but accessible. Logo is locked; could keep as historical record or remove entirely.',
   'launch', 'you', 100),

  ('Improve sitemap lastModified to use deploy time',
   '`app/sitemap.ts:25` uses `new Date()` for every static page on every regen. Google may discount the priority signal. Use Vercel deployment timestamp instead.',
   'launch', 'me', 110)
on conflict (title, category) do nothing;

-- ============================================================
-- DEFERRED (Tier 3 features waiting for real-user signal)
-- ============================================================

insert into public.tasks (title, body, category, owner, sort_order) values
  ('Implement DRE PDF gate for unverified accounts',
   'Today unverified accounts can still ship branded reports; soft-flagged only on /admin/users. After a month of verification data, decide: hard-block, watermark with "Verification Pending", or keep soft flag.',
   'deferred', 'me', 10),

  ('Cron job for periodic DRE re-verification',
   'Weekly sweep: for every profile with `dre_verified_at` older than 30 days, re-run the DRE lookup. Flag accounts that fall out of "verified" status.',
   'deferred', 'me', 20),

  ('Brokerage-side roster controls',
   'Today site admin does everything from /admin/brokerages/[id]; brokerage admins are view-only. Add: remove agent, transfer team owner, revoke pending invite.',
   'deferred', 'me', 30),

  ('PDF cover with BOTH brokerage AND team branding',
   'ReportPDF takes one AgentBranding slot. When both brokerage_id AND team_id are set, resolver picks one (team wins). Add a `parentBrokerage` prop for stacked rendering.',
   'deferred', 'me', 40),

  ('File removal with forced re-analysis',
   'On report detail page, let agent remove a file they uploaded by mistake. If already analyzed, removing forces a re-run.',
   'deferred', 'me', 50),

  ('In-app analytics widget on /admin',
   'GA Data API integration: pageviews, top pages, sources, conversion events inside admin. Wait for at least a month of real GA data before building.',
   'deferred', 'me', 60)
on conflict (title, category) do nothing;

-- ============================================================
-- POLISH (long-tail, no urgency)
-- ============================================================

insert into public.tasks (title, body, category, owner, sort_order) values
  ('Phone normalization: add +1 country code when missing',
   '`app/(auth)/actions.ts:37`. User typing `(415) 555-0100` ends up with `4155550100`, not E.164. SAM AI integration may want E.164 with country code.',
   'polish', 'me', 10),

  ('Consolidate signupAction three after() blocks into Promise.allSettled',
   '`app/(auth)/actions.ts:134-192`. Three separate after() callbacks today. Could batch into one with explicit parallel execution.',
   'polish', 'me', 20),

  ('Refactor ReportPDF.tsx (2731 lines) into smaller modules',
   'Per-section subcomponents. No correctness issue, just maintenance pain at that size.',
   'polish', 'me', 30),

  ('Refactor lib/anthropic/analyze.ts (2058 lines) into smaller modules',
   'Same logic as ReportPDF.tsx refactor.',
   'polish', 'me', 40),

  ('Add explanatory comment to extractField regex in dreVerify.ts',
   'The double `(?:</a>)?` (before AND after the colon) is correct but reads like a typo without context.',
   'polish', 'me', 50),

  ('Audit remaining img tags for alt text',
   'Brand-page sweep covered /brand/*. Other img tags across the site may still have `alt=""` or generic alt.',
   'polish', 'me', 60)
on conflict (title, category) do nothing;

-- Migration registration.
insert into public._migrations(name) values ('0025_seed_tasks_from_todo')
  on conflict (name) do nothing;

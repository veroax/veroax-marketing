// Veroax brokerage sales deck. 12 slides, designed for online
// presentation to brokerage leadership (broker / owner, ops, agent
// development). More salesy + concrete-ROI than the investor deck.
// Run with `node decks/brokerage-sales.js`.

const pptxgen = require("pptxgenjs");
const path = require("node:path");
const B = require("./_brand");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.title = "Veroax for Brokerages";
pptx.author = "Veroax, Inc.";
pptx.company = "Veroax, Inc.";

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const TOTAL = 12;

// ---------- helpers ---------------------------------------------

function addMark(slide, onDark = false) {
  slide.addText(
    [
      {
        text: "veroax",
        options: { fontFace: B.FONT_HEAD, fontSize: 12, bold: true, color: onDark ? B.CORAL_BRIGHT : B.CORAL },
      },
      {
        text: " • ",
        options: { fontFace: B.FONT_HEAD, fontSize: 12, bold: true, color: onDark ? B.TEAL_BRIGHT : B.TEAL },
      },
    ],
    { x: SLIDE_W - 1.6, y: SLIDE_H - 0.45, w: 1.4, h: 0.3, align: "right", margin: 0 },
  );
}

function addSlideChip(slide, n, onDark = false) {
  slide.addText(`${String(n).padStart(2, "0")} / ${String(TOTAL).padStart(2, "0")}`, {
    x: 0.5,
    y: 0.4,
    w: 1.2,
    h: 0.25,
    fontFace: B.FONT_HEAD,
    fontSize: 9,
    bold: true,
    color: onDark ? B.SLATE_300 : B.SLATE_500,
    charSpacing: 4,
    margin: 0,
  });
}

function addPageTitle(slide, n, eyebrow, title, sub) {
  addSlideChip(slide, n);
  slide.addText(eyebrow, {
    x: 0.5,
    y: 0.85,
    w: 12,
    h: 0.35,
    fontFace: B.FONT_HEAD,
    fontSize: 11,
    bold: true,
    color: B.CORAL,
    charSpacing: 5,
    margin: 0,
  });
  slide.addText(title, {
    x: 0.5,
    y: 1.25,
    w: 12.3,
    h: 1.0,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
    lineSpacingMultiple: 1.1,
  });
  if (sub) {
    slide.addText(sub, {
      x: 0.5,
      y: 2.3,
      w: 12.3,
      h: 0.5,
      fontFace: B.FONT_BODY,
      fontSize: 15,
      color: B.SLATE_700,
      margin: 0,
    });
  }
}

// ---------- 1. Cover ---------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.NAVY_DEEP };

  s.addShape("rect", { x: 0, y: 0, w: 0.5, h: SLIDE_H, fill: { color: B.CORAL }, line: { type: "none" } });
  s.addShape("rect", { x: 0.5, y: 0, w: 0.2, h: SLIDE_H, fill: { color: B.TEAL }, line: { type: "none" } });

  s.addText("For brokerages", {
    x: 1.4, y: 0.9, w: 8, h: 0.4,
    fontFace: B.FONT_HEAD, fontSize: 12, bold: true,
    color: B.AMBER_SOFT, charSpacing: 6, margin: 0,
  });

  s.addText(
    [
      { text: "veroax", options: { color: B.CORAL_BRIGHT, fontSize: 72, bold: true } },
      { text: "•", options: { color: B.TEAL_BRIGHT, fontSize: 72, bold: true } },
    ],
    { x: 1.4, y: 1.4, w: 10, h: 1.3, fontFace: B.FONT_HEAD, margin: 0 },
  );

  s.addText("A defensible disclosure review for every buyer your office represents.", {
    x: 1.4, y: 2.9, w: 11, h: 1.8,
    fontFace: B.FONT_HEAD, fontSize: 30, color: B.WHITE, bold: false, margin: 0,
    lineSpacingMultiple: 1.2,
  });

  s.addText(
    "Branded for your office. Built for the way your agents actually work. Priced to pay for itself on the first transaction.",
    {
      x: 1.4, y: 5.0, w: 10, h: 1.0,
      fontFace: B.FONT_BODY_LIGHT, fontSize: 18, color: B.SLATE_300, margin: 0,
      lineSpacingMultiple: 1.35,
    },
  );

  s.addText(
    [
      { text: "michael@michaelfielden.com", options: { color: B.SLATE_300 } },
      { text: "  •  ", options: { color: B.TEAL_BRIGHT } },
      { text: "(866) 247-8833", options: { color: B.SLATE_300 } },
      { text: "  •  ", options: { color: B.TEAL_BRIGHT } },
      { text: "www.veroax.com", options: { color: B.SLATE_300 } },
    ],
    {
      x: 1.4, y: 6.7, w: 11, h: 0.35,
      fontFace: B.FONT_BODY, fontSize: 12, margin: 0,
    },
  );
}

// ---------- 2. The agent's reality -------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.CREAM };
  addPageTitle(
    s, 2,
    "The problem",
    "Your agents are reading 600 pages between dinner and the contingency deadline.",
    "California disclosure packages are bigger every year. The work is essential. The time to do it well does not exist.",
  );

  // Three pain rows on the left, big stat block on the right.
  const pains = [
    { h: "They skim", b: "Or they triage. Some sections get a real read, some get a paragraph at the end of the day." },
    { h: "The misses are expensive", b: "Unpermitted additions, FPE panels, active HOA litigation, recurring water intrusion, solar PPA transfers. Every one of these can blow up at contingency removal." },
    { h: "Your brand absorbs the trust hit", b: "When a buyer learns about a critical issue after they paid for the inspection report, the agent and the brokerage both lose credibility." },
  ];
  pains.forEach((p, i) => {
    const y = 3.2 + i * 1.25;
    s.addShape("rect", {
      x: 0.5, y, w: 7.0, h: 1.1,
      fill: { color: B.WHITE },
      line: { color: B.SLATE_300, width: 1 },
    });
    s.addShape("rect", {
      x: 0.5, y, w: 0.1, h: 1.1,
      fill: { color: B.CORAL },
      line: { type: "none" },
    });
    s.addText(p.h, {
      x: 0.8, y: y + 0.1, w: 6.5, h: 0.4,
      fontFace: B.FONT_HEAD, fontSize: 16, bold: true, color: B.SLATE_900, margin: 0,
    });
    s.addText(p.b, {
      x: 0.8, y: y + 0.5, w: 6.5, h: 0.55,
      fontFace: B.FONT_BODY, fontSize: 12.5, color: B.SLATE_700, margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  // Big stat card on the right
  s.addShape("rect", {
    x: 8.2, y: 3.2, w: 4.6, h: 3.65,
    fill: { color: B.NAVY_DEEP }, line: { type: "none" },
  });
  s.addText("Per package", {
    x: 8.4, y: 3.4, w: 4, h: 0.35,
    fontFace: B.FONT_HEAD, fontSize: 11, bold: true,
    color: B.AMBER_SOFT, charSpacing: 4, margin: 0,
  });
  s.addText("3 to 5", {
    x: 8.4, y: 3.7, w: 4.4, h: 1.2,
    fontFace: B.FONT_HEAD, fontSize: 80, bold: true, color: B.CORAL_BRIGHT, margin: 0,
  });
  s.addText("hours of careful agent reading", {
    x: 8.4, y: 4.9, w: 4.2, h: 0.5,
    fontFace: B.FONT_BODY, fontSize: 14, color: B.WHITE, margin: 0,
  });
  s.addText("That an agent is not billing for, not closing deals during, and rarely actually completes.", {
    x: 8.4, y: 5.5, w: 4.2, h: 1.2,
    fontFace: B.FONT_BODY, fontSize: 12, color: B.SLATE_300, margin: 0,
    lineSpacingMultiple: 1.35,
  });
  addMark(s);
}

// ---------- 3. The hidden cost -----------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addPageTitle(
    s, 3,
    "Why this matters at the brokerage level",
    "Disclosure misses cost more than the agent's time.",
  );

  const costs = [
    { n: "$300+", l: "paralegal-equivalent labor for a careful read (3 to 5 hours at a loaded rate)" },
    { n: "1 in 6", l: "deals that hit a renegotiation or a fall-out moment driven by a missed disclosure (industry estimate)" },
    { n: "$10K+", l: "average concession cost when a critical finding surfaces post-contingency" },
    { n: "Years", l: "of client referral pipeline destroyed when the buyer feels they were not protected" },
  ];

  costs.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.3;
    const y = 3.1 + row * 1.85;
    s.addShape("rect", {
      x, y, w: 6.0, h: 1.65,
      fill: { color: B.CREAM }, line: { type: "none" },
    });
    s.addText(c.n, {
      x: x + 0.3, y: y + 0.2, w: 2.0, h: 1.2,
      fontFace: B.FONT_HEAD, fontSize: 40, bold: true, color: B.CORAL, margin: 0,
    });
    s.addText(c.l, {
      x: x + 2.5, y: y + 0.25, w: 3.4, h: 1.3,
      fontFace: B.FONT_BODY, fontSize: 13, color: B.SLATE_700, margin: 0, lineSpacingMultiple: 1.4,
    });
  });

  s.addText(
    "These costs land on the brokerage P&L through E&O claims, lost referrals, and the agents who quit when the deal volume drops.",
    {
      x: 0.5, y: 6.9, w: 12.3, h: 0.4,
      fontFace: B.FONT_BODY, fontSize: 13, italic: true, color: B.SLATE_700, margin: 0,
    },
  );

  addMark(s);
}

// ---------- 4. The Veroax solution -------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addPageTitle(
    s, 4,
    "What Veroax does",
    "Upload to client-ready PDF in 90 seconds.",
    "Same disclosure package. A 14-section, severity-rated, regionally-priced buyer report your agent ships with their name on it.",
  );

  const cards = [
    {
      title: "Catches what skimming misses",
      body: "Hybrid pipeline reads native PDFs (check-boxes, signatures, side-by-side TDS / SPQ tables) and extracts long HOA bundles. Every finding tagged with confidence so the agent and buyer know what's direct and what's inferred.",
    },
    {
      title: "Numbers grounded in your market",
      body: "Regional cost reference library calibrated to nine California markets, refreshed biweekly. Foundation work in Oakland is not the same number as foundation work in Carmel and the report knows the difference.",
    },
    {
      title: "Ships as your brand, not ours",
      body: "PDF cover, running headers, share-link page, and client email all carry your brokerage colors, logo, agent headshot, agent DRE, and brokerage DRE. We power the analysis. The deliverable is yours.",
    },
  ];

  cards.forEach((c, i) => {
    const x = 0.5 + i * 4.25;
    const y = 3.1;
    s.addShape("rect", { x, y, w: 4.0, h: 3.7, fill: { color: B.CREAM }, line: { type: "none" } });
    s.addShape("rect", { x, y, w: 4.0, h: 0.12, fill: { color: B.TEAL }, line: { type: "none" } });
    s.addShape("ellipse", {
      x: x + 0.3, y: y + 0.35, w: 0.55, h: 0.55,
      fill: { color: B.CORAL }, line: { type: "none" },
    });
    s.addText(String(i + 1), {
      x: x + 0.3, y: y + 0.35, w: 0.55, h: 0.55,
      fontFace: B.FONT_HEAD, fontSize: 18, bold: true, color: B.WHITE,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(c.title, {
      x: x + 0.3, y: y + 1.0, w: 3.4, h: 0.8,
      fontFace: B.FONT_HEAD, fontSize: 17, bold: true, color: B.SLATE_900,
      margin: 0, lineSpacingMultiple: 1.2,
    });
    s.addText(c.body, {
      x: x + 0.3, y: y + 1.9, w: 3.4, h: 1.7,
      fontFace: B.FONT_BODY, fontSize: 12, color: B.SLATE_700,
      margin: 0, lineSpacingMultiple: 1.35,
    });
  });

  addMark(s);
}

// ---------- 5. Inside the report ---------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addPageTitle(
    s, 5,
    "Inside the report",
    "14 sections, every one defensible.",
    "What your client actually sees. Every page is structured. Every finding is sourced.",
  );

  const sections = [
    "Property snapshot",
    "Executive narrative",
    "Strengths summary",
    "Critical + High findings",
    "Moderate findings",
    "Cosmetic notes",
    "Title + vesting review",
    "HOA review (when applicable)",
    "Environmental hazards (NHD)",
    "Inspection follow-ups",
    "Repair cost summary",
    "Market context",
    "Negotiation leverage",
    "Overall property rating",
  ];
  sections.forEach((sec, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.3;
    const y = 3.0 + row * 0.52;
    s.addShape("rect", {
      x, y, w: 6.0, h: 0.42,
      fill: { color: i % 2 === 0 ? B.CREAM : B.SLATE_100 }, line: { type: "none" },
    });
    s.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.15, y: y + 0.04, w: 0.6, h: 0.35,
      fontFace: B.FONT_HEAD, fontSize: 11, bold: true, color: B.CORAL, margin: 0,
    });
    s.addText(sec, {
      x: x + 0.75, y: y + 0.04, w: 5.2, h: 0.35,
      fontFace: B.FONT_BODY, fontSize: 13, color: B.SLATE_900, margin: 0,
    });
  });

  addMark(s);
}

// ---------- 6. Quality safeguards --------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.NAVY };
  addSlideChip(s, 6, true);
  s.addText("Quality safeguards", {
    x: 0.5, y: 0.85, w: 12, h: 0.4,
    fontFace: B.FONT_HEAD, fontSize: 11, bold: true,
    color: B.AMBER_SOFT, charSpacing: 5, margin: 0,
  });
  s.addText("Why your office will trust the output.", {
    x: 0.5, y: 1.25, w: 12.3, h: 1.0,
    fontFace: B.FONT_HEAD, fontSize: 32, bold: true, color: B.WHITE, margin: 0,
  });

  const safeguards = [
    { h: "Temperature 0", b: "Same package, same report. Determinism makes the analysis auditable." },
    { h: "Confidence tags", b: "High / Medium / Low on every finding so the agent knows what's a direct read vs. an inference." },
    { h: "Agent QA gate", b: "No PDF generates until the agent reviews the structured summary and approves. Edits are tracked." },
    { h: "Disclaimer + scope", b: "Every report carries the same legal framing the buyer's lawyer would expect to see." },
    { h: "Source citations", b: "Every finding ties back to the page and document it came from. Click-to-source on the dashboard." },
    { h: "Severity rubric", b: "Critical = deal-killer, High = leverage, Moderate = address, Cosmetic = note. Consistent across reports." },
  ];

  safeguards.forEach((sg, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + col * 4.25;
    const y = 3.0 + row * 1.95;
    s.addShape("rect", {
      x, y, w: 4.0, h: 1.75,
      fill: { color: B.NAVY_DEEP }, line: { color: B.TEAL, width: 1 },
    });
    s.addText(sg.h, {
      x: x + 0.25, y: y + 0.2, w: 3.5, h: 0.45,
      fontFace: B.FONT_HEAD, fontSize: 16, bold: true, color: B.TEAL_BRIGHT, margin: 0,
    });
    s.addText(sg.b, {
      x: x + 0.25, y: y + 0.7, w: 3.5, h: 1.0,
      fontFace: B.FONT_BODY, fontSize: 12, color: B.SLATE_300, margin: 0, lineSpacingMultiple: 1.35,
    });
  });

  addMark(s, true);
}

// ---------- 7. White-label experience ----------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addPageTitle(
    s, 7,
    "Built for your brand",
    "Veroax is a wholesale engine. Your office is the brand the client sees.",
  );

  // Three surfaces (icon block + label) on the left, sample-cover-y rectangle on the right.
  const surfaces = [
    {
      h: "Branded PDF",
      b: "Cover, running header, footer all carry your colors, logo, agent headshot, agent DRE, brokerage DRE.",
    },
    {
      h: "Branded share link",
      b: "Public /r/{code} URL where the buyer reads the report on mobile. Looks like your brokerage's site.",
    },
    {
      h: "Branded client email",
      b: "Pre-written, agent-editable, sent from your domain. The buyer never sees the word Veroax.",
    },
    {
      h: "Multi-agent dashboard",
      b: "Broker / owner sees every report across the office. Per-agent activity, throughput, error log.",
    },
  ];
  surfaces.forEach((sf, i) => {
    const y = 3.1 + i * 0.95;
    s.addShape("ellipse", {
      x: 0.5, y, w: 0.7, h: 0.7,
      fill: { color: B.TEAL }, line: { type: "none" },
    });
    s.addText(String(i + 1), {
      x: 0.5, y, w: 0.7, h: 0.7,
      fontFace: B.FONT_HEAD, fontSize: 18, bold: true, color: B.WHITE,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(sf.h, {
      x: 1.4, y: y + 0.02, w: 5.5, h: 0.35,
      fontFace: B.FONT_HEAD, fontSize: 15, bold: true, color: B.SLATE_900, margin: 0,
    });
    s.addText(sf.b, {
      x: 1.4, y: y + 0.4, w: 5.5, h: 0.55,
      fontFace: B.FONT_BODY, fontSize: 12, color: B.SLATE_700, margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  // Mock PDF cover on the right
  s.addShape("rect", {
    x: 7.7, y: 3.0, w: 5.1, h: 3.8,
    fill: { color: B.CREAM }, line: { color: B.SLATE_300, width: 1 },
  });
  s.addShape("rect", {
    x: 7.7, y: 3.0, w: 0.25, h: 3.8,
    fill: { color: B.CORAL }, line: { type: "none" },
  });
  s.addText("YOUR BROKERAGE LOGO HERE", {
    x: 8.1, y: 3.2, w: 4.5, h: 0.35,
    fontFace: B.FONT_HEAD, fontSize: 10, bold: true, color: B.SLATE_500, charSpacing: 3, margin: 0,
  });
  s.addText("Disclosure Analysis Report", {
    x: 8.1, y: 3.6, w: 4.5, h: 0.4,
    fontFace: B.FONT_HEAD, fontSize: 14, bold: true, color: B.AMBER, margin: 0,
  });
  s.addText("123 Example Drive\nSample City, CA 95000", {
    x: 8.1, y: 4.05, w: 4.5, h: 0.9,
    fontFace: B.FONT_HEAD, fontSize: 20, bold: true, color: B.SLATE_900, margin: 0,
    lineSpacingMultiple: 1.15,
  });
  s.addText("Prepared for", {
    x: 8.1, y: 5.1, w: 4.5, h: 0.3,
    fontFace: B.FONT_HEAD, fontSize: 9, bold: true, color: B.SLATE_500, charSpacing: 3, margin: 0,
  });
  s.addText("Jane Buyer", {
    x: 8.1, y: 5.4, w: 4.5, h: 0.35,
    fontFace: B.FONT_HEAD, fontSize: 14, bold: true, color: B.SLATE_900, margin: 0,
  });
  s.addText("Prepared by", {
    x: 8.1, y: 5.85, w: 4.5, h: 0.3,
    fontFace: B.FONT_HEAD, fontSize: 9, bold: true, color: B.SLATE_500, charSpacing: 3, margin: 0,
  });
  s.addText("Agent Name, Your Brokerage", {
    x: 8.1, y: 6.15, w: 4.5, h: 0.35,
    fontFace: B.FONT_HEAD, fontSize: 13, bold: true, color: B.SLATE_900, margin: 0,
  });
  s.addText("DRE #01234567   •   (xxx) xxx-xxxx", {
    x: 8.1, y: 6.45, w: 4.5, h: 0.3,
    fontFace: B.FONT_BODY, fontSize: 11, color: B.SLATE_700, margin: 0,
  });

  addMark(s);
}

// ---------- 8. Plans for brokerages ------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addPageTitle(
    s, 8,
    "Plans",
    "Pricing for brokerages.",
    "Pick the tier that fits your office. Enterprise contracts available above 25 seats.",
  );

  const plans = [
    {
      name: "Pro",
      best: "Small teams (2 to 3 agents)",
      price: "$149 / mo",
      bullets: [
        "10 disclosure reports / month",
        "3 agent seats included",
        "Custom brokerage colors + logo",
        "Priority email support",
      ],
    },
    {
      name: "Brokerage",
      best: "Mid-size offices (10 to 25 agents)",
      price: "$449 / mo",
      highlight: true,
      bullets: [
        "40 disclosure reports / month",
        "25 agent seats included",
        "Brokerage-wide reporting dashboard",
        "Onboarding call + dedicated CSM",
        "White-label (no Veroax wordmark)",
      ],
    },
    {
      name: "Enterprise",
      best: "Brokerages above 25 agents",
      price: "Talk to us",
      bullets: [
        "Volume-based pricing, typically under $15 / report",
        "Unlimited reports + unlimited seats",
        "MLS / dotloop / Skyslope integration",
        "SOC 2 attestation roadmap",
        "Quarterly business review",
      ],
    },
  ];

  plans.forEach((p, i) => {
    const x = 0.5 + i * 4.25;
    const y = 3.1;
    const w = 4.0;
    const h = 3.7;
    s.addShape("rect", {
      x, y, w, h,
      fill: { color: p.highlight ? B.CORAL : B.CREAM },
      line: { color: p.highlight ? B.CORAL : B.SLATE_300, width: 1 },
    });
    if (p.highlight) {
      s.addText("RECOMMENDED", {
        x: x + 1.0, y: y - 0.18, w: 2.0, h: 0.35,
        fontFace: B.FONT_HEAD, fontSize: 9, bold: true, color: B.WHITE,
        fill: { color: B.NAVY_DEEP }, align: "center", charSpacing: 3, margin: 4,
      });
    }
    s.addText(p.name, {
      x: x + 0.3, y: y + 0.2, w: w - 0.6, h: 0.45,
      fontFace: B.FONT_HEAD, fontSize: 18, bold: true,
      color: p.highlight ? B.WHITE : B.SLATE_900, margin: 0,
    });
    s.addText(p.best, {
      x: x + 0.3, y: y + 0.65, w: w - 0.6, h: 0.3,
      fontFace: B.FONT_BODY, fontSize: 11,
      color: p.highlight ? B.CREAM : B.SLATE_500, margin: 0,
    });
    s.addText(p.price, {
      x: x + 0.3, y: y + 1.0, w: w - 0.6, h: 0.7,
      fontFace: B.FONT_HEAD, fontSize: 28, bold: true,
      color: p.highlight ? B.WHITE : B.CORAL, margin: 0,
    });
    p.bullets.forEach((b, j) => {
      const by = y + 1.85 + j * 0.32;
      s.addShape("ellipse", {
        x: x + 0.3, y: by + 0.08, w: 0.12, h: 0.12,
        fill: { color: p.highlight ? B.TEAL_BRIGHT : B.TEAL }, line: { type: "none" },
      });
      s.addText(b, {
        x: x + 0.5, y: by, w: w - 0.7, h: 0.3,
        fontFace: B.FONT_BODY, fontSize: 11,
        color: p.highlight ? B.WHITE : B.SLATE_700, margin: 0,
      });
    });
  });

  addMark(s);
}

// ---------- 9. ROI math ------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.CREAM };
  addPageTitle(
    s, 9,
    "ROI",
    "The math for a 15-agent office.",
    "Assumes each agent runs 2 disclosure-eligible deals per month and the brokerage adopts the Brokerage tier.",
  );

  // Left column: math breakdown.
  const lines = [
    { l: "Agents", v: "15" },
    { l: "Deals per agent per month", v: "2" },
    { l: "Disclosure packages per month", v: "30" },
    { l: "Agent time saved per package (avg)", v: "3 hours" },
    { l: "Total time saved per month", v: "90 hours" },
    { l: "Loaded agent hourly value", v: "$75 / hr" },
    { l: "Time-value saved per month", v: "$6,750", strong: true },
    { l: "Veroax Brokerage plan", v: "$449 / mo" },
    { l: "Overage at $15 / report (none in this tier)", v: "$0" },
    { l: "Net monthly savings", v: "$6,301", strong: true, color: B.EMERALD },
    { l: "Annual return", v: "$75,612", strong: true, color: B.EMERALD },
  ];
  lines.forEach((line, i) => {
    const y = 3.05 + i * 0.32;
    s.addShape("rect", {
      x: 0.5, y, w: 7.2, h: 0.3,
      fill: { color: i % 2 === 0 ? B.WHITE : B.SLATE_100 }, line: { type: "none" },
    });
    s.addText(line.l, {
      x: 0.65, y: y + 0.03, w: 4.6, h: 0.25,
      fontFace: B.FONT_BODY, fontSize: 12,
      bold: line.strong || false,
      color: B.SLATE_900, margin: 0,
    });
    s.addText(line.v, {
      x: 5.4, y: y + 0.03, w: 2.2, h: 0.25,
      fontFace: B.FONT_HEAD, fontSize: 12, bold: true,
      color: line.color || B.SLATE_900,
      align: "right", margin: 0,
    });
  });

  // Right column: outcome card
  s.addShape("rect", {
    x: 8.2, y: 3.05, w: 4.6, h: 3.6,
    fill: { color: B.NAVY_DEEP }, line: { type: "none" },
  });
  s.addText("Net result", {
    x: 8.4, y: 3.25, w: 4, h: 0.35,
    fontFace: B.FONT_HEAD, fontSize: 11, bold: true,
    color: B.AMBER_SOFT, charSpacing: 4, margin: 0,
  });
  s.addText("14x", {
    x: 8.4, y: 3.6, w: 4.2, h: 1.4,
    fontFace: B.FONT_HEAD, fontSize: 110, bold: true, color: B.CORAL_BRIGHT, margin: 0,
  });
  s.addText("return on plan cost", {
    x: 8.4, y: 5.0, w: 4.2, h: 0.4,
    fontFace: B.FONT_BODY, fontSize: 14, color: B.WHITE, margin: 0,
  });
  s.addText(
    "Plus a defensible analytical aid in every client's hand. Plus a brokerage-wide consistency standard. Plus E&O posture that improves with the audit trail.",
    {
      x: 8.4, y: 5.5, w: 4.2, h: 1.3,
      fontFace: B.FONT_BODY, fontSize: 11, color: B.SLATE_300,
      margin: 0, lineSpacingMultiple: 1.4,
    },
  );

  addMark(s);
}

// ---------- 10. Privacy + compliance -----------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addPageTitle(
    s, 10,
    "Privacy + compliance",
    "Built for a regulated category.",
    "What your compliance officer wants to know before signing.",
  );

  const policies = [
    { h: "No PII in the audit log", b: "Buyer / seller / financial / lender data never lands in our operational logs. Filenames are SHA-256 hashed before logging." },
    { h: "No model training on your data", b: "Contracts with Anthropic and any other model providers explicitly prohibit using customer content for foundation-model training." },
    { h: "Row-level security on every table", b: "Each agent / brokerage only sees their own data. Admin access is service-role and itself logged." },
    { h: "California-resident processing", b: "Compute runs on Vercel (US regions). Storage runs on Supabase / AWS US-West. Data residency is documentable for clients who ask." },
    { h: "Encrypted at rest and in transit", b: "TLS for every request. Supabase encrypts the at-rest storage with AES-256." },
    { h: "Audit trail per report", b: "Every analyze, edit, send, share, and delete event is logged with actor, timestamp, and operational metadata." },
  ];

  policies.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.3;
    const y = 3.1 + row * 1.25;
    s.addShape("rect", {
      x, y, w: 6.0, h: 1.15,
      fill: { color: B.CREAM }, line: { type: "none" },
    });
    s.addText("✓", {
      x: x + 0.2, y: y + 0.2, w: 0.5, h: 0.8,
      fontFace: B.FONT_HEAD, fontSize: 26, bold: true, color: B.EMERALD,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(p.h, {
      x: x + 0.85, y: y + 0.15, w: 5.0, h: 0.35,
      fontFace: B.FONT_HEAD, fontSize: 14, bold: true, color: B.SLATE_900, margin: 0,
    });
    s.addText(p.b, {
      x: x + 0.85, y: y + 0.5, w: 5.0, h: 0.6,
      fontFace: B.FONT_BODY, fontSize: 11.5, color: B.SLATE_700, margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  addMark(s);
}

// ---------- 11. Implementation -----------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addPageTitle(
    s, 11,
    "Getting started",
    "Two-week implementation, light lift on your side.",
  );

  const steps = [
    {
      n: "Week 1",
      h: "Brand + onboarding",
      b: "We collect your logo, colors, brokerage DRE, agent roster, and email-domain config. You get a single onboarding call to walk through the platform. Test reports run against a sample disclosure package.",
    },
    {
      n: "Week 2",
      h: "Agent rollout + training",
      b: "Each agent gets their free trial credit and a 20-minute live training (group or individual). Office admin sees the brokerage-wide dashboard. First production reports go live by end of week.",
    },
    {
      n: "Ongoing",
      h: "Dedicated success",
      b: "Quarterly business review with usage, ROI, and any quality issues. Direct line to the founder for escalations during the first 90 days. Roadmap input weighted by usage.",
    },
  ];

  steps.forEach((step, i) => {
    const y = 3.0 + i * 1.3;
    s.addShape("rect", {
      x: 0.5, y, w: 2.0, h: 1.1,
      fill: { color: i === 0 ? B.CORAL : i === 1 ? B.TEAL : B.NAVY },
      line: { type: "none" },
    });
    s.addText(step.n, {
      x: 0.5, y: y + 0.3, w: 2.0, h: 0.5,
      fontFace: B.FONT_HEAD, fontSize: 18, bold: true, color: B.WHITE,
      align: "center", margin: 0,
    });
    s.addShape("rect", {
      x: 2.7, y, w: 10.1, h: 1.1,
      fill: { color: B.CREAM }, line: { type: "none" },
    });
    s.addText(step.h, {
      x: 2.9, y: y + 0.12, w: 9.7, h: 0.4,
      fontFace: B.FONT_HEAD, fontSize: 16, bold: true, color: B.SLATE_900, margin: 0,
    });
    s.addText(step.b, {
      x: 2.9, y: y + 0.5, w: 9.7, h: 0.55,
      fontFace: B.FONT_BODY, fontSize: 12.5, color: B.SLATE_700, margin: 0, lineSpacingMultiple: 1.3,
    });
  });

  addMark(s);
}

// ---------- 12. Close --------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.NAVY_DEEP };

  s.addShape("rect", { x: 0, y: 0, w: 0.5, h: SLIDE_H, fill: { color: B.CORAL }, line: { type: "none" } });
  s.addShape("rect", { x: 0.5, y: 0, w: 0.2, h: SLIDE_H, fill: { color: B.TEAL }, line: { type: "none" } });

  s.addText("Next step", {
    x: 1.4, y: 1.0, w: 11, h: 0.5,
    fontFace: B.FONT_HEAD, fontSize: 14, bold: true,
    color: B.AMBER_SOFT, charSpacing: 6, margin: 0,
  });

  s.addText("Run a free disclosure analysis on a real package from your office.", {
    x: 1.4, y: 1.7, w: 11.5, h: 1.8,
    fontFace: B.FONT_HEAD, fontSize: 34, bold: true, color: B.WHITE, margin: 0,
    lineSpacingMultiple: 1.15,
  });

  s.addText(
    "Pick a recent transaction with a meaty disclosure package. We will run the analysis at no cost, send you the branded PDF, and walk you through the result. If the report would have saved your agent three hours, the rest of the conversation is easy.",
    {
      x: 1.4, y: 3.9, w: 11, h: 1.8,
      fontFace: B.FONT_BODY_LIGHT, fontSize: 17, color: B.SLATE_300,
      margin: 0, lineSpacingMultiple: 1.4,
    },
  );

  s.addShape("rect", {
    x: 1.4, y: 5.9, w: 10.5, h: 1.0,
    fill: { color: B.NAVY }, line: { color: B.TEAL_BRIGHT, width: 1 },
  });
  s.addText("Michael Fielden, Founder", {
    x: 1.7, y: 6.0, w: 5.5, h: 0.45,
    fontFace: B.FONT_HEAD, fontSize: 17, bold: true, color: B.WHITE, margin: 0,
  });
  s.addText("michael@michaelfielden.com   •   (866) 247-8833", {
    x: 1.7, y: 6.45, w: 8, h: 0.35,
    fontFace: B.FONT_BODY, fontSize: 13, color: B.TEAL_BRIGHT, margin: 0,
  });
  s.addText("www.veroax.com", {
    x: 8.8, y: 6.0, w: 3, h: 0.45,
    fontFace: B.FONT_HEAD, fontSize: 17, bold: true, color: B.WHITE, margin: 0,
    align: "right",
  });
  s.addText("Schedule a call ›", {
    x: 8.8, y: 6.45, w: 3, h: 0.35,
    fontFace: B.FONT_BODY, fontSize: 13, color: B.SLATE_300, align: "right", margin: 0,
  });

  s.addText(
    [
      { text: "veroax", options: { color: B.CORAL_BRIGHT, fontSize: 22, bold: true } },
      { text: "•", options: { color: B.TEAL_BRIGHT, fontSize: 22, bold: true } },
    ],
    {
      x: SLIDE_W - 2.5, y: SLIDE_H - 0.7, w: 2.2, h: 0.4,
      fontFace: B.FONT_HEAD, align: "right", margin: 0,
    },
  );
}

// ---------- save -------------------------------------------------

pptx
  .writeFile({ fileName: path.join(__dirname, "veroax-brokerage-sales.pptx") })
  .then((name) => console.log("wrote:", name));

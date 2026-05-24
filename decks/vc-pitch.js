// Veroax VC / angel pitch deck.
// Run with `node decks/vc-pitch.js` to produce veroax-vc-pitch.pptx.
//
// Format: 16:9, 10 slides. Each slide reuses a small set of layout
// primitives (cover, content-with-side-stat, two-column, big-stat,
// closing) so the deck reads as a designed set rather than a row
// of unrelated boards.

const pptxgen = require("pptxgenjs");
const B = require("./_brand");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pptx.title = "Veroax — investor pitch";
pptx.author = "Veroax, Inc.";
pptx.company = "Veroax, Inc.";

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

// ===== layout helpers ===========================================

// Branded mark in the bottom-right corner of every content slide.
function addMark(slide, opts = {}) {
  const onDark = !!opts.onDark;
  slide.addText(
    [
      {
        text: "veroax",
        options: {
          fontFace: B.FONT_HEAD,
          fontSize: 12,
          bold: true,
          color: onDark ? B.CORAL_BRIGHT : B.CORAL,
        },
      },
      {
        text: " • ",
        options: {
          fontFace: B.FONT_HEAD,
          fontSize: 12,
          bold: true,
          color: onDark ? B.TEAL_BRIGHT : B.TEAL,
        },
      },
    ],
    {
      x: SLIDE_W - 1.6,
      y: SLIDE_H - 0.45,
      w: 1.4,
      h: 0.3,
      align: "right",
      margin: 0,
    },
  );
}

// Numbered slide chip top-left.
function addSlideChip(slide, n, total, onDark) {
  slide.addText(`${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, {
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

// ===== slides ===================================================

const TOTAL = 10;

// 1. Cover ---------------------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.NAVY_DEEP };

  // Coral + teal accent block (top-left)
  s.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.5,
    h: SLIDE_H,
    fill: { color: B.CORAL },
    line: { color: B.CORAL },
  });
  s.addShape("rect", {
    x: 0.5,
    y: 0,
    w: 0.2,
    h: SLIDE_H,
    fill: { color: B.TEAL },
    line: { color: B.TEAL },
  });

  s.addText("Investor briefing", {
    x: 1.4,
    y: 1.0,
    w: 8,
    h: 0.4,
    fontFace: B.FONT_HEAD,
    fontSize: 12,
    bold: true,
    color: B.AMBER_SOFT,
    charSpacing: 6,
    margin: 0,
  });

  s.addText(
    [
      { text: "veroax", options: { color: B.CORAL_BRIGHT, fontSize: 78, bold: true } },
      { text: "•", options: { color: B.TEAL_BRIGHT, fontSize: 78, bold: true } },
    ],
    {
      x: 1.4,
      y: 1.5,
      w: 10,
      h: 1.4,
      fontFace: B.FONT_HEAD,
      margin: 0,
    },
  );

  s.addText("AI-assisted disclosure analysis for residential real estate", {
    x: 1.4,
    y: 3.0,
    w: 10.5,
    h: 1.0,
    fontFace: B.FONT_HEAD,
    fontSize: 30,
    color: B.WHITE,
    bold: false,
    margin: 0,
  });

  s.addText(
    "We turn a 200 to 700 page California disclosure package into a polished, severity-rated, regionally-priced buyer report in 90 seconds. Agents win deals. Buyers stop getting blindsided.",
    {
      x: 1.4,
      y: 4.4,
      w: 9.5,
      h: 1.4,
      fontFace: B.FONT_BODY_LIGHT,
      fontSize: 18,
      color: B.SLATE_300,
      margin: 0,
      paraSpaceAfter: 8,
    },
  );

  s.addText(
    [
      { text: "Michael Fielden, Founder", options: { bold: true, color: B.WHITE } },
      { text: "  •  ", options: { color: B.TEAL_BRIGHT } },
      { text: "michael@michaelfielden.com", options: { color: B.SLATE_300 } },
      { text: "  •  ", options: { color: B.TEAL_BRIGHT } },
      { text: "(866) 247-8833", options: { color: B.SLATE_300 } },
    ],
    {
      x: 1.4,
      y: 6.6,
      w: 11,
      h: 0.35,
      fontFace: B.FONT_BODY,
      fontSize: 12,
      margin: 0,
    },
  );
}

// 2. Problem ------------------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.CREAM };
  addSlideChip(s, 2, TOTAL);

  s.addText("The disclosure package is where deals go sideways", {
    x: 0.5,
    y: 0.9,
    w: 12,
    h: 1.0,
    fontFace: B.FONT_HEAD,
    fontSize: 36,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
  });

  s.addText(
    "Every California residential resale ships with 200 to 700 pages of disclosures: TDS, SPQ, AVID, NHD, HOA documents, inspection reports, third-party reports. Buyer's agents have hours, not days. So they skim.",
    {
      x: 0.5,
      y: 2.0,
      w: 7.5,
      h: 1.6,
      fontFace: B.FONT_BODY,
      fontSize: 17,
      color: B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.3,
    },
  );

  // Right column: big number callouts.
  const stats = [
    { n: "200-700", l: "pages per package" },
    { n: "3 to 5 hr", l: "agent time to do it right" },
    { n: "$0", l: "what agents bill for that time" },
    { n: "60%+", l: "of CA deals hit a renegotiation moment a careful read could have flagged earlier (practitioner estimate)" },
  ];
  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 8.3 + col * 2.5;
    const y = 2.0 + row * 1.6;
    const s2 = s;
    s2.addShape("rect", {
      x,
      y,
      w: 2.3,
      h: 1.4,
      fill: { color: B.WHITE },
      line: { color: B.SLATE_300, width: 1 },
    });
    s2.addText(stat.n, {
      x: x + 0.15,
      y: y + 0.15,
      w: 2,
      h: 0.6,
      fontFace: B.FONT_HEAD,
      fontSize: 26,
      bold: true,
      color: B.CORAL,
      margin: 0,
    });
    s2.addText(stat.l, {
      x: x + 0.15,
      y: y + 0.75,
      w: 2,
      h: 0.6,
      fontFace: B.FONT_BODY,
      fontSize: 10,
      color: B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.2,
    });
  });

  s.addText(
    "Buyers learn about the unpermitted addition, the FPE panel, the failing roof, or the active HOA litigation AFTER they have removed contingencies. The agent absorbs the trust hit.",
    {
      x: 0.5,
      y: 5.4,
      w: 12.3,
      h: 1.2,
      fontFace: B.FONT_BODY,
      fontSize: 16,
      italic: true,
      color: B.SLATE_900,
      margin: 0,
      lineSpacingMultiple: 1.35,
    },
  );

  addMark(s);
}

// 3. Solution -----------------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addSlideChip(s, 3, TOTAL);

  s.addText("Upload the package. Deliver a defensible review in 90 seconds.", {
    x: 0.5,
    y: 0.9,
    w: 12.3,
    h: 1.0,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
  });

  const cards = [
    {
      title: "Multi-pass AI pipeline",
      body: "Native PDF attachments for seller disclosures and inspection reports (Claude sees check-boxes, signatures, side-by-side tables). Text extraction for HOA bundles. Temperature locked at 0 so re-runs match.",
    },
    {
      title: "14-section client-ready report",
      body: "Severity-rated findings (Critical / High / Moderate / Cosmetic), regional cost estimates grounded in California pricing data, HOA review, environmental hazards, negotiation leverage, an overall property rating.",
    },
    {
      title: "Branded PDF the agent ships",
      body: "Agent's logo, photo, contact details. Public web share link plus a one-click email send. The buyer holds a deliverable they can defend. The agent looks thorough on day one.",
    },
  ];

  cards.forEach((c, i) => {
    const x = 0.5 + i * 4.25;
    const y = 2.4;
    const w = 4.0;
    const h = 3.6;

    // Card background
    s.addShape("rect", {
      x,
      y,
      w,
      h,
      fill: { color: B.CREAM },
      line: { type: "none" },
    });
    // Coral top accent
    s.addShape("rect", {
      x,
      y,
      w,
      h: 0.12,
      fill: { color: B.CORAL },
      line: { type: "none" },
    });
    // Numbered teal dot
    s.addShape("ellipse", {
      x: x + 0.3,
      y: y + 0.35,
      w: 0.55,
      h: 0.55,
      fill: { color: B.TEAL },
      line: { type: "none" },
    });
    s.addText(String(i + 1), {
      x: x + 0.3,
      y: y + 0.35,
      w: 0.55,
      h: 0.55,
      fontFace: B.FONT_HEAD,
      fontSize: 18,
      bold: true,
      color: B.WHITE,
      align: "center",
      valign: "middle",
      margin: 0,
    });

    s.addText(c.title, {
      x: x + 0.3,
      y: y + 1.05,
      w: w - 0.6,
      h: 0.7,
      fontFace: B.FONT_HEAD,
      fontSize: 18,
      bold: true,
      color: B.SLATE_900,
      margin: 0,
    });
    s.addText(c.body, {
      x: x + 0.3,
      y: y + 1.85,
      w: w - 0.6,
      h: h - 2.0,
      fontFace: B.FONT_BODY,
      fontSize: 12,
      color: B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.35,
    });
  });

  s.addText(
    "All built for California disclosures first. The pipeline ports to Texas, Florida, and Washington with the same architecture.",
    {
      x: 0.5,
      y: 6.4,
      w: 12.3,
      h: 0.5,
      fontFace: B.FONT_BODY,
      fontSize: 13,
      italic: true,
      color: B.SLATE_500,
      margin: 0,
    },
  );

  addMark(s);
}

// 4. How it works -------------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addSlideChip(s, 4, TOTAL);

  s.addText("How it works", {
    x: 0.5,
    y: 0.9,
    w: 12,
    h: 0.8,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
  });

  s.addText(
    "From upload to client-ready deliverable in three steps. The agent stays in the loop on the last one.",
    {
      x: 0.5,
      y: 1.7,
      w: 12,
      h: 0.5,
      fontFace: B.FONT_BODY,
      fontSize: 14,
      color: B.SLATE_700,
      margin: 0,
    },
  );

  const steps = [
    {
      n: "01",
      t: "Upload the package",
      d: "Drop in the PDFs from Disclosures.io or any other source. Multi-PDF packages auto-split for the analyzer's context window.",
    },
    {
      n: "02",
      t: "Pipeline runs the 14-section analysis",
      d: "Regional cost reference library is built fresh per market. Every finding tagged with confidence (High / Medium / Low).",
    },
    {
      n: "03",
      t: "Agent reviews, then client gets the PDF",
      d: "A structured QA view shows critical and high findings first. Approve, edit if needed, branded PDF + client email ready to send.",
    },
  ];

  steps.forEach((step, i) => {
    const y = 2.7 + i * 1.4;
    // Big number in teal circle
    s.addShape("ellipse", {
      x: 0.7,
      y,
      w: 0.95,
      h: 0.95,
      fill: { color: i === 0 ? B.CORAL : i === 1 ? B.TEAL : B.NAVY },
      line: { type: "none" },
    });
    s.addText(step.n, {
      x: 0.7,
      y,
      w: 0.95,
      h: 0.95,
      fontFace: B.FONT_HEAD,
      fontSize: 22,
      bold: true,
      color: B.WHITE,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    s.addText(step.t, {
      x: 1.9,
      y: y + 0.05,
      w: 11,
      h: 0.45,
      fontFace: B.FONT_HEAD,
      fontSize: 20,
      bold: true,
      color: B.SLATE_900,
      margin: 0,
    });
    s.addText(step.d, {
      x: 1.9,
      y: y + 0.55,
      w: 11,
      h: 0.7,
      fontFace: B.FONT_BODY,
      fontSize: 13,
      color: B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.3,
    });
  });

  addMark(s);
}

// 5. Market -------------------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.NAVY };
  addSlideChip(s, 5, TOTAL, true);

  s.addText("Market", {
    x: 0.5,
    y: 0.9,
    w: 12,
    h: 0.8,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.WHITE,
    margin: 0,
  });
  s.addText("California first. Then the next three highest-volume disclosure-heavy markets.", {
    x: 0.5,
    y: 1.75,
    w: 12,
    h: 0.4,
    fontFace: B.FONT_BODY_LIGHT,
    fontSize: 16,
    color: B.SLATE_300,
    margin: 0,
  });

  // Three big stat callouts
  const headlines = [
    { n: "350K+", l: "licensed real-estate agents in California", c: B.CORAL_BRIGHT },
    { n: "400K+", l: "annual residential transactions in California (NAR / CAR estimates)", c: B.TEAL_BRIGHT },
    { n: "$1.4B", l: "addressable spend per year, agent + paralegal time on disclosure review (CA only, conservative)", c: B.AMBER_SOFT },
  ];
  headlines.forEach((h, i) => {
    const x = 0.5 + i * 4.25;
    const y = 2.6;
    s.addShape("rect", {
      x,
      y,
      w: 4.0,
      h: 2.2,
      fill: { color: B.NAVY_DEEP },
      line: { color: h.c, width: 1.5 },
    });
    s.addText(h.n, {
      x: x + 0.25,
      y: y + 0.2,
      w: 3.5,
      h: 0.9,
      fontFace: B.FONT_HEAD,
      fontSize: 42,
      bold: true,
      color: h.c,
      margin: 0,
    });
    s.addText(h.l, {
      x: x + 0.25,
      y: y + 1.15,
      w: 3.5,
      h: 1.0,
      fontFace: B.FONT_BODY,
      fontSize: 12,
      color: B.SLATE_300,
      margin: 0,
      lineSpacingMultiple: 1.3,
    });
  });

  // Expansion ribbon
  s.addText("Expansion sequence", {
    x: 0.5,
    y: 5.2,
    w: 12,
    h: 0.4,
    fontFace: B.FONT_HEAD,
    fontSize: 11,
    bold: true,
    color: B.AMBER_SOFT,
    charSpacing: 4,
    margin: 0,
  });
  const states = [
    { l: "California", sub: "Live", c: B.TEAL_BRIGHT },
    { l: "Texas", sub: "2026", c: B.CORAL_BRIGHT },
    { l: "Florida", sub: "2026", c: B.CORAL_BRIGHT },
    { l: "Washington", sub: "2026", c: B.CORAL_BRIGHT },
  ];
  states.forEach((st, i) => {
    const x = 0.5 + i * 3.1;
    const y = 5.7;
    s.addShape("roundRect", {
      x,
      y,
      w: 2.8,
      h: 1.0,
      rectRadius: 0.15,
      fill: { color: B.NAVY_DEEP },
      line: { color: st.c, width: 1 },
    });
    s.addText(st.l, {
      x: x + 0.15,
      y: y + 0.1,
      w: 2.5,
      h: 0.5,
      fontFace: B.FONT_HEAD,
      fontSize: 18,
      bold: true,
      color: B.WHITE,
      margin: 0,
    });
    s.addText(st.sub, {
      x: x + 0.15,
      y: y + 0.55,
      w: 2.5,
      h: 0.4,
      fontFace: B.FONT_BODY,
      fontSize: 12,
      color: st.c,
      margin: 0,
    });
  });

  addMark(s, { onDark: true });
}

// 6. Business model -----------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addSlideChip(s, 6, TOTAL);

  s.addText("Business model", {
    x: 0.5,
    y: 0.9,
    w: 12,
    h: 0.8,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
  });
  s.addText("Subscription + transactional. Margin is strong even at the entry tier.", {
    x: 0.5,
    y: 1.75,
    w: 12,
    h: 0.4,
    fontFace: B.FONT_BODY,
    fontSize: 14,
    color: B.SLATE_700,
    margin: 0,
  });

  // Plan grid
  const plans = [
    { name: "Solo", price: "$49 / mo", desc: "3 reports incl. + $59 each", color: B.SLATE_500 },
    { name: "Pro", price: "$149 / mo", desc: "10 reports incl. + $29 each, 3 seats", color: B.CORAL, highlight: true },
    { name: "Brokerage", price: "$449 / mo", desc: "40 reports incl. + custom, 25 seats", color: B.NAVY },
    { name: "Pay-as-you-go", price: "$25 / report", desc: "Curious agents, occasional use", color: B.TEAL },
  ];
  plans.forEach((p, i) => {
    const x = 0.5 + i * 3.15;
    const y = 2.5;
    s.addShape("rect", {
      x,
      y,
      w: 2.9,
      h: 2.2,
      fill: { color: p.highlight ? B.CORAL : B.CREAM },
      line: { color: p.highlight ? B.CORAL : B.SLATE_300, width: p.highlight ? 0 : 1 },
    });
    s.addText(p.name, {
      x: x + 0.2,
      y: y + 0.15,
      w: 2.5,
      h: 0.45,
      fontFace: B.FONT_HEAD,
      fontSize: 16,
      bold: true,
      color: p.highlight ? B.WHITE : B.SLATE_900,
      margin: 0,
    });
    s.addText(p.price, {
      x: x + 0.2,
      y: y + 0.65,
      w: 2.5,
      h: 0.7,
      fontFace: B.FONT_HEAD,
      fontSize: 26,
      bold: true,
      color: p.highlight ? B.WHITE : p.color,
      margin: 0,
    });
    s.addText(p.desc, {
      x: x + 0.2,
      y: y + 1.4,
      w: 2.5,
      h: 0.7,
      fontFace: B.FONT_BODY,
      fontSize: 11,
      color: p.highlight ? B.CREAM : B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.25,
    });
  });

  // Unit economics block
  s.addShape("rect", {
    x: 0.5,
    y: 5.0,
    w: 12.3,
    h: 1.7,
    fill: { color: B.NAVY_DEEP },
    line: { type: "none" },
  });
  s.addText("Unit economics, per report", {
    x: 0.8,
    y: 5.15,
    w: 8,
    h: 0.35,
    fontFace: B.FONT_HEAD,
    fontSize: 12,
    bold: true,
    color: B.AMBER_SOFT,
    charSpacing: 4,
    margin: 0,
  });
  const ueRows = [
    { l: "Customer pays (Solo overage)", v: "$59.00", c: B.WHITE },
    { l: "Anthropic Sonnet 4.5 cost (typical pkg)", v: "$0.72", c: B.SLATE_300 },
    { l: "Storage + infra (allocated)", v: "$0.15", c: B.SLATE_300 },
    { l: "Gross margin", v: "97.5%", c: B.TEAL_BRIGHT },
  ];
  ueRows.forEach((r, i) => {
    const x = 0.8 + i * 3.0;
    s.addText(r.l, {
      x,
      y: 5.55,
      w: 2.8,
      h: 0.4,
      fontFace: B.FONT_BODY,
      fontSize: 10,
      color: B.SLATE_300,
      margin: 0,
    });
    s.addText(r.v, {
      x,
      y: 5.95,
      w: 2.8,
      h: 0.6,
      fontFace: B.FONT_HEAD,
      fontSize: 24,
      bold: true,
      color: r.c,
      margin: 0,
    });
  });

  addMark(s);
}

// 7. Traction / Why now (combined) --------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.CREAM };
  addSlideChip(s, 7, TOTAL);

  s.addText("Why now", {
    x: 0.5,
    y: 0.9,
    w: 12,
    h: 0.8,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
  });
  s.addText("Three forces converging that did not exist 18 months ago.", {
    x: 0.5,
    y: 1.75,
    w: 12,
    h: 0.4,
    fontFace: B.FONT_BODY,
    fontSize: 14,
    color: B.SLATE_700,
    margin: 0,
  });

  const forces = [
    {
      h: "Model quality crossed the threshold",
      b: "Claude Sonnet 4.5 reads 1,000-page mixed-PDF packages with check-boxes, signatures, and inline tables. Output is reliably structured, severity-aware, and citation-bound. Two years ago this could not be done at production quality.",
      icon: "AI",
      c: B.CORAL,
    },
    {
      h: "California disclosure stakes are rising",
      b: "AB 38 (defensible-space disclosures), FAIR Plan instability, new CALFIRE wildfire maps, SB 326 / SB 800 balcony inspections. Buyers and agents face more required disclosure data than any other state.",
      icon: "CA",
      c: B.TEAL,
    },
    {
      h: "Brokerage margins under pressure",
      b: "Post-NAR-settlement commission compression has every brokerage looking for ways to differentiate service without raising headcount. A defensible disclosure review is a high-leverage spend.",
      icon: "$$",
      c: B.NAVY,
    },
  ];

  forces.forEach((f, i) => {
    const y = 2.5 + i * 1.45;
    // Icon disc
    s.addShape("ellipse", {
      x: 0.5,
      y,
      w: 1.0,
      h: 1.0,
      fill: { color: f.c },
      line: { type: "none" },
    });
    s.addText(f.icon, {
      x: 0.5,
      y,
      w: 1.0,
      h: 1.0,
      fontFace: B.FONT_HEAD,
      fontSize: 22,
      bold: true,
      color: B.WHITE,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    s.addText(f.h, {
      x: 1.8,
      y: y + 0.05,
      w: 11,
      h: 0.45,
      fontFace: B.FONT_HEAD,
      fontSize: 18,
      bold: true,
      color: B.SLATE_900,
      margin: 0,
    });
    s.addText(f.b, {
      x: 1.8,
      y: y + 0.55,
      w: 11,
      h: 0.85,
      fontFace: B.FONT_BODY,
      fontSize: 12.5,
      color: B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.3,
    });
  });

  addMark(s);
}

// 8. Defensibility / moat -----------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addSlideChip(s, 8, TOTAL);

  s.addText("Why this is defensible", {
    x: 0.5,
    y: 0.9,
    w: 12,
    h: 0.8,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
  });

  const moats = [
    {
      h: "California-specific prompt engineering",
      b: "Severity rubric, regional cost library, statute-aware guidance (Civ. Code §1102, AB 38, Davis-Stirling). Months of iteration on real packages.",
    },
    {
      h: "Hybrid PDF + text pipeline",
      b: "Native PDF attachments for severity-bearing documents (preserves check-boxes, signatures). Text-only for layout-irrelevant HOA bundles. Token cost optimized.",
    },
    {
      h: "Built into the agent workflow",
      b: "Branded PDF, client email draft, public share view, 30-day re-analysis window. Not a chat tool. A deliverable an agent already needed to produce.",
    },
    {
      h: "Trust + privacy posture",
      b: "PII never enters the audit log. Foundation-model training prohibited by contract. RLS on every row. Trust matters most in disclosure analysis.",
    },
  ];

  moats.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.3;
    const y = 2.1 + row * 2.4;

    s.addShape("rect", {
      x,
      y,
      w: 6.0,
      h: 2.1,
      fill: { color: B.CREAM },
      line: { type: "none" },
    });
    s.addShape("rect", {
      x,
      y,
      w: 0.12,
      h: 2.1,
      fill: { color: i % 2 === 0 ? B.CORAL : B.TEAL },
      line: { type: "none" },
    });
    s.addText(m.h, {
      x: x + 0.4,
      y: y + 0.2,
      w: 5.5,
      h: 0.5,
      fontFace: B.FONT_HEAD,
      fontSize: 17,
      bold: true,
      color: B.SLATE_900,
      margin: 0,
    });
    s.addText(m.b, {
      x: x + 0.4,
      y: y + 0.8,
      w: 5.5,
      h: 1.2,
      fontFace: B.FONT_BODY,
      fontSize: 13,
      color: B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.35,
    });
  });

  addMark(s);
}

// 9. Roadmap / use of funds ---------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.WHITE };
  addSlideChip(s, 9, TOTAL);

  s.addText("Roadmap + use of funds", {
    x: 0.5,
    y: 0.9,
    w: 12,
    h: 0.8,
    fontFace: B.FONT_HEAD,
    fontSize: 32,
    bold: true,
    color: B.SLATE_900,
    margin: 0,
  });

  // Timeline along the top
  const milestones = [
    { q: "Now", t: "CA live, beta agents onboarded, paid plans active" },
    { q: "Q3 2026", t: "Texas + Florida launch. Brokerage tier sales motion." },
    { q: "Q4 2026", t: "Washington launch. Agent-team dashboards. API for MLS integrators." },
    { q: "2027", t: "National coverage. White-label OEM for portal partners." },
  ];
  milestones.forEach((m, i) => {
    const x = 0.5 + i * 3.15;
    const y = 2.1;
    s.addShape("rect", {
      x,
      y,
      w: 2.9,
      h: 1.8,
      fill: { color: i === 0 ? B.CORAL : B.CREAM },
      line: { color: i === 0 ? B.CORAL : B.SLATE_300, width: 1 },
    });
    s.addText(m.q, {
      x: x + 0.15,
      y: y + 0.15,
      w: 2.6,
      h: 0.4,
      fontFace: B.FONT_HEAD,
      fontSize: 14,
      bold: true,
      color: i === 0 ? B.WHITE : B.CORAL,
      charSpacing: 3,
      margin: 0,
    });
    s.addText(m.t, {
      x: x + 0.15,
      y: y + 0.6,
      w: 2.6,
      h: 1.15,
      fontFace: B.FONT_BODY,
      fontSize: 12,
      color: i === 0 ? B.WHITE : B.SLATE_700,
      margin: 0,
      lineSpacingMultiple: 1.3,
    });
  });

  // Use of funds bar
  s.addText("Use of funds (target raise)", {
    x: 0.5,
    y: 4.4,
    w: 12,
    h: 0.4,
    fontFace: B.FONT_HEAD,
    fontSize: 12,
    bold: true,
    color: B.SLATE_500,
    charSpacing: 4,
    margin: 0,
  });

  const uses = [
    { l: "Engineering + ML quality (40%)", w: 4.92, c: B.CORAL },
    { l: "Sales + brokerage GTM (30%)", w: 3.69, c: B.TEAL },
    { l: "Content + agent education (15%)", w: 1.85, c: B.AMBER },
    { l: "Operations + compliance (15%)", w: 1.85, c: B.NAVY },
  ];
  let runX = 0.5;
  uses.forEach((u) => {
    s.addShape("rect", {
      x: runX,
      y: 4.9,
      w: u.w,
      h: 0.45,
      fill: { color: u.c },
      line: { type: "none" },
    });
    runX += u.w;
  });

  // Legend
  uses.forEach((u, i) => {
    const x = 0.5 + (i % 2) * 6.3;
    const y = 5.55 + Math.floor(i / 2) * 0.4;
    s.addShape("ellipse", {
      x,
      y,
      w: 0.22,
      h: 0.22,
      fill: { color: u.c },
      line: { type: "none" },
    });
    s.addText(u.l, {
      x: x + 0.32,
      y: y - 0.02,
      w: 5.8,
      h: 0.3,
      fontFace: B.FONT_BODY,
      fontSize: 12,
      color: B.SLATE_700,
      margin: 0,
    });
  });

  addMark(s);
}

// 10. Ask / contact ------------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: B.NAVY_DEEP };

  // Coral + teal accent block
  s.addShape("rect", { x: 0, y: 0, w: 0.5, h: SLIDE_H, fill: { color: B.CORAL }, line: { type: "none" } });
  s.addShape("rect", { x: 0.5, y: 0, w: 0.2, h: SLIDE_H, fill: { color: B.TEAL }, line: { type: "none" } });

  s.addText("Let's talk", {
    x: 1.4,
    y: 1.0,
    w: 11,
    h: 0.5,
    fontFace: B.FONT_HEAD,
    fontSize: 14,
    bold: true,
    color: B.AMBER_SOFT,
    charSpacing: 6,
    margin: 0,
  });

  s.addText("We're raising to take California to Texas, Florida, and Washington.", {
    x: 1.4,
    y: 1.7,
    w: 11.5,
    h: 1.5,
    fontFace: B.FONT_HEAD,
    fontSize: 38,
    bold: true,
    color: B.WHITE,
    margin: 0,
    lineSpacingMultiple: 1.15,
  });

  s.addText(
    "If you invest in proptech, agent-productivity software, or vertical AI applications, we'd like to walk you through the product live and answer any due-diligence questions in real time.",
    {
      x: 1.4,
      y: 3.6,
      w: 11,
      h: 1.4,
      fontFace: B.FONT_BODY_LIGHT,
      fontSize: 17,
      color: B.SLATE_300,
      margin: 0,
      lineSpacingMultiple: 1.4,
    },
  );

  // Contact card
  s.addShape("rect", {
    x: 1.4,
    y: 5.2,
    w: 10.5,
    h: 1.4,
    fill: { color: B.NAVY },
    line: { color: B.TEAL_BRIGHT, width: 1 },
  });
  s.addText("Michael Fielden", {
    x: 1.7,
    y: 5.3,
    w: 5,
    h: 0.4,
    fontFace: B.FONT_HEAD,
    fontSize: 18,
    bold: true,
    color: B.WHITE,
    margin: 0,
  });
  s.addText("Founder, Veroax", {
    x: 1.7,
    y: 5.7,
    w: 5,
    h: 0.35,
    fontFace: B.FONT_BODY,
    fontSize: 13,
    color: B.SLATE_300,
    margin: 0,
  });
  s.addText("michael@michaelfielden.com", {
    x: 1.7,
    y: 6.05,
    w: 5,
    h: 0.35,
    fontFace: B.FONT_BODY,
    fontSize: 13,
    color: B.TEAL_BRIGHT,
    margin: 0,
  });
  s.addText("(866) 247-8833", {
    x: 6.8,
    y: 5.3,
    w: 5,
    h: 0.4,
    fontFace: B.FONT_HEAD,
    fontSize: 18,
    bold: true,
    color: B.WHITE,
    margin: 0,
  });
  s.addText("www.veroax.com", {
    x: 6.8,
    y: 5.7,
    w: 5,
    h: 0.35,
    fontFace: B.FONT_BODY,
    fontSize: 13,
    color: B.SLATE_300,
    margin: 0,
  });
  s.addText("Santa Clara, CA", {
    x: 6.8,
    y: 6.05,
    w: 5,
    h: 0.35,
    fontFace: B.FONT_BODY,
    fontSize: 13,
    color: B.SLATE_300,
    margin: 0,
  });

  // Brand lockup bottom-right
  s.addText(
    [
      { text: "veroax", options: { color: B.CORAL_BRIGHT, fontSize: 22, bold: true } },
      { text: "•", options: { color: B.TEAL_BRIGHT, fontSize: 22, bold: true } },
    ],
    {
      x: SLIDE_W - 2.5,
      y: SLIDE_H - 0.7,
      w: 2.2,
      h: 0.4,
      fontFace: B.FONT_HEAD,
      align: "right",
      margin: 0,
    },
  );
}

// ===== save ======================================================

const path = require("node:path");
pptx
  .writeFile({ fileName: path.join(__dirname, "veroax-vc-pitch.pptx") })
  .then((name) => {
    console.log("wrote:", name);
  });

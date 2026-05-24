import { renderToBuffer } from "@react-pdf/renderer";
import { RoadmapPDF } from "@/lib/pdf-render/RoadmapPDF";
import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

// GET /api/roadmap, renders the founder roadmap PDF on-demand.
//
// Intentionally public (no auth gate) so the founder can paste the
// link in pitch conversations. BUT rate-limited because React-PDF's
// renderToBuffer is CPU-heavy; if a crawler hits this URL in a loop
// it would burn Vercel function minutes for nothing.
//
// Also cached at the edge for 5 minutes (the roadmap rarely changes,
// and any change ships via redeploy so a short edge cache is fine).
// Edit lib/pdf-render/RoadmapPDF.tsx to update items.

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit({
    key: ip,
    scope: "roadmap-pdf",
    max: 10,
    windowMs: 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests for the roadmap PDF. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  try {
    const buffer = await renderToBuffer(<RoadmapPDF />);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="veroax-roadmap.pdf"',
        // 5-minute edge cache; revalidate every 30 minutes via SWR.
        // Aggressive enough to make crawlers cheap, short enough that
        // an edit visible within a deploy cycle.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

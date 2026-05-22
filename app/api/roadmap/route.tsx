import { renderToBuffer } from "@react-pdf/renderer";
import { RoadmapPDF } from "@/lib/pdf-render/RoadmapPDF";
import { NextResponse } from "next/server";

// GET /api/roadmap → renders the founder roadmap PDF on-demand.
//
// No auth gate (intentionally) — the roadmap is broad-strokes and
// safe to share. If we ever bring this in-house only, wrap with the
// same auth + admin check pattern used by /api/reports/[id]/restart.
//
// Renders via React-PDF's renderToBuffer using the same pipeline that
// powers the disclosure reports, so the build environment is already
// known-good. Edit lib/pdf-render/RoadmapPDF.tsx to add or check off
// items, then hit /api/roadmap to see the new version.

export const runtime = "nodejs";

export async function GET() {
  try {
    const buffer = await renderToBuffer(<RoadmapPDF />);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="veroax-roadmap.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

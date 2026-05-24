// Vercel cron endpoint for the stale-analyzing sweep.
//
// Triggered by vercel.json on a fixed schedule. Vercel signs the
// request with a CRON_SECRET header; we verify it before running.
// If the secret is unset (dev / local) we allow the call so manual
// curl tests work, but in production it's a strict gate.

import { NextResponse } from "next/server";
import { sweepStaleAnalyzing } from "@/lib/server/sweepStaleAnalyzing";

export async function GET(request: Request) {
  // Vercel cron sends a bearer token in production. In dev we let
  // unauthenticated calls through so curl from the local shell works.
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const result = await sweepStaleAnalyzing();
  return NextResponse.json({
    ok: true,
    ...result,
  });
}

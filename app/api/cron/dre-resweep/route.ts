// Vercel cron endpoint for the quarterly DRE re-verification sweep.
//
// Triggered by vercel.json on a daily schedule. The actual recheck
// gate is the 90-day TTL inside runDreResweep(), so a daily cron with
// a 50-row cap is the steady-state shape: every account gets re-
// verified roughly every quarter, with at most ~50 outbound DRE
// requests per day.
//
// Auth: matches the existing sweep-stale-reports pattern. In prod we
// require the Bearer CRON_SECRET; in dev we let unauthenticated calls
// through so a local curl works.

import { NextResponse } from "next/server";
import { runDreResweep } from "@/lib/server/dreResweep";

// The sweep can take a while (50 sequential HTTP calls to the DRE
// site, each ~1-2s, plus the 250ms politeness delay). Push the
// timeout up so a full run can complete inside one invocation.
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const result = await runDreResweep();
  return NextResponse.json({ ok: true, ...result });
}

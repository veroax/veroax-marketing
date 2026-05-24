// Vercel cron endpoint for the hourly synthetic-heartbeat run.
// Auth gate matches /api/cron/sweep-stale-reports (CRON_SECRET
// bearer header in production, open in dev for curl testing).

import { NextResponse } from "next/server";
import { runSyntheticHeartbeats } from "@/lib/server/syntheticHeartbeat";

// Anthropic ping can take a few seconds at p99 plus the storage
// round-trip; give the function room.
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const { ran_at, results } = await runSyntheticHeartbeats();
  return NextResponse.json({
    ok: results.every((r) => r.ok),
    ran_at,
    results,
  });
}

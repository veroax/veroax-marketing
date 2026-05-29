// Synthetic heartbeats for the four external services Veroax
// depends on. Each ping is intentionally tiny so the cost of
// running it 24x per day stays under a dollar a year (the
// Anthropic ping costs about 1/30th of a cent; the others are
// free). Each ping returns a structured PingResult that the
// /api/cron/synthetic-heartbeat endpoint persists to
// public.synthetic_pings.
//
// Why these four and not e.g. Vercel: the four below have failure
// modes that are NOT visible from Vercel Analytics. Anthropic
// rate-limits, Stripe key rotations, Supabase storage outages, and
// Resend domain-block events all surface here long before they'd
// surface as "Vercel errors."
//
// Costs (rough, per ping):
//   anthropic: ~$0.0003 (10 in + 10 out tokens on Sonnet 4.5)
//   storage:   $0      (1KB write + read against the disclosures bucket)
//   stripe:    $0      (balance.retrieve is a free metered read)
//   resend:    $0      (domains.list is a free read)

import Stripe from "stripe";
import { Resend } from "resend";
import { getAnthropicClient, ANALYSIS_MODEL } from "@/lib/anthropic/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { notifyServiceTransition } from "@/lib/server/alerting";

export type PingService = "anthropic" | "storage" | "stripe" | "resend";

export type PingResult = {
  service: PingService;
  ok: boolean;
  latency_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
};

const STORAGE_HEARTBEAT_PATH = "_heartbeat/ping.txt";
const STORAGE_BUCKET = "disclosures";

function truncate(s: string | undefined | null, max = 500): string | null {
  if (!s) return null;
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{
  result: T;
  ms: number;
}> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

// ---------- Anthropic ping ---------------------------------------
async function pingAnthropic(): Promise<PingResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        service: "anthropic",
        ok: false,
        latency_ms: null,
        error_message: "ANTHROPIC_API_KEY not configured.",
        metadata: {},
      };
    }
    const client = getAnthropicClient();
    const { result, ms } = await timeIt(() =>
      client.messages.create({
        model: ANALYSIS_MODEL,
        max_tokens: 10,
        // temperature: 0 so the heartbeat is byte-stable across runs.
        // Makes "the API returned something weird" easier to spot.
        temperature: 0,
        messages: [
          {
            role: "user",
            content: "Reply with the single word: pong.",
          },
        ],
      }),
    );
    const firstBlock = result.content[0];
    const text =
      firstBlock && firstBlock.type === "text" ? firstBlock.text.trim() : "";
    return {
      service: "anthropic",
      ok: text.toLowerCase().includes("pong"),
      latency_ms: ms,
      error_message: text.toLowerCase().includes("pong")
        ? null
        : `Unexpected response: ${truncate(text, 100)}`,
      metadata: {
        model: result.model,
        stop_reason: result.stop_reason,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        response_excerpt: truncate(text, 100),
      },
    };
  } catch (err) {
    return {
      service: "anthropic",
      ok: false,
      latency_ms: null,
      error_message: truncate(
        err instanceof Error ? err.message : String(err),
      ),
      metadata: {},
    };
  }
}

// ---------- Storage ping -----------------------------------------
// Writes a tiny timestamped file to a fixed path in the disclosures
// bucket then reads it back. Overwrites every hour so storage stays
// clean.
async function pingStorage(): Promise<PingResult> {
  try {
    const admin = createServiceRoleClient();
    const payload = `veroax synthetic heartbeat at ${new Date().toISOString()}`;
    const file = new Blob([payload], { type: "text/plain" });
    const { ms: uploadMs } = await timeIt(async () => {
      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(STORAGE_HEARTBEAT_PATH, file, {
          contentType: "text/plain",
          upsert: true,
        });
      if (error) throw new Error(error.message);
      return null;
    });
    const { result: downloaded, ms: downloadMs } = await timeIt(async () => {
      const { data, error } = await admin.storage
        .from(STORAGE_BUCKET)
        .download(STORAGE_HEARTBEAT_PATH);
      if (error || !data) {
        throw new Error(error?.message ?? "no data returned");
      }
      return data.text();
    });
    const ok = downloaded === payload;
    return {
      service: "storage",
      ok,
      latency_ms: uploadMs + downloadMs,
      error_message: ok ? null : "Round-trip payload mismatch.",
      metadata: {
        upload_ms: uploadMs,
        download_ms: downloadMs,
        bytes: payload.length,
        path: STORAGE_HEARTBEAT_PATH,
        bucket: STORAGE_BUCKET,
      },
    };
  } catch (err) {
    return {
      service: "storage",
      ok: false,
      latency_ms: null,
      error_message: truncate(
        err instanceof Error ? err.message : String(err),
      ),
      metadata: {},
    };
  }
}

// ---------- Stripe ping ------------------------------------------
// balance.retrieve is the cheapest authenticated read in the Stripe
// API. It validates: (a) the secret key is set, (b) the key is
// valid, (c) Stripe is reachable.
async function pingStripe(): Promise<PingResult> {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return {
        service: "stripe",
        ok: false,
        latency_ms: null,
        error_message: "STRIPE_SECRET_KEY not configured.",
        metadata: {},
      };
    }
    const stripe = new Stripe(secret);
    const { result, ms } = await timeIt(() => stripe.balance.retrieve());
    return {
      service: "stripe",
      ok: true,
      latency_ms: ms,
      error_message: null,
      metadata: {
        livemode: result.livemode,
        available_currencies: (result.available ?? []).map((a) => a.currency),
      },
    };
  } catch (err) {
    return {
      service: "stripe",
      ok: false,
      latency_ms: null,
      error_message: truncate(
        err instanceof Error ? err.message : String(err),
      ),
      metadata: {},
    };
  }
}

// ---------- Resend ping ------------------------------------------
// We do NOT send a real email here (would be expensive and spammy).
// domains.list is a free authenticated read that proves the key is
// valid and Resend is reachable.
//
// One wrinkle: Resend supports "Sending access" restricted API keys,
// the safer default for production. A send-only key cannot call
// domains.list and Resend returns an error like:
//   "This API key is restricted to only send emails"
// or similar. We treat that specific class of error as a PASS,
// because the response itself proves:
//   1. The key is valid (otherwise we'd get a 401 instead)
//   2. Resend is reachable (we got a structured Resend reply)
//   3. The key is just scoped tighter, by design
// Anything else (401, 5xx, network) is still treated as a fail.
function isRestrictedKeyError(message: string | undefined | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("restricted to only send") ||
    lower.includes("restricted to only sending") ||
    // Resend's restricted-key response has historically also shown up
    // as a generic "missing permissions" / "not authorized for this
    // resource" style message; match those too so a slight wording
    // change on Resend's side doesn't reintroduce the red light.
    lower.includes("not authorized for this resource") ||
    lower.includes("missing required permission")
  );
}

async function pingResend(): Promise<PingResult> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return {
        service: "resend",
        ok: false,
        latency_ms: null,
        error_message: "RESEND_API_KEY not configured.",
        metadata: {},
      };
    }
    const resend = new Resend(key);
    const { result, ms } = await timeIt(() => resend.domains.list());
    if (result.error) {
      const msg = result.error.message;
      if (isRestrictedKeyError(msg)) {
        return {
          service: "resend",
          ok: true,
          latency_ms: ms,
          error_message: null,
          metadata: {
            key_scope: "sending_only",
            note: "Key reached Resend and was identified as a send-only restricted key. That is a pass: the key is valid and Resend is reachable.",
          },
        };
      }
      return {
        service: "resend",
        ok: false,
        latency_ms: ms,
        error_message: truncate(msg),
        metadata: {},
      };
    }
    const data = result.data;
    const domainCount = Array.isArray(data?.data) ? data.data.length : 0;
    return {
      service: "resend",
      ok: true,
      latency_ms: ms,
      error_message: null,
      metadata: { key_scope: "full_access", domain_count: domainCount },
    };
  } catch (err) {
    // Some SDK versions throw instead of returning result.error for
    // permission denials. Catch the same restricted-key signature
    // there too.
    const message = err instanceof Error ? err.message : String(err);
    if (isRestrictedKeyError(message)) {
      return {
        service: "resend",
        ok: true,
        latency_ms: null,
        error_message: null,
        metadata: {
          key_scope: "sending_only",
          note: "Restricted send-only key. Treated as pass.",
        },
      };
    }
    return {
      service: "resend",
      ok: false,
      latency_ms: null,
      error_message: truncate(message),
      metadata: {},
    };
  }
}

// ---------- Orchestrator -----------------------------------------

export type HeartbeatRunResult = {
  ran_at: string;
  results: PingResult[];
};

// Fetch the previous-ok state per service so we can fire state-
// transition alerts (ok→fail or fail→ok). Returns a map of
// service → previous ok boolean (null when there are no prior
// pings yet).
async function getPreviousOkByService(): Promise<
  Record<PingService, boolean | null>
> {
  const result: Record<PingService, boolean | null> = {
    anthropic: null,
    storage: null,
    stripe: null,
    resend: null,
  };
  try {
    const admin = createServiceRoleClient();
    const services: PingService[] = [
      "anthropic",
      "storage",
      "stripe",
      "resend",
    ];
    await Promise.all(
      services.map(async (svc) => {
        const { data } = await admin
          .from("synthetic_pings")
          .select("ok")
          .eq("service", svc)
          .order("ran_at", { ascending: false })
          .limit(1);
        const row = (data ?? [])[0] as { ok: boolean } | undefined;
        result[svc] = row ? row.ok : null;
      }),
    );
  } catch (err) {
    console.error("[heartbeat] previous-state lookup failed:", err);
  }
  return result;
}

const SERVICE_LABELS: Record<PingService, string> = {
  anthropic: "Anthropic (analyzer)",
  storage: "Supabase Storage",
  stripe: "Stripe",
  resend: "Resend (email)",
};

/**
 * Run all four pings in parallel, persist each to synthetic_pings,
 * fire alert emails for state transitions, and return the round-
 * trip summary. Resilient: one ping failing never prevents the
 * others from running.
 */
export async function runSyntheticHeartbeats(): Promise<HeartbeatRunResult> {
  const ran_at = new Date().toISOString();

  // Capture previous state per service BEFORE persisting new pings
  // so we know if this run represents a transition.
  const previousOk = await getPreviousOkByService();

  const results = await Promise.all([
    pingAnthropic(),
    pingStorage(),
    pingStripe(),
    pingResend(),
  ]);

  // Persist each result. Errors here are logged but don't fail the
  // run: the cron's job is to gather signal, not to enforce DB
  // health. (A DB outage will produce its own loud error elsewhere.)
  try {
    const admin = createServiceRoleClient();
    await admin.from("synthetic_pings").insert(
      results.map((r) => ({
        service: r.service,
        ok: r.ok,
        latency_ms: r.latency_ms,
        error_message: r.error_message,
        metadata: r.metadata,
        ran_at,
      })),
    );
  } catch (err) {
    console.error("[heartbeat] persist failed:", err);
  }

  // Alert on transitions (ok→fail, fail→ok) and sustained-failure
  // reminders. Sent via notifyServiceTransition which handles the
  // cooldown so a sustained outage doesn't spam the inbox.
  await Promise.all(
    results.map((r) =>
      notifyServiceTransition({
        alert_key: `synthetic.${r.service}.fail`,
        service_label: SERVICE_LABELS[r.service],
        prev_ok: previousOk[r.service],
        current_ok: r.ok,
        latency_ms: r.latency_ms,
        error_message: r.error_message,
        metadata: { service: r.service, ran_at, ...r.metadata },
      }).catch((err) => {
        console.error(
          `[heartbeat] alert dispatch failed for ${r.service}:`,
          err,
        );
      }),
    ),
  );

  return { ran_at, results };
}

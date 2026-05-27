// Central transactional-email send helper.
//
// Before this module existed, every outbound Veroax email instantiated
// its own Resend client and chose its own From: address. Five different
// senders were in use across the codebase (contact@, hello@, alerts@,
// feedback@, noreply@), each of which required separate Resend domain
// verification. Unverified senders fail silently, so the only way to
// know whether a given email was actually being delivered was to check
// the Resend dashboard for each address one by one.
//
// The fix is to send everything from a single address and route replies
// to a single inbox via Reply-To:
//
//   From:      Veroax <noreply@veroax.com>     (one Resend lane to verify)
//   Reply-To:  support@veroax.com              (one inbox to ticket)
//
// noreply@ as the sender keeps bounce noise, OOO replies, and inbox-
// provider reputation segregated from real human support traffic. When
// a recipient hits Reply, the message lands in support@ where it can
// be handled like any other support ticket. support@ is intentionally
// INBOUND ONLY, it never appears as a sender on outbound mail.
//
// Single override path: callers that need a different Reply-To (the
// contact-form flow wants support staff to reply directly to the user
// who submitted the form) pass `replyTo: userEmail`. The From: stays
// fixed; only the Reply-To bends.
//
// EXCEPTION: the agent-from-platform send at
// /api/reports/[id]/email/send uses its own sender logic by design,
// because that path sends an email from the agent's profile email to
// their client. It does not use this helper.

import { Resend } from "resend";
import { SUPPORT } from "@/lib/site";

// Universal From: across every transactional email. Verify ONLY this
// address in the Resend dashboard. Domain-level DKIM/SPF/DMARC at
// veroax.com covers everything else.
export const TRANSACTIONAL_FROM = "Veroax <noreply@veroax.com>";

// Universal Reply-To. Replies hitting Reply on any outbound email end
// up in this mailbox so a single helpdesk can ticket them. Sourced
// from lib/site.ts so a future rename only touches one constant.
export const TRANSACTIONAL_REPLY_TO = SUPPORT.email;

type SendParams = {
  to: string | string[];
  subject: string;
  // At least one of html / text must be provided. Resend rejects an
  // email body that has neither; we relax the requirement here so
  // ops-style text-only alerts work alongside fully-styled HTML.
  html?: string;
  text?: string;
  // Override Reply-To. Reserved for contact-form-style sends where
  // support staff want to hit Reply once and answer the user
  // directly. Defaults to TRANSACTIONAL_REPLY_TO (support@).
  replyTo?: string | string[];
};

export type SendResult = {
  ok: boolean;
  // Populated when the send succeeded.
  id: string | null;
  // Populated when the send failed.
  error: string | null;
  // True when we declined to send because RESEND_API_KEY isn't set
  // (typical in dev / preview environments). Distinct from a hard
  // failure so the caller can choose whether to log a warning vs.
  // bubble a user-facing error.
  skipped: boolean;
};

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) cachedClient = new Resend(apiKey);
  return cachedClient;
}

/**
 * Send a transactional email via Resend with the canonical From: and
 * Reply-To: defaults. Never throws, errors come back in the result so
 * the caller decides whether to surface them to the user or just log.
 */
export async function sendTransactional(
  params: SendParams,
): Promise<SendResult> {
  const client = getClient();
  if (!client) {
    console.warn(
      "[email/sender] RESEND_API_KEY missing, skipping send to",
      params.to,
    );
    return { ok: false, id: null, error: null, skipped: true };
  }

  if (!params.html && !params.text) {
    console.error("[email/sender] refusing to send empty email to", params.to);
    return {
      ok: false,
      id: null,
      error: "Either html or text body is required.",
      skipped: false,
    };
  }

  try {
    const payload: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      replyTo: string | string[];
    } = {
      from: TRANSACTIONAL_FROM,
      to: params.to,
      subject: params.subject,
      replyTo: params.replyTo ?? TRANSACTIONAL_REPLY_TO,
    };
    if (params.html) payload.html = params.html;
    if (params.text) payload.text = params.text;
    // Resend's createEmail union types html/text as mutually exclusive
    // at the type level, but the API actually accepts both. Cast to
    // the SDK's expected shape to bypass the type-level disjunction.
    const { data, error } = await client.emails.send(
      payload as unknown as Parameters<typeof client.emails.send>[0],
    );
    if (error) {
      const msg =
        typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : JSON.stringify(error);
      console.error("[email/sender] resend error:", msg);
      return { ok: false, id: null, error: msg, skipped: false };
    }
    return { ok: true, id: data?.id ?? null, error: null, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email/sender] threw:", msg);
    return { ok: false, id: null, error: msg, skipped: false };
  }
}

"use server";

// Server Actions for authentication. Invoked directly from <form action={...}>
// on signup/login pages, no client-side fetch needed.

import { after } from "next/server";
import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addContactToMarketingGroup } from "@/lib/integrations/salesandmarketing";
import { sendWelcomeEmail } from "@/lib/email/welcomeEmail";
import { sendAdminSignupNotification } from "@/lib/email/adminSignupNotification";

function trim(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// Sanitize a redirect-after-auth path so an attacker can't trick a
// user into being bounced to a third-party site via the next param.
// Only same-origin relative paths starting with "/" are accepted;
// anything else falls back to /dashboard.
function safeNextPath(raw: string, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback; // protocol-relative
  if (raw.startsWith("/\\")) return fallback;
  return raw;
}

// Light phone-number normalizer: keep the leading "+" if present,
// strip everything else that isn't a digit. Good enough for storing
// "(555) 123-4567" as "5551234567" so the SAM API + future SMS sends
// have a clean E.164-ish string. We do NOT enforce a country code
// at signup; the agent can fix it later in /dashboard/settings.
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const leadingPlus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return null;
  return `${leadingPlus}${digits}`;
}

export async function signupAction(_prev: unknown, formData: FormData) {
  const email = trim(formData, "email").toLowerCase();
  const password = trim(formData, "password");
  const fullName = trim(formData, "full_name");
  const phone = normalizePhone(trim(formData, "phone"));
  const next = safeNextPath(trim(formData, "next"));

  if (!email || !password || !fullName) {
    return { error: "All fields are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";
  // Encode the destination so Supabase preserves it through its
  // email-link rewrite. /auth/confirm reads it server-side and
  // redirects there after exchanging the token.
  const emailRedirectTo = `${siteUrl}/auth/confirm?next=${encodeURIComponent(
    next,
  )}`;

  // Capture request metadata for the admin notification email so the
  // founder can spot spam patterns (same IP signing up repeatedly,
  // weird user-agents, etc.). Pulled before the Supabase call so the
  // notification works even when signup fails.
  const reqHeaders = await headers();
  const ipAddress =
    reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    reqHeaders.get("x-real-ip") ??
    null;
  const userAgent = reqHeaders.get("user-agent") ?? null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo,
    },
  });

  if (error) {
    // Notify admin of failed signup attempt (duplicate email, weak
    // password rejected server-side, etc.). after() so the
    // notification doesn't slow down the response to the user.
    after(async () => {
      try {
        await sendAdminSignupNotification({
          status: "error",
          email,
          fullName,
          phone,
          errorMessage: error.message,
          ipAddress,
          userAgent,
        });
      } catch (err) {
        console.error("[signup] admin failure notify threw:", err);
      }
    });
    return { error: error.message };
  }

  // Persist the phone number on the profile so it's available to the
  // branded PDF render and the dashboard settings page. The profile
  // row was just created by the handle_new_user trigger; we update
  // via service-role because at this point there's no session yet
  // (Supabase email-confirmation mode means data.session is null).
  // Best-effort: failure here doesn't fail the signup.
  if (phone && data.user?.id) {
    try {
      const admin = createServiceRoleClient();
      await admin
        .from("profiles")
        .update({ phone })
        .eq("id", data.user.id);
    } catch (err) {
      console.error("[signup] profile.phone update failed:", err);
    }
  }

  // Welcome email + admin notification, both via after() so the user's
  // signup response is not blocked on email delivery. Failures are
  // logged but never bubble up; signup completes either way.
  after(async () => {
    try {
      const result = await sendWelcomeEmail({ email, fullName });
      if (!result.ok) {
        console.error("[signup] welcome email failed:", result.error);
      }
    } catch (err) {
      console.error("[signup] welcome email threw:", err);
    }
  });

  after(async () => {
    try {
      await sendAdminSignupNotification({
        status: "ok",
        email,
        fullName,
        phone,
        ipAddress,
        userAgent,
      });
    } catch (err) {
      console.error("[signup] admin notify threw:", err);
    }
  });

  // Push the new signup into the Sales and Marketing AI group so the
  // founder can run campaigns against the user list. Runs via after()
  // so the network call doesn't block the signup response. Failures
  // are logged but never bubble up to the user; signup completes
  // regardless of CRM availability. The integration self-disables
  // when env vars are missing (returns reason='not_configured'), so
  // this is safe to ship before the founder finishes configuration.
  const [firstName, ...rest] = fullName.split(" ").filter(Boolean);
  const lastName = rest.join(" ") || null;
  after(async () => {
    try {
      const result = await addContactToMarketingGroup({
        email,
        fullName,
        firstName: firstName || null,
        lastName,
        phone, // optional; null when the agent didn't provide one
        customFields: {
          source: "veroax_signup",
          signup_date: new Date().toISOString().slice(0, 10),
        },
      });
      if (!result.ok && result.reason !== "not_configured") {
        console.error(
          "[signup] CRM sync failed:",
          result.reason,
          result.detail,
        );
      }
    } catch (err) {
      console.error("[signup] CRM sync threw:", err);
    }
  });

  // If Supabase has email confirmation enabled, the user must verify before
  // a session is created. Surface that to the UI; otherwise redirect to
  // the post-signup destination (next, or /dashboard by default).
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }

  return {
    error: null,
    message:
      "Check your email. We sent a verification link. Click it to finish signing up.",
  };
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = trim(formData, "email").toLowerCase();
  const password = trim(formData, "password");
  const next = safeNextPath(trim(formData, "next"));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

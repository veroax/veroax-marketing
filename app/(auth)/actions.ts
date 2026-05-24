"use server";

// Server Actions for authentication. Invoked directly from <form action={...}>
// on signup/login pages, no client-side fetch needed.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function signupAction(_prev: unknown, formData: FormData) {
  const email = trim(formData, "email").toLowerCase();
  const password = trim(formData, "password");
  const fullName = trim(formData, "full_name");
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
    return { error: error.message };
  }

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

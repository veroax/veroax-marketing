"use client";

import Link from "next/link";
import { useState, FormEvent } from "react";

// Public "I forgot my password" form. Submits to
// /api/auth/forgot-password which fires the Supabase reset email
// (via Resend SMTP when configured) with a link back to
// /auth/confirm?next=/auth/reset-password.
//
// Always shows a generic success message regardless of whether the
// email matches an account, to prevent enumeration.

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(typeof data.error === "string" ? data.error : "Failed to send.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send.");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-dark.svg"
              alt="Veroax"
              style={{ height: 32 }}
              className="inline-block"
            />
          </Link>
          <p className="text-indigo-200 text-sm mt-2">Reset your password</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {status === "sent" ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100">
                <svg
                  className="w-6 h-6 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-slate-900">Check your email</h1>
              <p className="text-sm text-gray-600 leading-relaxed">
                If an account exists for {email}, we just sent a reset link.
                Click it within 60 minutes to choose a new password.
              </p>
              <p className="text-xs text-gray-500 pt-2">
                Didn&apos;t get the email? Check spam. Still nothing?{" "}
                <a
                  href="mailto:support@veroax.com"
                  className="text-indigo-700 underline"
                >
                  Email support
                </a>{" "}
                and we&apos;ll reset it manually.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <h1 className="text-xl font-bold text-slate-900">
                Forgot your password?
              </h1>
              <p className="text-sm text-gray-600">
                Enter the email you used to sign up. We&apos;ll send you a link
                to set a new password.
              </p>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {status === "error" ? (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full bg-indigo-950 text-white font-semibold py-3 rounded-lg hover:bg-indigo-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === "sending" ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-indigo-200 mt-6">
          Remembered it?{" "}
          <Link
            href="/login"
            className="text-white underline underline-offset-2 hover:text-amber-300"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

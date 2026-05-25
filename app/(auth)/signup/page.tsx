"use client";

import Link from "next/link";
import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signupAction } from "../actions";
import { formatUsPhone } from "@/lib/format/phone";

const initialState: { error?: string | null; message?: string } = {};

// Password strength meter. Returns a tier 0 (too weak) through 4
// (strong) based on: minimum length, character-class diversity, and
// not-obviously-common patterns. The bar fills proportionally; the
// label describes the tier so screen-reader users get feedback too.
function scorePassword(password: string): { tier: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (password.length === 0) return { tier: 0, label: "Empty", color: "bg-gray-200" };
  if (password.length < 8) return { tier: 0, label: "Too short", color: "bg-red-400" };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // Common-pattern penalty.
  const lower = password.toLowerCase();
  if (/(password|qwerty|12345|abcdef|veroax)/.test(lower)) score = Math.min(score, 1);
  if (/^(.)\1+$/.test(password)) score = 0;

  const tier = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels: Record<number, string> = {
    0: "Very weak",
    1: "Weak",
    2: "Fair",
    3: "Good",
    4: "Strong",
  };
  const colors: Record<number, string> = {
    0: "bg-red-400",
    1: "bg-orange-400",
    2: "bg-yellow-400",
    3: "bg-emerald-400",
    4: "bg-emerald-600",
  };
  return { tier, label: labels[tier], color: colors[tier] };
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  // Phone is controlled so we can auto-format as the user types (the
  // signup phone field is optional but, when filled, lands in
  // profiles.phone and on every branded PDF the agent generates).
  const [phone, setPhone] = useState("");
  // `next` is set when the user got bounced here from /api/checkout
  // (or any other route that wants them to land somewhere specific
  // after email confirmation). Sanitized server-side to same-origin.
  const params = useSearchParams();
  const next = params.get("next") ?? "";

  const strength = scorePassword(password);

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
          <p className="text-indigo-200 text-sm mt-2">Create your account</p>
          {next.startsWith("/api/checkout") ? (
            <p className="text-amber-300 text-xs mt-2 max-w-sm mx-auto">
              After you confirm your email, we&apos;ll take you straight
              to checkout for the plan you picked.
            </p>
          ) : null}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {state.message ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-slate-900">Check your email</h1>
              <p className="text-sm text-gray-600 leading-relaxed">{state.message}</p>
              <p className="text-xs text-gray-500 pt-2">
                Didn&apos;t get the email? Check spam, then{" "}
                <Link href="/login" className="text-indigo-700 underline">
                  sign in here
                </Link>
                .
              </p>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              {/* Threads the post-confirmation destination through the
                  Supabase email link. The signupAction validates this
                  is a same-origin path before passing it to
                  emailRedirectTo, so an attacker can't redirect a new
                  user off-domain by tampering with the URL. */}
              <input type="hidden" name="next" value={next} />
              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full name
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  required
                  autoComplete="name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Work email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Mobile number{" "}
                  <span className="text-slate-400 font-normal text-xs">
                    (optional)
                  </span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(formatUsPhone(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Used for your branded PDFs and account recovery. We
                  never share it.
                </p>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby="password-strength password-hint"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {/* Strength meter. Four equal-width bars fill from
                    left to right as the password gets stronger. The
                    label below is what screen readers announce. */}
                <div className="mt-2">
                  <div className="flex gap-1" aria-hidden="true">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          password.length === 0
                            ? "bg-gray-200"
                            : i <= strength.tier
                              ? strength.color
                              : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p
                    id="password-strength"
                    role="status"
                    aria-live="polite"
                    className="text-[11px] text-gray-600 mt-1"
                  >
                    {password.length === 0 ? "" : `Strength: ${strength.label}`}
                  </p>
                </div>
                <p id="password-hint" className="text-xs text-gray-500 mt-1">
                  At least 8 characters. Mix in upper / lower case, a number, and a symbol for a stronger score.
                </p>
              </div>

              {state.error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {state.error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full bg-indigo-950 text-white font-semibold py-3 rounded-lg hover:bg-indigo-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? "Creating account..." : "Create account"}
              </button>

              <p className="text-xs text-gray-500 text-center pt-2">
                By creating an account, you agree to our{" "}
                <Link href="/terms" className="text-indigo-700 underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-indigo-700 underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-indigo-200 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-white underline underline-offset-2 hover:text-amber-300">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

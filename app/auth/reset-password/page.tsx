"use client";

// Landing page after the user clicks the recovery link in their
// email. By the time they get here, /auth/confirm has already
// exchanged the token for an active session (with the auth aal=aal1
// recovery flag), so the user IS signed in. We just need them to
// pick a new password and call supabase.auth.updateUser({ password }).
//
// If they land here without a session (direct URL access, expired
// session, etc), we route them to /forgot-password to start over.

import Link from "next/link";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<
    "checking" | "ready" | "no_session" | "saving" | "done" | "error"
  >("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  // Confirm we have a recovery session on mount.
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabase.auth.getUser().then(({ data }) => {
      setStatus(data?.user ? "ready" : "no_session");
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("The two passwords don't match.");
      return;
    }
    setStatus("saving");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
      return;
    }
    setStatus("done");
    // Send them to the dashboard after a short pause so they see the
    // success state.
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
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
          <p className="text-indigo-200 text-sm mt-2">Choose a new password</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {status === "checking" ? (
            <p className="text-sm text-slate-500 italic text-center">
              Verifying your recovery link...
            </p>
          ) : status === "no_session" ? (
            <div className="space-y-3">
              <h1 className="text-xl font-bold text-slate-900">
                Recovery link expired
              </h1>
              <p className="text-sm text-gray-600">
                Your recovery session is no longer active. Recovery links
                expire after 60 minutes. Start over by requesting a fresh
                reset email.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block bg-indigo-950 text-white font-semibold px-4 py-2 rounded-lg hover:bg-indigo-900"
              >
                Request new link
              </Link>
            </div>
          ) : status === "done" ? (
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
              <h1 className="text-xl font-bold text-slate-900">
                Password updated
              </h1>
              <p className="text-sm text-gray-600">
                Taking you to your dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <h1 className="text-xl font-bold text-slate-900">
                Choose a new password
              </h1>
              <p className="text-sm text-gray-600">
                At least 8 characters. Once you save, you&apos;ll be signed
                in automatically.
              </p>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  New password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={show ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <label
                  htmlFor="confirm"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Confirm
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {errorMsg ? (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={status === "saving"}
                className="w-full bg-indigo-950 text-white font-semibold py-3 rounded-lg hover:bg-indigo-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === "saving" ? "Saving..." : "Save new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

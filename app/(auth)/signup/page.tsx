"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "../actions";

const initialState: { error?: string | null; message?: string } = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-white font-bold text-2xl tracking-tight">
            Veroax
          </Link>
          <p className="text-indigo-300 text-sm mt-2">Create your account</p>
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
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">At least 8 characters.</p>
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
                {pending ? "Creating account…" : "Create account"}
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

        <p className="text-center text-sm text-indigo-300 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-white underline underline-offset-2 hover:text-amber-300">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

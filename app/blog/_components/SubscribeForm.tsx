"use client";

// Inline email-signup widget shown under every blog post and at the
// bottom of the index. Posts to /api/blog-subscribe which forwards
// to support@veroax.com via Resend and sends a friendly
// acknowledgement back to the subscriber. Includes a honeypot
// "company" field that real users will not fill (display:none for
// humans, visible to dumb bots).

import { useState, FormEvent } from "react";

type Props = {
  source?: string;
  // "card" sits on its own as a feature block (used at end of posts).
  // "compact" is a tighter inline form (used on the blog index).
  variant?: "card" | "compact";
};

export default function SubscribeForm({
  source = "blog",
  variant = "card",
}: Props) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/blog-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, company: honeypot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Subscribe failed.");
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Subscribe failed.");
      setStatus("error");
    }
  }

  if (variant === "compact") {
    return (
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm"
        aria-label="Subscribe to the Veroax blog"
      >
        {status === "success" ? (
          <p className="text-sm text-emerald-700 font-medium">
            You are on the list. We sent a confirmation email.
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  Get new disclosure playbooks by email
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  No more than once a week, usually less.
                </p>
              </div>
              <div className="flex gap-2 flex-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@brokerage.com"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="rounded-lg bg-indigo-950 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-900 transition-colors disabled:opacity-60"
                >
                  {status === "sending" ? "..." : "Subscribe"}
                </button>
              </div>
            </div>
            {/* Honeypot. Hidden from users, visible to bots. */}
            <label
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                width: 1,
                height: 1,
                overflow: "hidden",
              }}
            >
              Company
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </label>
            {status === "error" && (
              <p className="text-xs text-red-600 mt-2">{errorMsg}</p>
            )}
          </>
        )}
      </form>
    );
  }

  return (
    <div
      className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4f46e5 100%)",
      }}
    >
      <div
        className="absolute -top-20 -right-20 w-[260px] h-[260px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)",
        }}
      />
      <div className="relative">
        {status === "success" ? (
          <>
            <h3 className="text-xl font-bold mb-2">You are on the list</h3>
            <p className="text-indigo-200 text-sm">
              We sent a confirmation email. Reply to it any time with a
              topic you want covered next.
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit} aria-label="Subscribe to the Veroax blog">
            <h3 className="text-xl sm:text-2xl font-bold mb-2">
              More like this in your inbox
            </h3>
            <p className="text-indigo-200 text-sm mb-5 max-w-lg">
              Short, practical posts on California disclosures, severity
              triage, and negotiation. No more than once a week.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@brokerage.com"
                className="flex-1 rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder-indigo-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 backdrop-blur-sm"
              />
              <button
                type="submit"
                disabled={status === "sending"}
                className="rounded-lg bg-amber-400 text-indigo-950 px-5 py-3 text-sm font-semibold hover:bg-amber-300 transition-colors disabled:opacity-60"
              >
                {status === "sending" ? "Subscribing..." : "Subscribe"}
              </button>
            </div>
            {/* Honeypot. Hidden from users, visible to bots. */}
            <label
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                width: 1,
                height: 1,
                overflow: "hidden",
              }}
            >
              Company
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </label>
            {status === "error" && (
              <p className="text-xs text-red-300 mt-3">{errorMsg}</p>
            )}
            <p className="text-[11px] text-indigo-300 mt-3">
              By subscribing you agree to receive Veroax editorial emails.
              Unsubscribe any time.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

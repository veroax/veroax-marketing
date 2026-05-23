import Link from "next/link";

// Rendered automatically by Next when the /r/[code] page calls
// notFound(). Kept gentle — a buyer following an expired link
// shouldn't get a stack-trace-looking 404.

export const metadata = {
  title: "Report link not found — Veroax",
  robots: { index: false, follow: false },
};

export default function ShareNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="text-center max-w-md">
        <p className="text-xs font-bold tracking-widest text-slate-500 uppercase">
          Veroax
        </p>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">
          Report link not found
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          The share link you followed has expired, was rotated, or
          doesn&apos;t exist. Check with the agent who sent it for a
          current link.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 text-indigo-700 underline underline-offset-2"
        >
          Veroax home →
        </Link>
      </div>
    </div>
  );
}

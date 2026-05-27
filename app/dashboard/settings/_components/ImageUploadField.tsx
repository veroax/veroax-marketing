"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Reusable image uploader for the Branding section. Same component
// handles the brokerage logo and the agent headshot, only the
// storage path prefix and the displayed shape (rounded square vs.
// circle) differ.
//
// Behavior:
//   - File picker accepts PNG / JPEG / SVG / WebP, max 2MB.
//   - On pick, we IMMEDIATELY upload to
//     branding/{userId}/{pathPrefix}.{ext} via the user-scoped
//     supabase client (RLS allows insert+update on the agent's own
//     folder). Uploads always overwrite so re-uploading replaces.
//   - After upload, we resolve the public URL and update local state.
//     A hidden <input name={name}> carries the URL into the form
//     submission, so the server action writes whatever the latest
//     URL was when the agent clicked Save.
//   - "Remove" zeroes the URL state. The storage object itself isn't
//     deleted (orphans are cheap and harmless), but the agent's
//     profile row no longer references it.
//   - Cache-bust query string on the rendered preview only, the URL
//     stored in form state stays clean.

type Props = {
  name: string; // form field name carried in the hidden input
  pathPrefix: "brokerage_logo" | "headshot";
  label: string;
  hint?: string;
  userId: string;
  value: string;
  onChange: (url: string) => void;
  // Visual shape of the preview thumbnail.
  shape: "square" | "circle";
};

const ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

export function ImageUploadField({
  name,
  pathPrefix,
  label,
  hint,
  userId,
  value,
  onChange,
  shape,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped each successful upload so the <img> reloads even when the
  // public URL is byte-identical (overwriting a same-name file).
  const [cacheBuster, setCacheBuster] = useState(0);

  async function handlePick(file: File) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(
        `File is ${(file.size / 1024 / 1024).toFixed(1)}MB, limit is 2MB.`,
      );
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      // File extension drives the storage path. Default to png when
      // the browser doesn't give us one (rare but possible).
      const ext =
        file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "png";
      const path = `${userId}/${pathPrefix}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true, // agents re-upload often; overwrite is the right default
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) throw new Error(upErr.message);

      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange(data.publicUrl);
      setCacheBuster(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      // Reset the file input so picking the same file again still
      // fires onChange.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    onChange("");
    setError(null);
    setCacheBuster(0);
  }

  // Append the cache buster only for display; the stored URL stays
  // clean. Without this, re-uploading a logo with the same filename
  // shows the OLD image in the browser preview until a hard refresh.
  const displaySrc =
    value && cacheBuster ? `${value}?v=${cacheBuster}` : value;

  const thumbClass =
    shape === "circle"
      ? "w-16 h-16 rounded-full object-cover border border-slate-200"
      : "max-h-16 max-w-[140px] rounded-md border border-slate-200 object-contain bg-white p-1";

  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 mb-1 block">
        {label}
      </span>

      <div className="flex items-start gap-4">
        {/* Preview / placeholder */}
        <div className="shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displaySrc}
              alt=""
              className={thumbClass}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              className={`${
                shape === "circle"
                  ? "w-16 h-16 rounded-full"
                  : "w-[140px] h-16 rounded-md"
              } border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 uppercase tracking-wider`}
            >
              None
            </div>
          )}
        </div>

        {/* Action buttons + hidden input */}
        <div className="flex-1 flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePick(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center bg-white border border-slate-300 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-slate-50 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : value ? "Replace" : "Choose image…"}
            </button>
            {value && !uploading && (
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-red-700 underline underline-offset-2"
              >
                Remove
              </button>
            )}
          </div>
          {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
          <p className="text-[11px] text-slate-400">
            PNG, JPEG, SVG, or WebP · up to 2MB
          </p>
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Hidden input carries the URL into the form submission. */}
      <input type="hidden" name={name} value={value} />
    </label>
  );
}

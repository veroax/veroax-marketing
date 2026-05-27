"use client";

import { useRef } from "react";

// Curated presets + a "Custom" hex picker for the agent's brand
// accent color. The hex flows into a hidden <input name=...> that the
// existing form submission picks up; the server action validates the
// shape before writing it to profiles.brand_accent_hex.
//
// Severity colors (red / red-orange / amber / cosmetic gray / green)
// stay LOCKED in the PDF, they're a deliberate traffic-light scheme
// that conveys meaning. Only the gold accent (cover bar, eyebrow
// text, Prepared By label) flexes here.

const PRESETS: Array<{ name: string; hex: string }> = [
  { name: "Veroax gold", hex: "#C9A84C" },
  { name: "Deep emerald", hex: "#0F766E" },
  { name: "Burgundy", hex: "#7C2D12" },
  { name: "Slate blue", hex: "#1E40AF" },
  { name: "Bronze", hex: "#92400E" },
  { name: "Charcoal", hex: "#374151" },
];

const DEFAULT_HEX = "#C9A84C";

type Props = {
  name: string;
  value: string; // "" means "use the default"
  onChange: (hex: string) => void;
};

export function AccentColorPicker({ name, value, onChange }: Props) {
  // The hidden native color picker we trigger from the "Custom" tile.
  // Keeping it as a real <input type="color"> means we get the
  // platform's color UI for free across browsers and OSes.
  const colorInputRef = useRef<HTMLInputElement>(null);

  const normalized = value.trim().toUpperCase();
  const isPreset = PRESETS.some((p) => p.hex.toUpperCase() === normalized);
  const isCustom = !!normalized && !isPreset;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-2">
        {PRESETS.map((p) => {
          const selected = p.hex.toUpperCase() === normalized;
          return (
            <button
              key={p.hex}
              type="button"
              onClick={() => onChange(p.hex)}
              title={`${p.name} (${p.hex})`}
              aria-label={`${p.name} (${p.hex})`}
              className={`w-10 h-10 rounded-lg border-2 transition-all ${
                selected
                  ? "border-slate-900 ring-2 ring-offset-1 ring-slate-900/20"
                  : "border-slate-200 hover:border-slate-400"
              }`}
              style={{ backgroundColor: p.hex }}
            />
          );
        })}

        {/* Custom tile, opens the native color picker. Selected style
            matches the preset swatches so it visually integrates with
            the row. */}
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          title={isCustom ? `Custom (${normalized})` : "Custom"}
          aria-label="Pick a custom color"
          className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-[10px] font-semibold transition-all ${
            isCustom
              ? "border-slate-900 ring-2 ring-offset-1 ring-slate-900/20 text-white"
              : "border-slate-200 hover:border-slate-400 text-slate-600"
          }`}
          style={{
            // When the agent picked a custom color, show it as the
            // tile background, otherwise show a soft conic-gradient
            // so the tile reads as "color picker, not a fixed color."
            background: isCustom
              ? normalized
              : "conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)",
          }}
        >
          {isCustom ? "" : "+"}
        </button>
      </div>

      {/* Native color picker, hidden but functional. Pre-fills with
          the current value so the picker opens on the current shade. */}
      <input
        ref={colorInputRef}
        type="color"
        value={normalized || DEFAULT_HEX}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Current selection readout + reset link */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">
          {normalized ? (
            <>
              <span className="text-slate-500">Selected:</span>{" "}
              <span className="font-mono text-slate-800">{normalized}</span>
              {isPreset && (
                <span className="text-slate-500 ml-1">
                  ({PRESETS.find((p) => p.hex.toUpperCase() === normalized)?.name})
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500 italic">
              Using the Veroax gold default ({DEFAULT_HEX})
            </span>
          )}
        </span>
        {normalized && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-slate-500 hover:text-slate-900 underline underline-offset-2"
          >
            Reset to default
          </button>
        )}
      </div>

      {/* Hidden input carries the value into the form submission. */}
      <input type="hidden" name={name} value={normalized} />
    </div>
  );
}

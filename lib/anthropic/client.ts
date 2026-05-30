import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Default model for Phase 1 analysis. Sonnet handles 200K context and is
// well-suited to long-document structured extraction; Opus would be slower
// and more expensive for not much gain on this task.
export const ANALYSIS_MODEL = "claude-sonnet-4-5-20250929";

// Lighter model for OCR transcription pre-pass. Haiku is ~3-5x faster
// than Sonnet on equivalent vision tasks and easily good enough for
// faithful page-by-page transcription. Using Sonnet for the OCR pre-pass
// on a 16-document package ate 4 minutes of the 800-second maxDuration
// budget on 434 Hibiscus Court (six-PDF scan-heavy package), pushing
// the synthesis past Vercel's kill window. Swapping to Haiku for the
// OCR-only path keeps the analysis end-to-end inside budget while
// preserving Sonnet's accuracy for the actual analysis stage.
export const OCR_MODEL = "claude-haiku-4-5-20251001";

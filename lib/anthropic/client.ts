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

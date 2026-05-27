import { randomBytes } from "node:crypto";

// Public share-code generation for the /r/{code} report view.
//
// Format: 12 lowercase alphanumeric characters from a deliberately
// reduced alphabet that drops ambiguous glyphs ("0"/"o"/"1"/"l"/"i")
// so the code is dictable over a phone call without losing entropy.
// 31-char alphabet over 12 positions = log2(31^12) is about 59.5 bits.
// Combined with rate-limiting at the route level (handled at deploy
// time) that's enough to make brute-forcing useless.
//
// Note: we do NOT include the report's id or property address in the
// code. The URL must not leak the underlying data.

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 31 chars, ambiguity-free
const CODE_LENGTH = 12;

export function generateShareCode(): string {
  const buf = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

// Sanity-check shape before we trust it as a path segment in /r/[code].
// Defense against someone hitting /r/<sql-injection> and us blindly
// querying with it. The route still uses parameterized queries via
// Supabase's PostgREST so this is belt-and-suspenders.
export function looksLikeShareCode(s: string): boolean {
  return /^[a-z2-9]{8,24}$/.test(s);
}

/**
 * Stable FNV-1a 32-bit hash of a digit string.
 * Same digits → same seed (leading zeros matter).
 */
export function hashDigits(digits: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < digits.length; i++) {
    h ^= digits.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // Avoid seed 0 edge cases in permutation shuffle
  return (h >>> 0) || 1
}

/** Keep only 0–9, max length 16. Empty → fallback default. */
export function sanitizeDigits(raw: string, fallback = '1208'): string {
  const cleaned = raw.replace(/\D/g, '').slice(0, 16)
  return cleaned.length > 0 ? cleaned : fallback
}

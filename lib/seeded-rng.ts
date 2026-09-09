/**
 * Deterministic, seedable pseudo-random number generator.
 *
 * Faultline never calls `Math.random()`. Every non-deterministic-looking value
 * (effect identifiers, jitter, id suffixes) is derived from a seed so that the
 * same `seed + scenario` always produces an identical trace.
 *
 * The algorithm is mulberry32: a small, fast, well-distributed 32-bit PRNG.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Normalize to an unsigned 32-bit integer. NaN/negative seeds are coerced
    // to a stable value so the generator is always deterministic.
    this.state = (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  }

  /** Returns the next float in the half-open interval [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a non-negative integer in the half-open interval [0, max). */
  nextInt(max: number): number {
    if (max <= 0) return 0;
    return Math.floor(this.next() * max);
  }

  /** Returns a lowercase hex token of the requested length. */
  hex(length: number): string {
    const chars = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += chars[this.nextInt(chars.length)];
    }
    return out;
  }
}

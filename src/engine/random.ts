/** Xorshift32. The full PRNG state is checkpointed; no ambient randomness in the engine. */
export class Random {
  state: number;
  constructor(seed: number) { this.state = (seed >>> 0) || 0x6d2b79f5; }
  next(): number {
    let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
  signed(): number { return this.next() * 2 - 1; }
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1); [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
export const clamp = (x: number, min: number, max: number): number => Math.max(min, Math.min(max, x));

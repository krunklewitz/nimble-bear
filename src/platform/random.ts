import type { Rng } from "../rules/dice";

/** Unbiased 1..sides from Web Crypto (rejection sampling, no modulo bias). */
export const cryptoRng: Rng = (sides: number) => {
  if (!Number.isInteger(sides) || sides < 1) throw new Error(`Bad die size ${sides}`);
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] ?? 0;
    if (v < limit) return (v % sides) + 1;
  }
};

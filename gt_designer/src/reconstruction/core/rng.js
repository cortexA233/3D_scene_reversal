export const RNG_VERSION = "mulberry32-v1";

const UINT32_RANGE = 0x1_0000_0000;

/**
 * Create the explicit random source used by Object Generators.
 *
 * @param {number} seed unsigned 32-bit integer
 * @param {string} [version]
 */
export function createSeededRng(seed, version = RNG_VERSION) {
  if (version !== RNG_VERSION) {
    throw new RangeError(`Unsupported RNG version: ${version}`);
  }
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }

  let state = seed >>> 0;

  function nextUint32() {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  function nextFloat() {
    return nextUint32() / UINT32_RANGE;
  }

  return Object.freeze({
    version,
    seed: seed >>> 0,
    nextUint32,
    nextFloat,
  });
}

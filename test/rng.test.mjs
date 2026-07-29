import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeededRng,
  RNG_VERSION,
} from "../gt_designer/src/reconstruction/core/rng.js";

test("mulberry32-v1 has a fixed integer vector", () => {
  const rng = createSeededRng(0x12345678);
  assert.equal(rng.version, RNG_VERSION);
  assert.equal(rng.seed, 0x12345678);
  assert.deepEqual(
    Array.from({ length: 6 }, () => rng.nextUint32()),
    [455919406, 4042750857, 4036713555, 1004527575, 3885174651, 3342903291],
  );
});

test("same seed repeats and different seeds diverge", () => {
  const first = createSeededRng(17);
  const second = createSeededRng(17);
  const other = createSeededRng(18);
  const a = Array.from({ length: 8 }, () => first.nextFloat());
  const b = Array.from({ length: 8 }, () => second.nextFloat());
  const c = Array.from({ length: 8 }, () => other.nextFloat());
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every((value) => value >= 0 && value < 1));
});

test("invalid seed or RNG version fails explicitly", () => {
  assert.throws(() => createSeededRng(-1), /unsigned 32-bit/);
  assert.throws(() => createSeededRng(0x1_0000_0000), /unsigned 32-bit/);
  assert.throws(() => createSeededRng(1.5), /unsigned 32-bit/);
  assert.throws(() => createSeededRng(1, "future-version"), /Unsupported/);
});

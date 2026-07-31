import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { writeFile } from "node:fs/promises";

import { EXIT } from "../src/kernel/exit-codes.mjs";
import { verifyManifestHash } from "../src/kernel/manifest.mjs";
import {
  meshReverse,
  readJson,
  readTextIfPresent,
  withTemporaryDirectory,
  writeFixture,
} from "../testing/harness.mjs";

const RUNTIME_FILES = [
  "runtime/recipe.js",
  "runtime/generator.js",
  "runtime/generator.inline.js",
];

test("the Structure Manifest is hash-bound and the artifact reproduces bit-for-bit", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");

    assert.equal(
      (
        await meshReverse([
          "run",
          "--input",
          input,
          "--out",
          first,
          "--decider",
          "mock",
          "--inline",
        ])
      ).code,
      EXIT.SUCCESS,
    );

    const manifestFile = path.join(first, "evidence/structure-manifest.json");
    const manifest = await readJson(manifestFile);
    assert.equal(verifyManifestHash(manifest).passed, true);
    assert.equal(manifest.productionUse, "prohibited");

    const reemitted = await meshReverse([
      "emit",
      "--manifest",
      manifestFile,
      "--input",
      input,
      "--out",
      second,
      "--inline",
    ]);
    assert.equal(reemitted.code, EXIT.SUCCESS, reemitted.stderr);

    for (const relative of RUNTIME_FILES) {
      assert.equal(
        await readTextIfPresent(path.join(second, relative)),
        await readTextIfPresent(path.join(first, relative)),
        `${relative} must reproduce bit-for-bit from the manifest`,
      );
    }
  });
});

test("a tampered manifest is refused rather than re-emitted", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--decider",
      "mock",
    ]);
    const manifest = await readJson(path.join(out, "evidence/structure-manifest.json"));
    const tampered = path.join(directory, "tampered.json");
    await writeFile(
      tampered,
      JSON.stringify({ ...manifest, unitId: "tampered-unit" }, null, 2),
    );

    const result = await meshReverse([
      "emit",
      "--manifest",
      tampered,
      "--input",
      input,
      "--out",
      path.join(directory, "rejected"),
    ]);
    assert.equal(result.code, EXIT.ERROR);
    assert.match(result.stderr, /hash mismatch/);
  });
});

test("re-emission refuses an input the manifest was not built from", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const other = await writeFixture(directory, "two-component");
    const out = path.join(directory, "out");
    await meshReverse(["run", "--input", input, "--out", out, "--decider", "mock"]);

    const result = await meshReverse([
      "emit",
      "--manifest",
      path.join(out, "evidence/structure-manifest.json"),
      "--input",
      other,
      "--out",
      path.join(directory, "mismatched"),
    ]);
    assert.equal(result.code, EXIT.ERROR);
    assert.match(result.stderr, /does not match the manifest/);
  });
});

test("two runs from the same input produce the same manifest hash", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const hashes = [];
    for (const label of ["a", "b"]) {
      const out = path.join(directory, label);
      await meshReverse(["run", "--input", input, "--out", out, "--decider", "mock"]);
      hashes.push(
        (await readJson(path.join(out, "evidence/structure-manifest.json"))).manifestHash,
      );
    }
    assert.equal(hashes[0], hashes[1]);
  });
});

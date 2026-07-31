import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

import { findAssetDependencies } from "../src/audit/asset-freedom.mjs";
import { listFixtureKinds } from "../src/fixtures/generate.mjs";
import { EXIT } from "../src/kernel/exit-codes.mjs";
import {
  PACKAGE_ROOT,
  meshReverse,
  readTextIfPresent,
  withTemporaryDirectory,
  writeFixture,
} from "../testing/harness.mjs";

const BINARY_EXTENSIONS = new Set([
  ".glb",
  ".gltf",
  ".obj",
  ".ply",
  ".stl",
  ".fbx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tga",
  ".ktx",
  ".ktx2",
  ".hdr",
  ".exr",
  ".wasm",
  ".bin",
  ".zip",
  ".tgz",
]);

const REPORT_DIRECTORIES = new Set(["reports", "baselines", "captures"]);

async function walk(directory, results = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full, results);
    } else {
      results.push(full);
    }
  }
  return results;
}

test("the package contains no binary asset, no image, and no report", async () => {
  const files = await walk(PACKAGE_ROOT);
  const offenders = files.filter((file) => {
    const relative = path.relative(PACKAGE_ROOT, file);
    const extension = path.extname(file).toLowerCase();
    if (BINARY_EXTENSIONS.has(extension)) return true;
    return relative
      .split(path.sep)
      .slice(0, -1)
      .some((segment) => REPORT_DIRECTORIES.has(segment));
  });
  assert.deepEqual(
    offenders.map((file) => path.relative(PACKAGE_ROOT, file)),
    [],
  );
});

test("three is a peer dependency and nothing requires native compilation", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(manifest.peerDependencies), ["three"]);
  assert.equal(
    manifest.dependencies,
    undefined,
    "a runtime dependency would have to be justified against the pure-JavaScript rule",
  );
  assert.equal(manifest.devDependencies, undefined);
  assert.equal(manifest.optionalDependencies, undefined);
  assert.equal(manifest.bin["mesh-reverse"], "bin/mesh-reverse.mjs");
});

test("the package resolves no dependency on the host repository", async () => {
  const sources = (await walk(path.join(PACKAGE_ROOT, "src"))).filter((file) =>
    file.endsWith(".mjs"),
  );
  assert.ok(sources.length > 0);
  for (const file of sources) {
    const source = await readFile(file, "utf8");
    const escapes = source.match(/from\s+["'][^"']*\.\.\/\.\.\/\.\.[^"']*["']/g) ?? [];
    assert.deepEqual(
      escapes,
      [],
      `${path.relative(PACKAGE_ROOT, file)} must not import above the package root`,
    );
    assert.equal(
      /gt_designer|tools\/evaluation|scripts\//.test(source),
      false,
      `${path.relative(PACKAGE_ROOT, file)} must not reference host-repository paths`,
    );
  }
});

test("every fixture kind generates from code and ingests as triangles", async () => {
  await withTemporaryDirectory(async (directory) => {
    for (const kind of listFixtureKinds()) {
      const file = await writeFixture(directory, kind);
      assert.ok((await stat(file)).size > 0);
      const listed = await meshReverse(["list", "--input", file]);
      assert.equal(listed.code, EXIT.SUCCESS, `${kind}: ${listed.stderr}`);
      const inventory = JSON.parse(listed.stdout);
      assert.ok(
        inventory.selectors.length > 0,
        `${kind} should expose at least one selector`,
      );
      for (const candidate of inventory.selectors) {
        assert.ok(candidate.triangleCount > 0);
      }
    }
  });
});

test("a malformed input reports its non-triangle primitives rather than dropping them", async () => {
  await withTemporaryDirectory(async (directory) => {
    const file = await writeFixture(directory, "malformed-primitives");
    const listed = await meshReverse(["list", "--input", file]);
    assert.equal(listed.code, EXIT.SUCCESS);
    const inventory = JSON.parse(listed.stdout);
    assert.ok(
      inventory.rejectedPrimitives.length > 0,
      "non-triangle primitives are reported",
    );
    assert.ok(
      inventory.rejectedPrimitives.every(
        (entry) => entry.reason === "non-triangle-primitive",
      ),
    );
  });
});

test("an input format the contract names but this build cannot decode is classified", async () => {
  await withTemporaryDirectory(async (directory) => {
    const file = path.join(directory, "unit.glb");
    await (await import("node:fs/promises")).writeFile(file, "not really a glb");
    const result = await meshReverse(["list", "--input", file]);
    assert.equal(result.code, EXIT.ERROR);
    assert.match(result.stderr, /format-not-implemented/);
  });
});

test("emitted runtime source carries no asset dependency", async () => {
  await withTemporaryDirectory(async (directory) => {
    const input = await writeFixture(directory, "lathe-profile");
    const out = path.join(directory, "out");
    assert.equal(
      (
        await meshReverse([
          "run",
          "--input",
          input,
          "--out",
          out,
          "--decider",
          "mock",
          "--inline",
        ])
      ).code,
      EXIT.SUCCESS,
    );
    for (const relative of [
      "runtime/recipe.js",
      "runtime/generator.js",
      "runtime/generator.inline.js",
    ]) {
      const source = await readTextIfPresent(path.join(out, relative));
      assert.deepEqual(findAssetDependencies(source), [], relative);
    }
    const inline = await readTextIfPresent(path.join(out, "runtime/generator.inline.js"));
    assert.deepEqual(
      findAssetDependencies(inline, { allowRelativeImports: false }),
      [],
      "inline output is self-contained: not even a relative import",
    );
  });
});

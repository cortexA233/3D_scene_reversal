import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

import * as measurement from "../src/measurement/index.mjs";
import * as perturbations from "../src/measurement/perturbations.mjs";
import { OBJECT_SPECIFIC_EXPORTS_WITHHELD } from "../src/measurement/index.mjs";
import { PACKAGE_ROOT } from "../testing/harness.mjs";

const VENDOR_ROOT = path.join(PACKAGE_ROOT, "src/measurement/vendor");

async function vendoredFiles(directory = VENDOR_ROOT, results = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await vendoredFiles(full, results);
    } else if (entry.name.endsWith(".mjs")) {
      results.push(full);
    }
  }
  return results;
}

test("object-specific baseline evaluation is not reachable from the package", async () => {
  const surface = { ...measurement, ...perturbations };
  for (const name of OBJECT_SPECIFIC_EXPORTS_WITHHELD) {
    assert.equal(
      Object.hasOwn(surface, name),
      false,
      `${name} belongs to the host repository, which owns per-object thresholds`,
    );
  }
});

test("no measurement export names a Reconstruction Unit", () => {
  const unitNames = /stone|umbrella|vase|candle|mushroom|bamboo|bluehat|blue_hat/i;
  for (const name of [
    ...Object.keys(measurement),
    ...Object.keys(perturbations),
  ]) {
    assert.equal(
      unitNames.test(name),
      false,
      `${name} is object-specific and must stay in the host repository`,
    );
  }
});

test("the vendored copies are the only measurement implementation in the package", async () => {
  const vendored = await vendoredFiles();
  assert.ok(vendored.length >= 4, "the vendor tree should hold the copied modules");

  // A second implementation of any metric would make the inner loop and the
  // acceptance gates two different rulers, which is what the copy exists to
  // prevent. Nothing outside the vendor tree may define one.
  const owned = [];
  for (const directory of ["src/kernel", "src/audit", "src/emit", "src/geometry"]) {
    for (const entry of await readdir(path.join(PACKAGE_ROOT, directory))) {
      if (entry.endsWith(".mjs")) owned.push(path.join(PACKAGE_ROOT, directory, entry));
    }
  }
  const reimplemented = /export\s+function\s+(evaluateGeometryView|evaluateAppearanceView|aggregate\w*Evidence|deltaE00|analyzeTriangleMesh|comparePointSets)\b/;
  for (const file of owned) {
    const source = await readFile(file, "utf8");
    assert.equal(
      reimplemented.test(source),
      false,
      `${path.relative(PACKAGE_ROOT, file)} reimplements a vendored metric`,
    );
  }
});

test("the vendored modules resolve their own relative imports unchanged", async () => {
  const diagnostics = await readFile(
    path.join(VENDOR_ROOT, "tools/evaluation/geometric-diagnostics.mjs"),
    "utf8",
  );
  assert.match(
    diagnostics,
    /from "\.\.\/ground-truth\/mesh-analysis\.mjs"/,
    "the vendor layout mirrors the original paths so byte-identity is possible",
  );
  // Already proven by importing it at the top of this file, but assert the
  // resolved function is the same one the copy declares.
  assert.equal(typeof measurement.evaluateGeometricDiagnostics, "function");
});

test("the generic perturbation helpers are present and the object-specific ones are not", () => {
  assert.deepEqual(Object.keys(perturbations).sort(), [
    "createLocalReferenceClone",
    "quantizeRadialResolution",
    "removeMeaningfulComponent",
    "removeMeaningfulComponentFamily",
  ]);
});

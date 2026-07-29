import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("candidate freezes detect changes to accepted inputs", async () => {
  const { describeFrozenFiles, verifyCandidateFreeze } = await import(
    "../tools/evaluation/candidate-freeze.mjs"
  );
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "scene-foundation-freeze-"),
  );
  try {
    await writeFile(path.join(fixtureRoot, "candidate.js"), "export default 1;\n");
    const candidateFiles = await describeFrozenFiles({
      projectRoot: fixtureRoot,
      paths: ["candidate.js"],
    });
    const manifest = { candidateFiles, evidenceFiles: [], baselineFiles: [] };
    assert.deepEqual(
      await verifyCandidateFreeze({ projectRoot: fixtureRoot, manifest }),
      { passed: true, failures: [] },
    );

    await writeFile(path.join(fixtureRoot, "candidate.js"), "export default 2;\n");
    const changed = await verifyCandidateFreeze({
      projectRoot: fixtureRoot,
      manifest,
    });
    assert.equal(changed.passed, false);
    assert.equal(changed.failures[0].path, "candidate.js");
  } finally {
    await rm(fixtureRoot, { recursive: true });
  }
});

test("accepted native-browser evidence remains qualified and hardware accelerated", async () => {
  const { runWebDriverLocalScene } = await import(
    "../scripts/lib/webdriver-local-scene.mjs"
  );
  assert.equal(typeof runWebDriverLocalScene, "function");

  for (const browser of ["firefox", "safari"]) {
    const report = JSON.parse(
      await readFile(
        path.join(
          PROJECT_ROOT,
          "gt_designer/single-mesh-evaluation/reports",
          `${browser}-native-gpu-gates-v1.json`,
        ),
        "utf8",
      ),
    );
    assert.equal(report.schemaVersion, "single-mesh-native-browser-gates-v1");
    assert.equal(report.browser, browser);
    assert.equal(report.configuration.headless, false);
    assert.equal(report.configuration.softwareRenderingRequested, false);
    assert.equal(report.qualification.passed, true);
    assert.equal(report.acceptance.passed, true);
    assert.ok(
      report.objects.every(
        ({ runs }) =>
          runs.length >= 2 &&
          runs.every(
            ({ report: runReport }) =>
              runReport.environment.gpu.hardwareAccelerated === true,
          ),
      ),
    );
  }
});

test("replacement production build remains reference independent", async () => {
  const { buildProductionBundle } = await import(
    "../tools/acceptance/production-build.mjs"
  );
  const { auditProductionGraph } = await import(
    "../tools/acceptance/static-audit.mjs"
  );
  const build = await buildProductionBundle({
    entryPoint: "gt_designer/single-mesh-replacement/main.js",
    projectRoot: PROJECT_ROOT,
  });
  assert.ok(build.gzipBytes > 0);
  assert.equal(build.threeBundled, false);
  const audit = await auditProductionGraph({
    projectRoot: PROJECT_ROOT,
    metafile: build.metafile,
  });
  assert.equal(audit.passed, true);
  assert.ok(audit.productionFiles.length > 0);
  assert.deepEqual(audit.thirdPartyInputs, []);
  assert.deepEqual(audit.failures, []);
});

test("the measured full-island prototype remains available", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(PROJECT_ROOT, "package.json"), "utf8"),
  );
  assert.equal(packageJson.scripts["prototype:island"], "./run.sh --local-three");
  assert.equal(
    packageJson.scripts["check:prototype:island"],
    "node scripts/smoke-full-island-prototype.mjs",
  );
  await Promise.all(
    [
      "gt_designer/full-island-prototype.js",
      "gt_designer/full-island-layout.generated.js",
      "scripts/smoke-full-island-prototype.mjs",
    ].map((relativePath) => access(path.join(PROJECT_ROOT, relativePath))),
  );
});

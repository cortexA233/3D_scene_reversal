/**
 * Native GPU evidence for the Production Runtime, per browser on this host.
 *
 * Ticket 15 asks for the scene gates run on every browser present and the rest
 * recorded as explicit blockers with reproducible commands. It had been carried as
 * blocked on Firefox and Safari not being installed, and that was the wrong
 * blocker. The real one was inside our own harness: `smoke-local-scene.mjs` passes
 * `--use-angle=swiftshader --enable-unsafe-swiftshader` on every launch, so every
 * run in this milestone — including the frozen reference observation, whose
 * `hostKey` is `windows-edge-150-swiftshader-subzero` — is software-rasterised. No
 * browser count fixes that, and a gate that rejects software rendering could never
 * have passed however many browsers were installed.
 *
 * Measured directly over CDP, this host does have a GPU and the flags were hiding
 * it:
 *
 *     forced swiftshader    ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device
 *                           (Subzero)), SwiftShader driver), max texture 8192
 *     --use-angle=default   ANGLE (Intel, Intel(R) Arc(TM) 140T GPU (16GB)
 *                           Direct3D11 vs_5_0 ps_5_0, D3D11), max texture 16384
 *
 * So this runs the Production Runtime under hardware ANGLE, twice per browser, and
 * records what it finds. `browserArguments` are appended after the harness's own
 * flags and later Chromium flags win, so nothing in the shared harness changes and
 * every existing gate keeps its SwiftShader determinism.
 *
 * What this deliberately does **not** do: re-baseline anything. The frozen evidence
 * is a SwiftShader host and a GPU host is a different host, not a better
 * measurement of the same one. Its numbers belong in the cross-host record that
 * `tools/reference/normative-hosts.mjs` already models, and nowhere near a
 * threshold.
 *
 *   node scripts/run-native-gpu-evidence.mjs
 *   node scripts/run-native-gpu-evidence.mjs --check
 */

import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "./lib/smoke-local-scene.mjs";
import { ISLAND_SCENE_RECIPE } from "../gt_designer/src/reconstruction/scene/island-scene-recipe.generated.js";
import { describeNormativeHost } from "../tools/reference/normative-hosts.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/scene-parity-foundation/evidence/native-gpu-evidence-v1.json",
);
const SCHEMA_VERSION = "native-gpu-evidence-v1";
const RUNS_PER_BROWSER = 2;
const checkOnly = process.argv.includes("--check");

/**
 * Every browser this gate knows how to look for, with the command that would run
 * it. A browser that is absent is recorded as `unavailable` with that command, so
 * the evidence says what someone on other hardware has to do rather than implying
 * the gate does not apply to them.
 */
const CANDIDATE_BROWSERS = [
  {
    id: "edge",
    engine: "chromium",
    candidates: [
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    ],
  },
  {
    id: "chrome",
    engine: "chromium",
    candidates: [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
    ],
  },
  {
    id: "firefox",
    engine: "gecko",
    candidates: [
      "C:/Program Files/Mozilla Firefox/firefox.exe",
      "/Applications/Firefox.app/Contents/MacOS/firefox",
      "/usr/bin/firefox",
    ],
    protocol: "webdriver-bidi",
    note:
      "Gecko speaks WebDriver BiDi rather than CDP, so the shared harness cannot " +
      "drive it as-is; a BiDi transport is the work, not the install.",
  },
  {
    id: "safari",
    engine: "webkit",
    candidates: ["/Applications/Safari.app/Contents/MacOS/Safari"],
    protocol: "webkit-inspector",
    note: "macOS only. Irreplaceable hardware from this host.",
  },
];

/** The renderer strings that mean this was not a GPU. */
const SOFTWARE_RENDERER = /swiftshader|software|llvmpipe|basic render|microsoft basic/i;

async function firstPresent(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

const PROBE_EXPRESSION = `(() => ({
  state: document.body?.dataset?.state ?? null,
  referenceIndependent: document.body?.dataset?.referenceIndependent === "true",
  entityCount: window.islandReplacement?.entityCount ?? null,
  contractErrors: window.islandReplacement?.contractErrors ?? null,
  error: window.islandReplacement?.error ?? null
}))()`;

/**
 * The environment record, read from the live page. The shape is what
 * `describeNormativeHost` consumes, so a GPU host and the frozen SwiftShader host
 * are described by one function rather than two.
 */
const ENVIRONMENT_EXPRESSION = `(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")
    ?? document.createElement("canvas").getContext("webgl2");
  if (!gl) return { error: "no webgl context on the production page" };
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const vendor = debug
    ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR);
  const software = /swiftshader|software|llvmpipe|basic render|microsoft basic/i.test(
    String(renderer),
  );
  return {
    // describeNormativeHost reads the platform from os.userAgentPlatform or
    // os.platform, so it goes there rather than at the top level; a flat platform
    // produced a hostKey that said unknown-os. No backticks in here: this whole
    // expression is a template literal and a comment can terminate it.
    platform: navigator.platform,
    os: {
      userAgentPlatform: navigator.userAgentData?.platform ?? null,
      platform: navigator.platform,
    },
    browser: {
      userAgentData: navigator.userAgentData
        ? { brands: navigator.userAgentData.brands }
        : null,
      userAgent: navigator.userAgent,
    },
    gpu: {
      renderer: String(renderer),
      vendor: String(vendor),
      glVersion: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      acceleration: software ? "software" : "hardware",
    },
    colour: {
      colorDepth: screen.colorDepth,
      devicePixelRatio: window.devicePixelRatio,
      drawingBufferColorSpace: gl.drawingBufferColorSpace ?? null,
      unpackColorSpace: gl.unpackColorSpace ?? null,
    },

    runtime: {
      contractErrors: window.islandReplacement?.contractErrors ?? null,
      entityCount: window.islandReplacement?.entityCount ?? null,
      semanticIdCount: window.islandReplacement?.semanticIdCount ?? null,
      triangles: window.islandReplacement?.triangles ?? null,
      drawCalls: window.islandReplacement?.drawCalls ?? null,
      generationMs: window.islandReplacement?.generationMs ?? null,
    },
  };
})()`;

async function runOnce(binary, port, threeRevision) {
  // The harness resolves its binary from CHROME_BIN and takes no override, and
  // adding one would mean editing a file every other gate depends on. Setting it
  // per run keeps the shared harness untouched.
  const previous = process.env.CHROME_BIN;
  process.env.CHROME_BIN = binary;
  try {
    return await runOnceWith(port, threeRevision);
  } finally {
    if (previous === undefined) delete process.env.CHROME_BIN;
    else process.env.CHROME_BIN = previous;
  }
}

async function runOnceWith(port, threeRevision) {
  const result = await runLocalSceneAutomation({
    label: "native-gpu-evidence",
    serverFlag: "--island-replacement",
    path: "/island-replacement/",
    query: "?dpr=1",
    readyState: { state: "ready", referenceIndependent: true },
    port,
    timeoutMs: 180_000,
    viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
    probeExpression: PROBE_EXPRESSION,
    // Appended after the harness's own flags; later Chromium flags win, so this
    // asks for the real adapter without editing the shared harness. Deliberately
    // *not* --ignore-gpu-blocklist: a browser that refuses a blocklisted GPU has
    // told us something, and forcing past it would record hardware the browser
    // declined to use.
    browserArguments: ["--use-angle=default"],
    postReadyExpression: ENVIRONMENT_EXPRESSION,
  });
  // `state` is the post-ready result when a postReadyExpression is given; the
  // probe's own readiness was already enforced by `readyState`.
  const environment = result.state;
  assert.equal(environment.error ?? null, null, `page error: ${environment.error}`);
  assert.deepEqual(
    environment.runtime.contractErrors,
    [],
    `the runtime reported contract errors: ${JSON.stringify(environment.runtime.contractErrors)}`,
  );
  // The revision comes from the installed package rather than the page, because
  // the runtime does not publish it and the page imports the same dependency this
  // resolves.
  return { ...environment, threeRevision };
}

function stabilityOf(runs) {
  const first = runs[0];
  const differences = [];
  for (const run of runs.slice(1)) {
    for (const key of ["renderer", "vendor", "glVersion", "acceleration", "maxTextureSize"]) {
      if (String(run.gpu[key]) !== String(first.gpu[key])) {
        differences.push(`gpu.${key}: ${first.gpu[key]} then ${run.gpu[key]}`);
      }
    }
    for (const key of ["entityCount", "semanticIdCount", "triangles", "drawCalls"]) {
      if (run.runtime[key] !== first.runtime[key]) {
        differences.push(`runtime.${key}: ${first.runtime[key]} then ${run.runtime[key]}`);
      }
    }
  }
  return { stable: differences.length === 0, differences };
}

async function measure() {
  const threeRevision = JSON.parse(
    await readFile(path.join(PROJECT_ROOT, "node_modules/three/package.json"), "utf8"),
  ).version;
  const browsers = [];
  let port = 8520;

  for (const candidate of CANDIDATE_BROWSERS) {
    const binary = await firstPresent(candidate.candidates);
    const command =
      candidate.protocol && candidate.protocol !== "cdp"
        ? `# ${candidate.id}: needs a ${candidate.protocol} transport, then:\n` +
          `CHROME_BIN=<${candidate.id}> node scripts/run-native-gpu-evidence.mjs`
        : `CHROME_BIN="<path to ${candidate.id}>" node scripts/run-native-gpu-evidence.mjs`;

    if (!binary) {
      browsers.push({
        id: candidate.id,
        engine: candidate.engine,
        status: "unavailable",
        reason: `no binary at any known path for ${candidate.id} on this host`,
        searched: candidate.candidates,
        protocol: candidate.protocol ?? "cdp",
        note: candidate.note ?? null,
        command,
        runs: [],
      });
      continue;
    }
    if (candidate.protocol && candidate.protocol !== "cdp") {
      browsers.push({
        id: candidate.id,
        engine: candidate.engine,
        status: "unavailable",
        reason: `installed at ${binary} but the shared harness speaks CDP only`,
        protocol: candidate.protocol,
        note: candidate.note ?? null,
        command,
        runs: [],
      });
      continue;
    }

    const runs = [];
    for (let attempt = 0; attempt < RUNS_PER_BROWSER; attempt += 1) {
      runs.push(await runOnce(binary, port, threeRevision));
      port += 1;
    }
    const stability = stabilityOf(runs);
    const host = describeNormativeHost(runs[0]);
    const software = SOFTWARE_RENDERER.test(runs[0].gpu.renderer);
    browsers.push({
      id: candidate.id,
      engine: candidate.engine,
      // A native GPU gate rejects software rendering, so a software run is
      // recorded as executed-and-not-native rather than as a pass.
      status: software ? "software-rendered" : stability.stable ? "native-gpu" : "unstable",
      binary,
      protocol: "cdp",
      command,
      host,
      stability,
      runs: runs.map((run) => ({
        gpu: run.gpu,
        colour: run.colour,
        threeRevision: run.threeRevision,
        runtime: run.runtime,
        platform: run.platform,
        userAgent: run.browser.userAgent,
      })),
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    measuredAt: new Date().toISOString(),
    subject: "the Production Runtime under each browser present on this host",
    recipe: {
      schemaVersion: ISLAND_SCENE_RECIPE.schemaVersion,
      sceneSeed: ISLAND_SCENE_RECIPE.sceneSeed,
      entityCount: ISLAND_SCENE_RECIPE.entities.length,
    },
    note:
      "Hardware ANGLE is requested per run through browserArguments, which are " +
      "appended after the harness's own --use-angle=swiftshader and win. The " +
      "shared harness is unchanged, so every other gate keeps its SwiftShader " +
      "determinism. These numbers are a different host from the frozen evidence " +
      "and must not move any threshold.",
    runsPerBrowser: RUNS_PER_BROWSER,
    browsers,
  };
}

function summarise(evidence) {
  return evidence.browsers
    .map((row) =>
      row.status === "native-gpu"
        ? `${row.id}=${row.host.rasterizerBackend}`
        : `${row.id}=${row.status}`,
    )
    .join(", ");
}

async function main() {
  if (checkOnly) {
    const recorded = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
    assert.equal(recorded.schemaVersion, SCHEMA_VERSION);
    assert.ok(recorded.browsers.length >= 4, "fewer browsers than the gate knows about");

    for (const row of recorded.browsers) {
      // Nothing unexecuted may read as a pass, and nothing executed may claim a
      // native GPU while reporting a software rasterizer.
      assert.ok(
        ["native-gpu", "software-rendered", "unstable", "unavailable"].includes(row.status),
        `${row.id} has an unknown status ${row.status}`,
      );
      if (row.status === "unavailable") {
        assert.equal(row.runs.length, 0, `${row.id} is unavailable but carries runs`);
        assert.ok(row.command, `${row.id} is unavailable without a reproducible command`);
        assert.ok(row.reason, `${row.id} is unavailable without a reason`);
        continue;
      }
      assert.equal(
        row.runs.length,
        recorded.runsPerBrowser,
        `${row.id} recorded ${row.runs.length} runs, not ${recorded.runsPerBrowser}`,
      );
      for (const run of row.runs) {
        assert.ok(run.gpu.renderer, `${row.id} recorded a run with no renderer`);
        assert.ok(run.threeRevision, `${row.id} recorded a run with no three revision`);
        assert.ok(run.runtime.triangles > 0, `${row.id} recorded a run that drew nothing`);
      }
      if (row.status === "native-gpu") {
        assert.ok(row.stability.stable, `${row.id} claims native-gpu while unstable`);
        for (const run of row.runs) {
          assert.equal(
            run.gpu.acceleration,
            "hardware",
            `${row.id} claims native-gpu with acceleration ${run.gpu.acceleration}`,
          );
          assert.ok(
            !SOFTWARE_RENDERER.test(run.gpu.renderer),
            `${row.id} claims native-gpu on renderer ${run.gpu.renderer}`,
          );
        }
      }
    }

    const native = recorded.browsers.filter((row) => row.status === "native-gpu");
    console.log(
      `Native GPU evidence: ${native.length} of ${recorded.browsers.length} browsers ` +
        `native — ${summarise(recorded)}`,
    );
    return;
  }

  const evidence = await measure();
  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  for (const row of evidence.browsers) {
    if (row.status === "unavailable") {
      console.log(`${row.id.padEnd(9)} unavailable — ${row.reason}`);
      continue;
    }
    console.log(
      `${row.id.padEnd(9)} ${row.status.padEnd(16)} ${row.host.hostKey}\n` +
        `          ${row.runs[0].gpu.renderer}\n` +
        `          ${row.runs[0].runtime.triangles} triangles, ` +
        `${row.runs[0].runtime.drawCalls} draw calls, ` +
        `${row.runs.length} runs ${row.stability.stable ? "stable" : "UNSTABLE"}`,
    );
  }
  console.log(`\nWrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)}`);
}

await main();

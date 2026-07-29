import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { build } from "esbuild";

const execFile = promisify(execFileCallback);
const JAVASCRIPT_CORE =
  "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc";
const RESULT_PREFIX = "CROSS_ENGINE_RESULT=";
const FIREFOX_VERSION = "153.0";
const FIREFOX_RELEASE_ROOT = `https://archive.mozilla.org/pub/firefox/releases/${FIREFOX_VERSION}`;

function entrySource(objectId) {
  return `
    import { generateObject } from "./gt_designer/src/reconstruction/core/object-generator.js";
    import { getObjectDefinition } from "./gt_designer/src/reconstruction/objects/object-registry.js";
    import {
      crossEngineSignature,
      disposeGeneratedRoot,
      snapshotGeneratedRoot,
    } from "./tools/acceptance/runtime-evidence.mjs";
    const definition = getObjectDefinition(${JSON.stringify(objectId)});
    const root = generateObject(definition.recipe, definition.generator);
    const signature = crossEngineSignature(snapshotGeneratedRoot(root));
    disposeGeneratedRoot(root);
    print(${JSON.stringify(RESULT_PREFIX)} + JSON.stringify(signature));
  `;
}

async function buildStructureBundle({ projectRoot, objectId, target }) {
  const bundle = await build({
    absWorkingDir: projectRoot,
    stdin: {
      contents: entrySource(objectId),
      resolveDir: projectRoot,
      sourcefile: "cross-engine-entry.js",
    },
    bundle: true,
    minify: true,
    legalComments: "none",
    platform: "browser",
    format: "iife",
    target,
    write: false,
    outfile: "cross-engine.js",
    logLevel: "silent",
  });
  return bundle.outputFiles[0].contents;
}

async function runShell({ projectRoot, objectId, executable, engine, target }) {
  const contents = await buildStructureBundle({ projectRoot, objectId, target });
  const directory = await mkdtemp(path.join(os.tmpdir(), "cross-engine-"));
  const script = path.join(directory, `${objectId}.js`);
  try {
    await writeFile(script, contents);
    const result = await execFile(executable, [script], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    const line = result.stdout
      .split("\n")
      .find((candidate) => candidate.startsWith(RESULT_PREFIX));
    if (!line) throw new Error(`${engine} emitted no structure result`);
    return {
      engine,
      signature: JSON.parse(line.slice(RESULT_PREFIX.length)),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runJavaScriptCoreStructure({ projectRoot, objectId }) {
  return runShell({
    projectRoot,
    objectId,
    executable: JAVASCRIPT_CORE,
    engine: "JavaScriptCore (Safari 26.2 system framework)",
    target: "safari26",
  });
}

async function ensureSpiderMonkey() {
  const cache = path.join(
    os.tmpdir(),
    `single-mesh-spidermonkey-${FIREFOX_VERSION}`,
  );
  const executable = path.join(cache, "js");
  try {
    await access(executable);
    return executable;
  } catch {
    // Download the matching official shell below.
  }
  await mkdir(cache, { recursive: true });
  const archiveName = "jsshell/jsshell-mac.zip";
  const [manifestResponse, archiveResponse] = await Promise.all([
    fetch(`${FIREFOX_RELEASE_ROOT}/SHA256SUMS`),
    fetch(`${FIREFOX_RELEASE_ROOT}/${archiveName}`),
  ]);
  if (!manifestResponse.ok || !archiveResponse.ok) {
    throw new Error("could not download the official Firefox engine fixture");
  }
  const manifest = await manifestResponse.text();
  const expected = manifest
    .split("\n")
    .find((line) => line.trim().endsWith(archiveName))
    ?.trim()
    .split(/\s+/)[0];
  if (!/^[0-9a-f]{64}$/.test(expected ?? "")) {
    throw new Error("Firefox SHA256SUMS has no jsshell-mac.zip entry");
  }
  const bytes = new Uint8Array(await archiveResponse.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(`Firefox engine archive checksum mismatch`);
  }
  const archive = path.join(cache, "jsshell-mac.zip");
  await writeFile(archive, bytes);
  await execFile("unzip", ["-oq", archive, "-d", cache]);
  await unlink(archive);
  await access(executable);
  return executable;
}

export async function runSpiderMonkeyStructure({ projectRoot, objectId }) {
  return runShell({
    projectRoot,
    objectId,
    executable: await ensureSpiderMonkey(),
    engine: `SpiderMonkey (Firefox ${FIREFOX_VERSION} official shell)`,
    target: "firefox153",
  });
}

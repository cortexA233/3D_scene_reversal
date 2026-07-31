import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runPipeline, emitFromManifest, mergeSelectors } from "./kernel/run.mjs";
import { artifactPaths } from "./kernel/paths.mjs";
import { EXIT, EXIT_NAMES } from "./kernel/exit-codes.mjs";
import { assertValidManifest } from "./kernel/manifest.mjs";
import { weldedConnectedComponents } from "./kernel/decompose.mjs";
import { createMockDecider, MOCK_POLICIES } from "./decider/mock.mjs";
import { generateFixtureObj, listFixtureKinds } from "./fixtures/generate.mjs";
import { ingestMeshFile, IngestionError } from "./ingest/index.mjs";
import { toReconstructionFrame } from "./geometry/mesh.mjs";
import { stableStringify } from "./util/canonical-json.mjs";
import { KERNEL_VERSION } from "./version.mjs";

const USAGE = `mesh-reverse ${KERNEL_VERSION}

  mesh-reverse run --input <mesh> --out <dir> [--decider mock|external]
                   [--policy <mock policy>] [--selector <name>] [--inline] [--resume]
  mesh-reverse list --input <mesh>
  mesh-reverse decide --out <dir> [--policy <mock policy>]
  mesh-reverse emit --manifest <file> --input <mesh> --out <dir> [--inline]
  mesh-reverse fixture --kind <kind> --out <file>

Exit codes: 0 complete, 1 error, 2 suspended at a Decision Point,
            3 emission withheld by a contract violation, 4 decision failed its schema.

Mock policies: ${Object.values(MOCK_POLICIES).join(", ")}
Fixture kinds: ${listFixtureKinds().join(", ")}`;

const FLAGS_WITH_VALUES = new Set([
  "--input",
  "--out",
  "--decider",
  "--policy",
  "--selector",
  "--manifest",
  "--kind",
]);
const BOOLEAN_FLAGS = new Set(["--inline", "--resume", "--help", "-h"]);

export function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (BOOLEAN_FLAGS.has(flag)) {
      options[flag.replace(/^--?/, "")] = true;
      continue;
    }
    if (!FLAGS_WITH_VALUES.has(flag)) {
      throw new Error(`unknown argument: ${flag}`);
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    options[flag.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

function require_(options, name) {
  if (!options[name]) throw new Error(`--${name} is required`);
  return options[name];
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    stderr.write(`${error.message}\n\n${USAGE}\n`);
    return EXIT.ERROR;
  }
  const { command, options } = parsed;

  if (!command || options.help || options.h) {
    stdout.write(`${USAGE}\n`);
    return command ? EXIT.SUCCESS : EXIT.ERROR;
  }

  try {
    switch (command) {
      case "run":
        return await commandRun(options, stdout);
      case "list":
        return await commandList(options, stdout);
      case "decide":
        return await commandDecide(options, stdout);
      case "emit":
        return await commandEmit(options, stdout);
      case "fixture":
        return await commandFixture(options, stdout);
      default:
        stderr.write(`unknown command: ${command}\n\n${USAGE}\n`);
        return EXIT.ERROR;
    }
  } catch (error) {
    if (error instanceof IngestionError) {
      stderr.write(`input rejected (${error.classification}): ${error.message}\n`);
      return EXIT.ERROR;
    }
    stderr.write(`${error.stack ?? error}\n`);
    return EXIT.ERROR;
  }
}

async function commandRun(options, stdout) {
  const deciderKind = options.decider ?? "external";
  if (deciderKind !== "mock" && deciderKind !== "external") {
    throw new Error(`--decider must be mock or external, got ${deciderKind}`);
  }
  const result = await runPipeline({
    input: path.resolve(require_(options, "input")),
    outDirectory: path.resolve(require_(options, "out")),
    selector: options.selector ?? null,
    decider:
      deciderKind === "mock"
        ? createMockDecider({ policy: options.policy ?? MOCK_POLICIES.SIMPLEST_STRUCTURE })
        : null,
    resume: options.resume === true,
    emitInline: options.inline === true,
  });
  stdout.write(`${EXIT_NAMES[result.exitCode]}: ${result.message}\n`);
  return result.exitCode;
}

async function commandList(options, stdout) {
  const ingested = await ingestMeshFile(path.resolve(require_(options, "input")));
  stdout.write(
    stableStringify({
      sourceName: ingested.sourceName,
      format: ingested.format,
      sha256: ingested.sha256,
      rejectedPrimitives: ingested.rejectedPrimitives,
      selectors: ingested.selectors.map((candidate) => ({
        selector: candidate.selector,
        triangleCount: candidate.triangleCount,
        vertexCount: candidate.vertexCount,
        bounds: candidate.bounds,
        materialCount: 1,
      })),
    }),
  );
  return EXIT.SUCCESS;
}

/**
 * The shipped mock decider answering a pending decision from disk. This is the
 * file-based half of suspend-and-resume: no harness-specific mechanism is used,
 * only running a command and reading and writing a file.
 */
async function commandDecide(options, stdout) {
  const paths = artifactPaths(require_(options, "out"));
  const pending = JSON.parse(await readFile(paths.pendingDecision, "utf8"));
  const decider = createMockDecider({
    policy: options.policy ?? MOCK_POLICIES.SIMPLEST_STRUCTURE,
  });
  const decision = {
    schemaVersion: "mesh-to-code-decision-v1",
    runId: pending.runId,
    round: pending.round,
    decisionPoint: pending.decisionPoint,
    response: decider.answer(pending),
    decider: decider.describe(),
  };
  await mkdir(path.dirname(paths.decision), { recursive: true });
  await writeFile(paths.decision, stableStringify(decision));
  stdout.write(`wrote ${paths.decision} for ${pending.decisionPoint}\n`);
  return EXIT.SUCCESS;
}

async function commandEmit(options, stdout) {
  const manifest = assertValidManifest(
    JSON.parse(await readFile(path.resolve(require_(options, "manifest")), "utf8")),
  );
  const ingested = await ingestMeshFile(path.resolve(require_(options, "input")));
  if (ingested.sha256 !== manifest.input.sha256) {
    throw new Error(
      `input does not match the manifest (${ingested.sha256} != ${manifest.input.sha256})`,
    );
  }
  const chosen = manifest.input.selector
    ? ingested.selectors.find(
        (candidate) => candidate.selector === manifest.input.selector,
      )
    : mergeSelectors(ingested.selectors);
  const framed = toReconstructionFrame(chosen.mesh);
  const components = weldedConnectedComponents(framed.mesh).components;
  const groupMeshes = Object.fromEntries(
    manifest.semanticGrouping.groups.map((group) => [
      group.groupId,
      components[group.components[0]].mesh,
    ]),
  );
  const paths = artifactPaths(require_(options, "out"));
  await emitFromManifest({
    manifest,
    groupMeshes,
    paths,
    emitInline: options.inline === true,
  });
  stdout.write(`re-emitted ${manifest.unitId} from ${manifest.manifestHash}\n`);
  return EXIT.SUCCESS;
}

async function commandFixture(options, stdout) {
  const kind = require_(options, "kind");
  const out = path.resolve(require_(options, "out"));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, generateFixtureObj(kind));
  stdout.write(`wrote ${kind} fixture to ${out}\n`);
  return EXIT.SUCCESS;
}

export { USAGE };

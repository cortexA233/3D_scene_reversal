/**
 * The whole Full Island evidence chain, in order, as one entry point.
 *
 * Ticket 16 asks for the re-run to be one reproducible workflow rather than a list a
 * human keeps in their head. The order matters and the reasons are recorded in
 * `handoff.md`: the camera set is frozen before anything is captured through it, the
 * captures come before the aggregates that read them, and the certification comes last
 * because it re-reads every one of them.
 *
 * It is a script rather than an npm chain because the browser steps alone exceed ten
 * minutes and the harness kills a foreground run at that point. Run it backgrounded and
 * read the log; every step prints its own timing and its own result, so a run that dies
 * half way says exactly where.
 *
 *   node scripts/run-full-island-workflow.mjs              # everything
 *   node scripts/run-full-island-workflow.mjs --no-observe # keep the frozen camera set
 *   node scripts/run-full-island-workflow.mjs --offline    # skip every browser step
 *   node scripts/run-full-island-workflow.mjs --list
 *
 * `--no-observe` is the default-shaped choice for a candidate change and is worth
 * understanding rather than copying. `observe:reference` re-freezes the camera-set
 * baseline, and ADR-0050 restricts that to the authoritative observation host; a
 * candidate change does not need it, because nothing about the candidate can move the
 * reference's own framing.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const offline = argv.includes("--offline");
const skipObserve = offline || argv.includes("--no-observe");

/**
 * Each step, in the order the evidence depends on it.
 *
 * `browser` marks a step that drives Edge, which is what makes the whole chain long;
 * `reframes` marks the one step that re-freezes the camera set and therefore forces
 * everything after it to be re-captured.
 */
const STEPS = [
  {
    id: "observe-reference",
    command: ["npm", "run", "observe:reference"],
    browser: true,
    reframes: true,
    why: "freezes the camera-set baseline and the reference observation profile",
  },
  {
    id: "measure-scene-coverage",
    command: ["npm", "run", "measure:scene-coverage"],
    browser: true,
    why: "the inventory, the surface samples, elevation and horizon evidence",
  },
  {
    id: "check-scene-recipe",
    command: ["node", "tools/reconstruction/build-scene-recipe.mjs", "--check"],
    why: "the recipe must already carry every control derived from that evidence",
  },
  {
    id: "check-scene-generation",
    command: ["npm", "run", "check:scene-generation"],
    browser: true,
    why: "production isolation, the static audit, and the generated island itself",
  },
  {
    id: "measure-scene-correspondence",
    command: ["npm", "run", "measure:scene-correspondence"],
    why: "structural correspondence and Scene Surface Parity",
  },
  {
    id: "measure-geography",
    command: ["npm", "run", "measure:geography"],
    why: "terrain, coastline and sea-plane evidence; consumes the camera frusta",
  },
  {
    id: "measure-horizon",
    command: ["npm", "run", "measure:horizon"],
    why: "the Horizon Profile; unaffected by the auxiliary cameras",
  },
  {
    id: "capture-scene-passes",
    command: ["node", "scripts/run-scene-passes.mjs"],
    browser: true,
    why: "the six frozen cameras, both subjects, and the review package",
  },
  {
    id: "calibrate-scene",
    command: ["npm", "run", "calibrate:scene"],
    why: "re-derives the frozen thresholds from reference-only controls",
  },
  {
    id: "report-scene-parity",
    command: ["npm", "run", "report:scene-parity"],
    allowFailure: true,
    why: "the four-layer gate stack; exits non-zero while the candidate is red",
  },
  {
    id: "certify",
    command: ["npm", "run", "certify:scene-parity-foundation"],
    browser: true,
    why: "determinism, isolation, the runtime budgets, and the certification report",
  },
  {
    id: "test",
    command: ["npm", "test"],
    allowFailure: true,
    why: "every non-interactive check, including the ones marked outstanding",
  },
];

function selected() {
  return STEPS.filter((step) => {
    if (step.reframes && skipObserve) return false;
    if (step.browser && offline) return false;
    return true;
  });
}

function run(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    const [command, ...args] = step.command;
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) => {
      resolve({ ...step, code, seconds: Math.round((Date.now() - started) / 100) / 10 });
    });
  });
}

async function main() {
  if (argv.includes("--list")) {
    for (const step of STEPS) {
      const tags = [step.browser ? "browser" : null, step.reframes ? "reframes" : null]
        .filter(Boolean)
        .join(", ");
      process.stdout.write(`${step.id.padEnd(28)} ${tags.padEnd(20)} ${step.why}\n`);
    }
    return;
  }

  if (!process.env.CHROME_BIN && !offline) {
    process.stdout.write(
      "CHROME_BIN is not set and this chain drives a browser. Set it, or pass --offline.\n",
    );
    process.exitCode = 1;
    return;
  }

  const steps = selected();
  process.stdout.write(
    `Full Island workflow: ${steps.length} of ${STEPS.length} steps` +
      `${skipObserve ? ", keeping the frozen camera set" : ""}` +
      `${offline ? ", browser steps skipped" : ""}\n\n`,
  );

  const results = [];
  for (const step of steps) {
    process.stdout.write(`\n=== ${step.id} — ${step.why}\n`);
    const result = await run(step);
    results.push(result);
    // A step that is *expected* to exit non-zero while the candidate is red does not stop
    // the chain; anything else does, because every later step reads what it wrote.
    if (result.code !== 0 && !step.allowFailure) {
      process.stdout.write(`\n${step.id} failed with ${result.code}; the chain stops here.\n`);
      break;
    }
  }

  process.stdout.write("\n\nFull Island workflow\n");
  for (const result of results) {
    const state = result.code === 0 ? "ok" : result.allowFailure ? "red (expected)" : "FAILED";
    process.stdout.write(
      `  ${result.id.padEnd(28)} ${String(result.seconds).padStart(7)}s  ${state}\n`,
    );
  }
  const skipped = STEPS.filter((step) => !results.some((result) => result.id === step.id));
  for (const step of skipped) {
    process.stdout.write(`  ${step.id.padEnd(28)} ${"—".padStart(7)}   skipped\n`);
  }
  const broke = results.find((result) => result.code !== 0 && !result.allowFailure);
  process.exitCode = broke ? 1 : 0;
}

await main();

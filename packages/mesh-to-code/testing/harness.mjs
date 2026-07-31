import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const CLI = path.join(PACKAGE_ROOT, "bin", "mesh-reverse.mjs");

/**
 * Invoke the command the way a harness would — as a process, reading its exit
 * code and its streams — so tests assert on the same externally observable
 * surface the Decision Point protocol exposes.
 *
 * `run` invocations get `--baseline-stage coarse` unless a test asks for a stage
 * itself. The Calibration Bracket scores every declared control, so running it at
 * the full twelve-view 512-pixel protocol costs seconds per invocation and would put
 * this suite in the minutes. The stage changes the threshold values, not the shape of
 * anything asserted here; the test that needs the complete protocol passes
 * `--baseline-stage final` explicitly.
 */
function withDefaultBracketStage(args) {
  if (args[0] !== "run" || args.includes("--baseline-stage")) return args;
  return [...args, "--baseline-stage", "coarse"];
}

export async function meshReverse(rawArgs, { cwd = PACKAGE_ROOT } = {}) {
  const args = withDefaultBracketStage(rawArgs);
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? String(error),
    };
  }
}

export async function withTemporaryDirectory(body) {
  const directory = await mkdtemp(path.join(tmpdir(), "mesh-to-code-"));
  try {
    return await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function writeFixture(directory, kind) {
  const file = path.join(directory, `${kind}.obj`);
  const result = await meshReverse(["fixture", "--kind", kind, "--out", file]);
  if (result.code !== 0) {
    throw new Error(`fixture ${kind} failed: ${result.stderr}`);
  }
  return file;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * Drive a suspended run to completion the way an external decider would: answer the
 * pending decision, resume, and repeat until the command stops asking. The pipeline
 * raises more than one Decision Point, so a single answer-and-resume is not the
 * whole protocol.
 */
export async function decideAndResumeUntilDone({ input, out, extraRunArgs = [], limit = 8 }) {
  const rounds = [];
  for (let round = 0; round < limit; round += 1) {
    const decided = await meshReverse(["decide", "--out", out]);
    if (decided.code !== 0) {
      return { code: decided.code, rounds, stderr: decided.stderr };
    }
    const resumed = await meshReverse([
      "run",
      "--input",
      input,
      "--out",
      out,
      "--resume",
      ...extraRunArgs,
    ]);
    rounds.push(resumed.code);
    if (resumed.code !== 2) {
      return { code: resumed.code, rounds, stdout: resumed.stdout, stderr: resumed.stderr };
    }
  }
  return { code: 2, rounds, stderr: `still suspended after ${limit} rounds` };
}

export async function readTextIfPresent(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

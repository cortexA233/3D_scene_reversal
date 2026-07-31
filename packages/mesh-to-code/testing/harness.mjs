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
 */
export async function meshReverse(args, { cwd = PACKAGE_ROOT } = {}) {
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

export async function readTextIfPresent(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

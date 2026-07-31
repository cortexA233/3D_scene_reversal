import { exec as execCallback } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execCallback);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Run the Decompiler Program package's own checks from the repository side.
 *
 * The package is not a workspace of this repository: the root manifest and
 * lockfile are frozen candidate files in two calibration contracts, so the
 * package is a sibling directory with its own manifest and its own lockfile and
 * is referenced from here by relative path only. Nothing in this script may
 * install, resolve, or rewrite a root dependency.
 */
const PACKAGE_DIRECTORY = path.join(PROJECT_ROOT, "packages/mesh-to-code");

const CHECKS = [
  ["package test suite", ["--test"]],
  ["harness neutrality", ["scripts/check-harness-neutrality.mjs"]],
  ["package contents", ["scripts/check-package-contents.mjs"]],
];

const options = process.argv.slice(2);
const skipPack = options.includes("--skip-pack");
for (const option of options) {
  if (option !== "--skip-pack") {
    throw new Error(`usage: node scripts/check-decompiler-package.mjs [--skip-pack]`);
  }
}

const results = [];
for (const [label, args] of CHECKS) {
  const command = [
    `"${process.execPath}"`,
    ...args.map((argument) => `"${argument}"`),
  ].join(" ");
  try {
    const { stdout } = await exec(command, {
      cwd: PACKAGE_DIRECTORY,
      maxBuffer: 64 * 1024 * 1024,
    });
    results.push({ label, passed: true, tail: tail(stdout) });
  } catch (error) {
    results.push({
      label,
      passed: false,
      tail: tail(`${error.stdout ?? ""}${error.stderr ?? error}`),
    });
  }
}

if (!skipPack) {
  try {
    const { stdout } = await exec(
      `"${process.execPath}" "scripts/check-pack-install-run.mjs"`,
      { cwd: PACKAGE_DIRECTORY, maxBuffer: 64 * 1024 * 1024 },
    );
    results.push({ label: "pack, install, run", passed: true, tail: tail(stdout) });
  } catch (error) {
    results.push({
      label: "pack, install, run",
      passed: false,
      tail: tail(`${error.stdout ?? ""}${error.stderr ?? error}`),
    });
  }
}

function tail(text) {
  const lines = String(text).trimEnd().split(/\r?\n/);
  return lines.slice(-3).join(" | ");
}

for (const result of results) {
  process.stdout.write(
    `${result.passed ? "PASS" : "FAIL"}  ${result.label}: ${result.tail}\n`,
  );
}

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  process.stderr.write(
    `decompiler package checks: FAIL (${failed.map((result) => result.label).join(", ")})\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `decompiler package checks: PASS (${results.length} checks)\n`,
  );
}

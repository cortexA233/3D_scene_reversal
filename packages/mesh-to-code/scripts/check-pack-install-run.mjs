import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execCallback);
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * `npm` is a shell wrapper on Windows, so it is invoked through a quoted
 * command string rather than through argument arrays.
 */
function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function runCommand(command, args, options) {
  return exec([command, ...args.map(quote)].join(" "), {
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

/**
 * Pack the package, install the tarball into a clean directory, and run the
 * command there. This is what proves the package is independently installable
 * from the first commit rather than only at extraction time.
 */
const workspace = await mkdtemp(path.join(tmpdir(), "mesh-to-code-pack-"));
const failures = [];
const notes = [];

try {
  const packDirectory = path.join(workspace, "pack");
  await mkdir(packDirectory, { recursive: true });
  const { stdout: packOutput } = await runCommand(
    NPM,
    ["pack", "--pack-destination", packDirectory, "--json"],
    { cwd: PACKAGE_ROOT },
  );
  const packed = JSON.parse(packOutput);
  const tarball = path.join(packDirectory, packed[0].filename);
  notes.push(
    `packed ${packed[0].filename} (${packed[0].entryCount} entries, ${packed[0].unpackedSize} bytes unpacked)`,
  );

  const forbidden = packed[0].files.filter((entry) =>
    /\.(glb|gltf|obj|ply|stl|png|jpe?g|webp|wasm|bin|zip|tgz)$/i.test(entry.path),
  );
  if (forbidden.length > 0) {
    failures.push(
      `tarball carries assets: ${forbidden.map((entry) => entry.path).join(", ")}`,
    );
  }

  const consumer = path.join(workspace, "consumer");
  await mkdir(consumer, { recursive: true });
  await writeFile(
    path.join(consumer, "package.json"),
    `${JSON.stringify(
      { name: "mesh-to-code-pack-consumer", version: "1.0.0", private: true },
      null,
      2,
    )}\n`,
  );
  await runCommand(NPM, ["install", "--no-audit", "--no-fund", tarball], {
    cwd: consumer,
  });
  notes.push("installed the tarball into a clean directory with no other dependency");

  const binary = path.join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "mesh-reverse.cmd" : "mesh-reverse",
  );
  const runInstalled = (args) =>
    runCommand(quote(binary), args, { cwd: consumer }).then(
      (result) => ({ code: 0, ...result }),
      (error) => ({
        code: error.code ?? 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? String(error),
      }),
    );

  const fixture = path.join(consumer, "unit.obj");
  const out = path.join(consumer, "out");
  const generated = await runInstalled([
    "fixture",
    "--kind",
    "lathe-profile",
    "--out",
    fixture,
  ]);
  if (generated.code !== 0) {
    failures.push(`installed command could not generate a fixture: ${generated.stderr}`);
  }
  const ran = await runInstalled([
    "run",
    "--input",
    fixture,
    "--out",
    out,
    "--decider",
    "mock",
    "--inline",
  ]);
  if (ran.code !== 0) {
    failures.push(`installed command exited ${ran.code}: ${ran.stderr}`);
  } else {
    notes.push(`installed command ran the full pipeline: ${ran.stdout.trim()}`);
  }

  for (const relative of [
    "runtime/recipe.js",
    "runtime/generator.js",
    "runtime/generator.inline.js",
    "evidence/structure-manifest.json",
    "evidence/evidence.json",
  ]) {
    try {
      await readFile(path.join(out, relative), "utf8");
    } catch {
      failures.push(`installed run did not produce ${relative}`);
    }
  }

  const installedFiles = await readdir(
    path.join(consumer, "node_modules", "mesh-to-code"),
  );
  notes.push(`installed tree: ${installedFiles.sort().join(", ")}`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}

for (const note of notes) process.stdout.write(`  · ${note}\n`);
if (failures.length > 0) {
  process.stderr.write("pack, install, run: FAIL\n");
  for (const failure of failures) process.stderr.write(`  × ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("pack, install, run: PASS\n");
}

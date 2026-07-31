import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The package contains no `.glb`, no image, and no report. This mirrors the
 * host repository's static asset audit: it names what it forbids rather than
 * scoring, because the code-only asset boundary cannot be a matter of degree.
 */
const FORBIDDEN_EXTENSIONS = new Set([
  ".glb", ".gltf", ".obj", ".ply", ".stl", ".fbx", ".dae", ".3ds", ".blend",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tga", ".tif", ".tiff",
  ".ktx", ".ktx2", ".basis", ".dds", ".hdr", ".exr", ".svg",
  ".wasm", ".bin", ".zip", ".tgz", ".tar", ".gz", ".7z",
  ".mp3", ".wav", ".ogg", ".mp4", ".webm",
]);

const FORBIDDEN_DIRECTORIES = new Set(["reports", "baselines", "captures", "assets", "textures"]);

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

async function walk(directory, results = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full, results);
    } else {
      results.push(full);
    }
  }
  return results;
}

const files = await walk(PACKAGE_ROOT);
const failures = [];

for (const file of files) {
  const relative = path.relative(PACKAGE_ROOT, file).split(path.sep).join("/");
  const extension = path.extname(file).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(extension)) {
    failures.push(`${relative} is a forbidden ${extension} file`);
  }
  const segments = relative.split("/").slice(0, -1);
  for (const segment of segments) {
    if (FORBIDDEN_DIRECTORIES.has(segment)) {
      failures.push(`${relative} sits under a forbidden "${segment}" directory`);
    }
  }
}

// A large file is not automatically an asset, but it is worth naming: this
// package is meant to be code, schemas, and prose.
const LARGE_FILE_BYTES = 256 * 1024;
for (const file of files) {
  const { size } = await stat(file);
  if (size > LARGE_FILE_BYTES) {
    failures.push(
      `${path.relative(PACKAGE_ROOT, file)} is ${size} bytes, over the ${LARGE_FILE_BYTES}-byte limit for a code-and-prose package`,
    );
  }
}

const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
  if (manifest[field] !== undefined) {
    failures.push(
      `package.json declares ${field}; the fitting loop must stay pure JavaScript with no native compilation`,
    );
  }
}
if (Object.keys(manifest.peerDependencies ?? {}).join(",") !== "three") {
  failures.push("three must be the only peer dependency");
}

process.stdout.write(`  · scanned ${files.length} files under the package root\n`);
if (failures.length > 0) {
  process.stderr.write("package contents: FAIL\n");
  for (const failure of failures) process.stderr.write(`  × ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("package contents: PASS (no asset, no image, no report)\n");
}

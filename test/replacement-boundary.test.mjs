import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const PRODUCTION_ROOTS = [
  "gt_designer/single-mesh-replacement",
  "gt_designer/src/reconstruction/core",
  "gt_designer/src/reconstruction/objects",
  "gt_designer/src/reconstruction/testing",
];

async function javascriptFiles(relativeDirectory) {
  const directory = path.join(PROJECT_ROOT, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...(await javascriptFiles(relative)));
    if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

test("replacement import surface contains no authored or network dependency", async () => {
  const files = (
    await Promise.all(PRODUCTION_ROOTS.map(javascriptFiles))
  ).flat();
  const prohibited = [
    /GLTFLoader/,
    /DRACOLoader/,
    /TextureLoader/,
    /\.gl(?:b|tf)\b/i,
    /island-village/i,
    /sourceNode/,
    /single-mesh-evaluation/,
    /single-mesh-lab/,
    /ground-truth/,
    /https?:\/\//,
    /Math\.random\s*\(/,
  ];
  for (const relative of files) {
    const source = await readFile(path.join(PROJECT_ROOT, relative), "utf8");
    for (const pattern of prohibited) {
      assert.doesNotMatch(source, pattern, `${relative} violates ${pattern}`);
    }
  }
});

test("replacement page resolves version-locked Three.js locally", async () => {
  const html = await readFile(
    path.join(PROJECT_ROOT, "gt_designer/single-mesh-replacement/index.html"),
    "utf8",
  );
  const packageJson = JSON.parse(
    await readFile(path.join(PROJECT_ROOT, "package.json"), "utf8"),
  );
  assert.match(html, /"three":\s*"\/vendor\/three\/build\/three\.module\.js"/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.equal(packageJson.dependencies.three, "0.170.0");
});

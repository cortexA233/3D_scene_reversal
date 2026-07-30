/**
 * Each Material Family's albedo, measured from the authored textures rather than
 * fitted through a render.
 *
 * The Scene Recipe's family albedos were hand-written, and no authored material can
 * correct them directly: measured from the assembled scene, all 236 palm placements
 * carry `color: 0xffffff` with a texture, and 442 of the vegetation materials do. That
 * is the same fact ADR-0051 ran into when `desaturate-albedo` measured 0.057 DeltaE —
 * replacing a white base colour with its own luminance is a no-op, because the colour
 * is in the map. The Production Runtime may not load the map, so a Material Family's
 * whole job is to carry its mean colour as a parameter.
 *
 * Why not simply fit the albedo until the render matches. Because the authored
 * canopy's rendered mean is dark partly because it is *dense* — many leaf layers
 * shadowing each other — and a candidate with a sparser canopy that matched the mean
 * by lowering its albedo would be using material to stand in for missing geometry,
 * which the milestone forbids and which the gate stack's ordering rule exists to
 * prevent. Measuring the texture separates the two: the albedo becomes the authored
 * material's own reflectance, and whatever rendered difference is left is honestly
 * geometry's.
 *
 * Alpha weighting is the whole difficulty. A palm frond texture is a leaf shape on a
 * transparent field, so a flat mean over its texels is mostly background. Every texel
 * is weighted by its own alpha, and a family whose texels are almost all transparent
 * is reported rather than averaged into nonsense.
 *
 * Linear, not sRGB. A base colour map is decoded as sRGB and `THREE.Color`'s three
 * number form is in the renderer's working space, which is linear, so each texel is
 * converted before it is averaged — averaging in sRGB and converting afterwards gives
 * a different and wrong answer for a high-contrast texture.
 *
 * Read-only: it reads textures the reference has already decoded and mutates nothing.
 *
 *   node tools/development/measure-material-albedo.mjs
 *   node tools/development/measure-material-albedo.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalSceneAutomation } from "../../scripts/lib/smoke-local-scene.mjs";
import { createFrozenObservationClockPreload } from "../reference/frozen-observation-clock.mjs";
import { createReferenceObservationContract } from "../reference/reference-observation-contract.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/material-albedo-v1.json",
);
const SCHEMA_VERSION = "material-albedo-v1";
const checkOnly = process.argv.includes("--check");
const contract = createReferenceObservationContract();

const MEASURE_EXPRESSION = String.raw`(async () => {
  const round = (value, digits = 4) =>
    Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  const runtime = window.island;
  if (!runtime || !runtime.ready) return { error: "the reference runtime is not ready" };

  const placements = await import("/dev-tools/reconstruction/scene-placements.mjs");

  // sRGB to linear, per channel, exactly as the renderer decodes a base colour map.
  const toLinear = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  /**
   * One texture's alpha-weighted mean linear colour, and how much of it is opaque.
   * Sampled on a bounded grid rather than every texel: a 2k map is four million
   * texels and the mean converges long before that, while the cost does not.
   */
  const CELLS = 128;
  const cache = new Map();
  const textureMean = (texture) => {
    const image = texture.image;
    if (!image || !image.width || !image.height) return null;
    if (cache.has(texture.uuid)) return cache.get(texture.uuid);
    const width = Math.min(CELLS, image.width);
    const height = Math.min(CELLS, image.height);
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    try {
      context.drawImage(image, 0, 0, width, height);
    } catch (error) {
      void error;
      return null;
    }
    const data = context.getImageData(0, 0, width, height).data;
    let weight = 0;
    const sums = [0, 0, 0];
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      if (alpha <= 0.02) continue;
      weight += alpha;
      for (let channel = 0; channel < 3; channel += 1) {
        sums[channel] += toLinear(data[index + channel]) * alpha;
      }
    }
    const result =
      weight <= 0
        ? null
        : {
            albedo: sums.map((sum) => sum / weight),
            opaqueFraction: weight / (data.length / 4),
          };
    cache.set(texture.uuid, result);
    return result;
  };

  // Accumulated per Material Family, weighted by each mesh's own world surface area
  // so a family's albedo is what that family actually covers rather than the average
  // of however many meshes happen to carry it.
  const perFamily = new Map();
  const unmapped = new Set();
  const triangleArea = (a, b, c) => {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    return Math.hypot(cx, cy, cz) * 0.5;
  };

  runtime.scene.updateMatrixWorld(true);
  const stableName = (value) => String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_");
  const visit = (object, parentPath, index) => {
    const key = parentPath + "/" + String(index).padStart(4, "0") + ":" +
      stableName(object.type) + ":" + stableName(object.name);
    if (object.isMesh) {
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const map = material && material.map;
      {
        // World surface area and world AABB, for the weight and for the resolution the
        // family table needs. The family itself comes from the shared placement rule,
        // never from the mesh's own name.
        const position = object.geometry && object.geometry.getAttribute("position");
        if (position) {
          const idx = object.geometry.getIndex();
          const count = idx ? idx.count : position.count;
          let area = 0;
          const at = (slot) => {
            const vertex = idx ? idx.getX(slot) : slot;
            return [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
          };
          const step = Math.max(3, Math.floor(count / 900) * 3);
          let sampled = 0;
          for (let slot = 0; slot + 2 < count; slot += step) {
            area += triangleArea(at(slot), at(slot + 1), at(slot + 2));
            sampled += 1;
          }
          if (sampled > 0) area = (area * (count / 3)) / sampled;
          const scale = object.matrixWorld.getMaxScaleOnAxis();
          area *= scale * scale;

          const min = [Infinity, Infinity, Infinity];
          const max = [-Infinity, -Infinity, -Infinity];
          for (let vertex = 0; vertex < position.count; vertex += 1) {
            for (let axis = 0; axis < 3; axis += 1) {
              const value = position.getComponent(vertex, axis) * scale;
              if (value < min[axis]) min[axis] = value;
              if (value > max[axis]) max[axis] = value;
            }
          }
          const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

          let resolved = null;
          try {
            resolved = placements.resolveRenderableSemantics(key, extent);
          } catch (error) {
            void error;
            unmapped.add(key.split("/").slice(-2).join("/"));
          }
          if (!resolved || !(area > 0)) {
            object.children.forEach((child, childIndex) => visit(child, key, childIndex));
            return;
          }
          const entry = perFamily.get(resolved.material) ?? {
            area: 0,
            texturedArea: 0,
            albedo: [0, 0, 0],
            opaque: 0,
            meshes: 0,
            texturedMeshes: 0,
            baseColours: new Set(),
          };
          // Every mesh that resolves to this family, textured or not. A family whose
          // textured meshes are a sliver of its own surface has not been measured, and
          // saying so is the difference between a measurement and a guess.
          // An untextured surface's albedo *is* its base colour, so it is measured the
          // same way rather than skipped. Leaving it out mismeasured shore-rock badly:
          // 2.2 per cent of its authored surface carries a map, and averaging only
          // that gave the whole family the bright orange of one small prop.
          const mean = map ? textureMean(map) : null;
          const base = material.color ? material.color.toArray() : [1, 1, 1];
          if (mean) {
            entry.texturedArea += area;
            entry.texturedMeshes += 1;
            entry.opaque += mean.opaqueFraction * area;
          }
          entry.area += area;
          entry.meshes += 1;
          for (let channel = 0; channel < 3; channel += 1) {
            // The base colour multiplies its map, so it is folded in either way —
            // white for most authored surfaces, but not for all of them.
            const reflect = mean ? mean.albedo[channel] * base[channel] : base[channel];
            entry.albedo[channel] += reflect * area;
          }
          entry.baseColours.add(material.color ? material.color.getHexString() : "none");
          perFamily.set(resolved.material, entry);
        }
      }
    }
    object.children.forEach((child, childIndex) => visit(child, key, childIndex));
  };
  visit(runtime.scene, "", 0);

  return {
    families: [...perFamily.entries()]
      .map(([id, entry]) => ({
        id,
        meshes: entry.meshes,
        texturedMeshes: entry.texturedMeshes,
        surfaceArea: round(entry.area, 2),
        texturedSurfaceArea: round(entry.texturedArea, 2),
        // How much of this family's surface carries a map. Diagnostic now rather than
        // a gate: the albedo below covers the whole family either way, because an
        // untextured surface contributes its base colour.
        texturedFraction: round(entry.area > 0 ? entry.texturedArea / entry.area : 0, 4),
        albedo: entry.area > 0 ? entry.albedo.map((sum) => round(sum / entry.area, 4)) : null,
        opaqueTexelFraction:
          entry.texturedArea > 0 ? round(entry.opaque / entry.texturedArea, 4) : null,
        authoredBaseColours: [...entry.baseColours].sort(),
      }))
      .sort((a, b) => b.surfaceArea - a.surfaceArea),
    unmappedFamilies: [...unmapped].sort(),
  };
})()`;

const PROBE_EXPRESSION = `(() => {
  const inventory = window.sceneInventory;
  return {
    state: inventory?.status === "error" ? "error" : null,
    status: inventory?.status ?? null,
    statusText: inventory?.error ?? null,
  };
})()`;

const run = await runLocalSceneAutomation({
  label: "material-albedo",
  serverFlag: "--scene-inventory",
  path: "/scene-inventory.html",
  query: `?${new URLSearchParams(contract.reference.urlOptions).toString()}`,
  readyState: { status: "ready" },
  timeoutMs: 300_000,
  port: 8494,
  probeExpression: PROBE_EXPRESSION,
  preloadScript: createFrozenObservationClockPreload(contract.clock),
  viewport: {
    width: contract.capture.cssViewport[0],
    height: contract.capture.cssViewport[1],
    deviceScaleFactor: contract.capture.deviceScaleFactor,
  },
  blockExternalNetwork: false,
  allowedExternalRequestUrls: [contract.renderContract.ocean.normalMapUrl],
  postReadyExpression: MEASURE_EXPRESSION,
});

assert.equal(run.state?.error, undefined, run.state?.error);
assert.ok(run.state?.families?.length > 0, "no Material Family was measured");

/**
 * How much of each family the scene walk actually reached, against the authored area
 * the Scene Recipe's own placement resolution assigns it.
 *
 * This is the check that a measurement is representative, and it is not decoration.
 * `creature-fur` measures a clean albedo over 100 per cent of what the walk found and
 * the walk found 13 per cent of the family: the wildlife rigs are skinned meshes whose
 * paths the family key does not resolve, so the colour of two small props was standing
 * in for fourteen animals. A family the walk does not reach keeps its declared albedo
 * and says so, rather than taking a confident number from a sliver.
 */
const MINIMUM_REACHED = 0.5;
const [inventory, horizon] = await Promise.all([
  readFile(
    path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence/scene-inventory-v1.json"),
    "utf8",
  ).then(JSON.parse),
  readFile(
    path.join(PROJECT_ROOT, ".scratch/scene-parity-foundation/evidence/horizon-reference-v1.json"),
    "utf8",
  ).then(JSON.parse),
]);
const { readAuthoredPlacements } = await import("../reconstruction/scene-placements.mjs");
const authoredArea = new Map();
for (const placement of readAuthoredPlacements(inventory, horizon).placements) {
  authoredArea.set(
    placement.materialFamily,
    (authoredArea.get(placement.materialFamily) ?? 0) + (placement.area ?? 0),
  );
}

const families = run.state.families.map((family) => {
  const authored = authoredArea.get(family.id) ?? 0;
  // Above one means the walk counted sub-meshes the placement resolution aggregates
  // differently, which is not a problem; below the floor means it missed the family.
  const reached = authored > 0 ? Number((family.surfaceArea / authored).toFixed(4)) : null;
  return {
    ...family,
    authoredSurfaceArea: Number(authored.toFixed(2)),
    reached,
    usable: family.albedo !== null && reached !== null && reached >= MINIMUM_REACHED,
  };
});

const measured = {
  schemaVersion: SCHEMA_VERSION,
  authority: contract.authority,
  note:
    "Area-weighted mean linear albedo per Material Family, measured from the Assembled " +
    "Authored Scene's own base colour maps and base colours. The authored surfaces are " +
    "almost all white with a texture, so this is where a family's colour actually lives, " +
    "and an untextured surface contributes its base colour so a family is measured whole. " +
    "Nothing sampled is retained: three numbers per family. `usable` is false where the " +
    "scene walk reached less than half the family's authored surface, in which case the " +
    "declared albedo stands.",
  minimumReached: MINIMUM_REACHED,
  families,
  unmappedFamilies: run.state.unmappedFamilies,
};

const describe = () =>
  [
    `${SCHEMA_VERSION}: ${measured.families.length} textured families`,
    "family".padEnd(18) +
      "albedo (linear)".padEnd(26) +
      "textured".padStart(9) +
      "reached".padStart(9) +
      "  area  (walk / authored)",
    ...measured.families.map(
      (family) =>
        family.id.padEnd(18) +
        (family.albedo
          ? `[${family.albedo.map((value) => value.toFixed(3)).join(" ")}]`
          : "(nothing measured)"
        ).padEnd(26) +
        family.texturedFraction.toFixed(3).padStart(9) +
        (family.reached === null ? "n/a" : family.reached.toFixed(3)).padStart(9) +
        `   ${family.surfaceArea.toFixed(0)} / ${(family.authoredSurfaceArea ?? 0).toFixed(0)}` +
        (family.usable ? "" : "   NOT APPLIED"),
    ),
    measured.unmappedFamilies.length > 0
      ? `unmapped authored families: ${measured.unmappedFamilies.join(", ")}`
      : "every textured mesh resolved to a family",
  ].join("\n");

if (checkOnly) {
  const stored = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  assert.deepEqual(measured, stored, "the measured Material Family albedo changed");
  process.stdout.write(`${describe()}\nmaterial albedo: OK\n`);
} else {
  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(measured, null, 2)}\n`);
  process.stdout.write(`${describe()}\nwrote ${path.relative(PROJECT_ROOT, EVIDENCE_PATH)}\n`);
}

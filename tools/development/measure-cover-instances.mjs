/**
 * Per-instance measurement of the Assembled Authored Scene's Distributed Scene
 * Cover, which the frozen inventory does not record.
 *
 * The inventory summarises each cover population as a count, a world AABB, and a
 * total world surface area. Those three are enough to place a scatter and to give
 * it the right total area, and ticket 09 used them for exactly that. They are not
 * enough to make it look right, and the frozen evidence says why:
 *
 * - The reference's two large rock populations span 590 by 552 units across the
 *   island and occupy *zero* pixels on the authored overview, while the three
 *   small grass populations occupy all 128 of the `cover` group's reference
 *   pixels. The candidate draws 2,199. A total surface area cannot distinguish
 *   those two situations, because rasterisation is not linear in size: an
 *   instance below a pixel across contributes almost nothing however much surface
 *   area it has, and matching the sum of squared scales therefore does not match
 *   rendered pixels when the authored distribution straddles one pixel.
 * - The authored instances are also sunk into the terrain. Nothing in the
 *   inventory records that offset.
 *
 * Both gaps are per-instance distribution facts, so this measures the
 * distribution: each population's isotropic scale quantiles, the power-law shape
 * that describes them, the per-axis jitter around it, and how far each instance's
 * origin sits below the terrain beneath it as a fraction of its own scale. That
 * is a compact semantic measurement — six numbers per population, independent of
 * instance count — and it is what the Scene Recipe carries.
 *
 * Read-only. It runs the reference's own inventory page, which loads the
 * Authored Reference and no candidate module, and reads instance matrices that
 * are already in memory. Nothing is rendered and nothing is mutated.
 *
 *   node tools/development/measure-cover-instances.mjs
 *   node tools/development/measure-cover-instances.mjs --check
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalSupportDirections } from "../../gt_designer/src/reconstruction/objects/stone-generator.js";
import { runLocalSceneAutomation } from "../../scripts/lib/smoke-local-scene.mjs";
import { createFrozenObservationClockPreload } from "../reference/frozen-observation-clock.mjs";
import { createReferenceObservationContract } from "../reference/reference-observation-contract.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const EVIDENCE_PATH = path.join(
  PROJECT_ROOT,
  ".scratch/full-island-reconstruction/evidence/cover-instances-v1.json",
);
const SCHEMA_VERSION = "cover-instances-v1";
const checkOnly = process.argv.includes("--check");
const contract = createReferenceObservationContract();

/**
 * The measurement, evaluated inside the reference page.
 *
 * It is a string because it runs in the browser through the same automation the
 * other reference measurements use, and it deliberately imports nothing: the
 * only values it needs are the ready runtime's scene and its terrain height
 * function, both of which the reference already exposes for observation. Matrix
 * decomposition is done by hand for the same reason — a column's length is its
 * axis scale, and the fourth column is the translation.
 */
const measureExpression = (camera, framebuffer, directions) => String.raw`(async () => {
  const CAMERA = ${JSON.stringify(camera)};
  const FRAMEBUFFER = ${JSON.stringify(framebuffer)};
  // The accepted Bounded Support-plane Polyhedron's canonical directions, imported on the
  // Node side from the hash-frozen stone generator and passed in as data rather than
  // restated here. Two copies of a definition is how the reference and the candidate came
  // to be sampled differently while both formulas read identically (ADR-0055).
  const SUPPORT_DIRECTIONS = ${JSON.stringify(directions)};
  const round = (value, digits = 4) => {
    if (!Number.isFinite(value)) return null;
    const result = Number(value.toFixed(digits));
    return Object.is(result, -0) ? 0 : result;
  };
  const stableName = (value) => String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_");

  const runtime = window.island;
  if (!runtime || !runtime.ready) return { error: "the reference runtime is not ready" };
  const islandH = runtime.bounds && runtime.bounds.islandH;
  if (typeof islandH !== "function") {
    return { error: "the reference runtime does not expose its terrain height" };
  }
  const seaY = runtime.bounds.seaY;

  // The same development-only path key the frozen inventory uses, so a row here
  // joins to a row there without depending on array order.
  const rows = [];
  const visit = (object, parentPath, index) => {
    const key = parentPath + "/" + String(index).padStart(4, "0") + ":" +
      stableName(object.type) + ":" + stableName(object.name);
    if (object.isInstancedMesh && object.count > 1) rows.push({ object, path: key });
    object.children.forEach((child, childIndex) => visit(child, key, childIndex));
  };
  visit(runtime.scene, "", 0);

  const quantile = (sorted, q) => {
    if (sorted.length === 0) return null;
    const position = q * (sorted.length - 1);
    const low = Math.floor(position);
    const high = Math.min(sorted.length - 1, low + 1);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
  };

  /**
   * The authored unit form's own surface area and local extent. A population's
   * scale only means something against them: the same measured area implies a
   * different scale for a lumpy icosahedron than for a two-triangle blade.
   */
  const formEvidence = (geometry) => {
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = position.getComponent(vertex, axis);
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
    }
    const at = (vertex) => [
      position.getX(vertex),
      position.getY(vertex),
      position.getZ(vertex),
    ];
    const triangles = index ? index.count / 3 : position.count / 3;
    let area = 0;
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const [a, b, c] = [0, 1, 2].map((corner) => {
        const slot = triangle * 3 + corner;
        return at(index ? index.getX(slot) : slot);
      });
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      area += Math.hypot(cross[0], cross[1], cross[2]) * 0.5;
    }
    /**
     * The support distance along each canonical direction, in a frame normalised so the
     * form's own box spans -1 to 1 per axis.
     *
     * This is the measurement ADR-0058 made for the thirty-nine identity-bearing rocks and
     * nobody made for the 5,100 scattered ones, which still draw as an icosahedron
     * stretched onto their box — a sphere in a box touches the six face centres and falls
     * short everywhere else, and the cover group under-draws at a pixel ratio of 0.78.
     *
     * Absolute level does not matter: the form is rescaled onto its measured extent
     * anyway, so what is recorded is the relative profile.
     */
    const centre = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2);
    const half = [0, 1, 2].map((axis) => Math.max(1e-6, (max[axis] - min[axis]) / 2));
    const supports = SUPPORT_DIRECTIONS.map(() => -Infinity);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const point = [0, 1, 2].map(
        (axis) => (position.getComponent(vertex, axis) - centre[axis]) / half[axis],
      );
      SUPPORT_DIRECTIONS.forEach((direction, slot) => {
        const projection =
          point[0] * direction[0] + point[1] * direction[1] + point[2] * direction[2];
        if (projection > supports[slot]) supports[slot] = projection;
      });
    }

    return {
      triangles,
      unitArea: round(area, 4),
      localBounds: { min: min.map((v) => round(v)), max: max.map((v) => round(v)) },
      localHeight: round(max[1] - min[1]),
      localWidth: round(Math.max(max[0] - min[0], max[2] - min[2])),
      supportProfile: supports.map((value) => (Number.isFinite(value) ? round(value, 4) : null)),
    };
  };

  const populations = rows.map(({ object, path: key }) => {
    const matrices = object.instanceMatrix.array;
    const isotropic = [];
    const axisRatioXZ = [];
    const axisRatioY = [];
    const sinkFractions = [];
    const sinkUnits = [];
    const relativeHeights = [];
    let aboveGround = 0;
    for (let instance = 0; instance < object.count; instance += 1) {
      const base = instance * 16;
      const column = (offset) =>
        Math.hypot(matrices[base + offset], matrices[base + offset + 1], matrices[base + offset + 2]);
      const scaleX = column(0);
      const scaleY = column(4);
      const scaleZ = column(8);
      const x = matrices[base + 12];
      const y = matrices[base + 13];
      const z = matrices[base + 14];
      // One isotropic scale per instance, so the population's shape can be read
      // without the per-axis jitter on top of it, and the jitter separately.
      const scale = Math.cbrt(scaleX * scaleY * scaleZ);
      isotropic.push(scale);
      axisRatioXZ.push(((scaleX + scaleZ) * 0.5) / scale);
      axisRatioY.push(scaleY / scale);
      const ground = islandH(x, z);
      // Positive means the origin sits below the terrain under it. Reported as a
      // fraction of the instance's own scale as well as in world units, because
      // that is how an authored scatter sinks: proportionally, not by a constant.
      sinkUnits.push(ground - y);
      if (scale > 1e-6) sinkFractions.push((ground - y) / scale);
      relativeHeights.push(ground - seaY);
      if (y > ground) aboveGround += 1;
    }

    const sortedScale = [...isotropic].sort((a, b) => a - b);
    const sortedSink = [...sinkFractions].sort((a, b) => a - b);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const low = sortedScale[0];
    const high = sortedScale[sortedScale.length - 1];
    const median = quantile(sortedScale, 0.5);
    // The authored scatter draws its size as low + pow(uniform, exponent) *
    // (high - low). Two ends and the median pin the exponent exactly, and the
    // full decile ladder is reported so the fit can be checked rather than
    // trusted.
    const span = high - low;
    const exponent =
      span > 1e-9 && median > low
        ? Math.log((median - low) / span) / Math.log(0.5)
        : 1;

    return {
      path: key,
      count: object.count,
      visible: object.visible,
      form: formEvidence(object.geometry),
      scale: {
        min: round(low),
        max: round(high),
        mean: round(mean(isotropic)),
        rootMeanSquare: round(Math.sqrt(mean(isotropic.map((value) => value * value)))),
        deciles: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((q) =>
          round(quantile(sortedScale, q)),
        ),
        exponent: round(exponent, 3),
        axisJitter: {
          lateralMean: round(mean(axisRatioXZ)),
          verticalMean: round(mean(axisRatioY)),
        },
      },
      sink: {
        meanFraction: round(mean(sinkFractions)),
        fractionDeciles: [0, 0.25, 0.5, 0.75, 1].map((q) => round(quantile(sortedSink, q))),
        meanWorldUnits: round(mean(sinkUnits)),
        instancesAboveTheirGround: aboveGround,
      },
      terrainBeneath: {
        relativeToSeaMin: round(Math.min(...relativeHeights)),
        relativeToSeaMax: round(Math.max(...relativeHeights)),
      },
    };
  });

  /**
   * Which populations the frozen overview can actually see, and what hides the
   * rest.
   *
   * The frozen inventory records that the two 80-triangle rock populations
   * occupy zero pixels on the authored overview while the three flat grass
   * populations occupy all 128 of the cover group's. That is the whole of the
   * candidate's 17-fold over-draw, so it has to be explained rather than
   * assumed: a scatter that is invisible because it is sunk into the terrain
   * needs a different correction from one that is invisible because it is behind
   * the island's own hills, and a third from one whose instances are simply
   * below a pixel.
   *
   * Diagnostic, and deliberately labelled so. It renders an object-id pass with
   * its own renderer to separate those three causes; it is not a Normative Scene
   * Capture and nothing gates it. The three subjects are the scene as it stands,
   * the scene with the terrain hidden, and the scene with every other renderable
   * hidden, which between them say whether a population is buried, occluded, or
   * sub-pixel.
   */
  const visibility = await (async () => {
    const THREE = await import("three");
    const [width, height] = FRAMEBUFFER;
    const camera = new THREE.PerspectiveCamera(
      CAMERA.verticalFovDegrees,
      CAMERA.aspect,
      CAMERA.near,
      CAMERA.far,
    );
    camera.position.set(...CAMERA.position);
    camera.up.set(...(CAMERA.up ?? [0, 1, 0]));
    camera.lookAt(...CAMERA.target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    const target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    });

    const drawn = [];
    const collect = (object) => {
      if (object.isMesh || object.isPoints || object.isLine || object.isSprite) {
        drawn.push(object);
      }
      object.children.forEach(collect);
    };
    collect(runtime.scene);
    // The same eight-bits-per-channel identity encoding the frozen inventory
    // pass uses, so an id survives a byte readback exactly.
    const idOf = (index) => index + 1;
    const colourOf = (id) => [(id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff];

    const idMaterials = drawn.map((object, index) => {
      const material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
      const [r, g, b] = colourOf(idOf(index));
      material.color.setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);
      void object;
      return material;
    });

    const countIds = (suppressInstanceColour) => {
      const previousBackground = runtime.scene.background;
      const previousFog = runtime.scene.fog;
      const previousMaterials = drawn.map((object) => object.material);
      // three.js multiplies a material's colour by an InstancedMesh's per-instance
      // colour whenever one is present, so an identity colour written into a mesh
      // that carries instanceColor comes back tinted and decodes to the wrong
      // identity. Suppressing it is the difference between measuring a population
      // and losing it.
      const tinted = suppressInstanceColour
        ? drawn.filter((object) => object.isInstancedMesh && object.instanceColor)
        : [];
      const tints = tinted.map((object) => object.instanceColor);
      for (const object of tinted) object.instanceColor = null;
      drawn.forEach((object, index) => {
        object.material = idMaterials[index];
      });
      runtime.scene.background = null;
      runtime.scene.fog = null;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, true);
      renderer.render(runtime.scene, camera);
      const pixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      drawn.forEach((object, index) => {
        object.material = previousMaterials[index];
      });
      tinted.forEach((object, index) => {
        object.instanceColor = tints[index];
      });
      runtime.scene.background = previousBackground;
      runtime.scene.fog = previousFog;
      renderer.setRenderTarget(null);
      const counts = new Map();
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const id = (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2];
        if (id === 0) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return counts;
    };

    const coverObjects = new Map(
      rows.map(({ object, path: key }) => [object, key]),
    );
    const readCover = (counts) => {
      const result = {};
      drawn.forEach((object, index) => {
        const key = coverObjects.get(object);
        if (key) result[key] = counts.get(idOf(index)) ?? 0;
      });
      return result;
    };

    // The terrain is the scene's largest triangle mass that is not instanced and
    // not the ocean plane, identified by measurement rather than by name.
    const terrain = drawn
      .filter((object) => object.isMesh && !object.isInstancedMesh && object.geometry?.getIndex)
      .map((object) => ({
        object,
        triangles: object.geometry?.getIndex()
          ? object.geometry.getIndex().count / 3
          : (object.geometry?.getAttribute("position")?.count ?? 0) / 3,
      }))
      .sort((a, b) => b.triangles - a.triangles)[0]?.object;

    // As the frozen inventory measures it — identity colours written straight onto
    // meshes that may carry a per-instance colour — and then with that tint
    // suppressed. The two differ only for the populations that carry one.
    const asIs = readCover(countIds(false));
    const untinted = readCover(countIds(true));

    const terrainWasVisible = terrain?.visible ?? null;
    if (terrain) terrain.visible = false;
    const withoutTerrain = readCover(countIds(true));
    if (terrain) terrain.visible = terrainWasVisible;

    const hiddenElsewhere = drawn.filter(
      (object) => !coverObjects.has(object) && object.visible,
    );
    for (const object of hiddenElsewhere) object.visible = false;
    const aloneCounts = countIds(true);
    for (const object of hiddenElsewhere) object.visible = true;
    const alone = readCover(aloneCounts);

    const restored =
      (terrain?.visible ?? null) === terrainWasVisible &&
      hiddenElsewhere.every((object) => object.visible);
    for (const material of idMaterials) material.dispose();
    target.dispose();
    renderer.dispose();

    return {
      note:
        "Diagnostic object-id pass through the frozen authoredOverview framing, " +
        "rendered by this tool's own renderer. Not a Normative Scene Capture and " +
        "nothing gates it; it exists to separate buried from occluded from sub-pixel.",
      camera: "authoredOverview",
      framebuffer: FRAMEBUFFER,
      terrainTriangles: terrain
        ? terrain.geometry.getIndex().count / 3
        : null,
      restored,
      asIs,
      untinted,
      withoutTerrain,
      alone,
    };
  })();

  return {
    populations: populations
      .map((population) => ({
        ...population,
        overviewPixels: {
          asTheInventoryMeasuresIt: visibility.asIs[population.path] ?? null,
          withInstanceColourSuppressed: visibility.untinted[population.path] ?? null,
          withoutTerrain: visibility.withoutTerrain[population.path] ?? null,
          alone: visibility.alone[population.path] ?? null,
        },
      }))
      .sort((a, b) => b.count - a.count),
    seaLevel: round(seaY),
    visibility: {
      note: visibility.note,
      camera: visibility.camera,
      framebuffer: visibility.framebuffer,
      terrainTriangles: visibility.terrainTriangles,
      restored: visibility.restored,
    },
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

async function measure() {
  const cameraSet = JSON.parse(
    await readFile(
      path.join(PROJECT_ROOT, "tools/reference/baselines/reference-camera-set-v2.json"),
      "utf8",
    ),
  );
  const run = await runLocalSceneAutomation({
    label: "cover-instances",
    serverFlag: "--scene-inventory",
    path: "/scene-inventory.html",
    query: `?${new URLSearchParams(contract.reference.urlOptions).toString()}`,
    readyState: { status: "ready" },
    timeoutMs: 300_000,
    port: 8492,
    probeExpression: PROBE_EXPRESSION,
    preloadScript: createFrozenObservationClockPreload(contract.clock),
    viewport: {
      width: contract.capture.cssViewport[0],
      height: contract.capture.cssViewport[1],
      deviceScaleFactor: contract.capture.deviceScaleFactor,
    },
    blockExternalNetwork: false,
    allowedExternalRequestUrls: [contract.renderContract.ocean.normalMapUrl],
    postReadyExpression: measureExpression(
      cameraSet.authoredOverview,
      contract.capture.framebuffer,
      canonicalSupportDirections().map((direction) => [direction.x, direction.y, direction.z]),
    ),
  });
  assert.equal(run.state?.error, undefined, run.state?.error);
  assert.ok(
    Array.isArray(run.state?.populations) && run.state.populations.length >= 5,
    `only ${run.state?.populations?.length} instanced cover populations were measured`,
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    authority: contract.authority,
    subject: "the Assembled Authored Scene's instanced Distributed Scene Cover",
    note:
      "Per-instance distribution facts the frozen inventory does not carry: the " +
      "isotropic scale ladder and its power-law exponent, the per-axis jitter, and " +
      "how far each instance sits below the terrain beneath it as a fraction of its " +
      "own scale. Read from instance matrices already in memory; nothing rendered, " +
      "nothing mutated, no candidate module loaded.",
    seaLevel: run.state.seaLevel,
    visibility: run.state.visibility,
    populations: run.state.populations,
  };
}

function describe(evidence) {
  const lines = [
    `${SCHEMA_VERSION}: ${evidence.populations.length} instanced cover populations`,
  ];
  for (const population of evidence.populations) {
    lines.push(
      `  ${String(population.count).padStart(5)} instances  ` +
        `scale ${population.scale.min}-${population.scale.max} ` +
        `(median ${population.scale.deciles[5]}, exponent ${population.scale.exponent}, ` +
        `rms ${population.scale.rootMeanSquare})  ` +
        `sink ${population.sink.meanFraction} of scale  ` +
        `form ${population.form.triangles} tri, unit area ${population.form.unitArea}`,
    );
    lines.push(
      `        overview px: ${population.overviewPixels.asTheInventoryMeasuresIt} as the inventory measures it, ` +
        `${population.overviewPixels.withInstanceColourSuppressed} untinted, ` +
        `${population.overviewPixels.withoutTerrain} without terrain, ` +
        `${population.overviewPixels.alone} alone`,
    );
  }
  lines.push(
    `  visibility pass restored the scene: ${evidence.visibility.restored}`,
  );
  return lines.join("\n");
}

async function main() {
  const measured = await measure();
  if (!checkOnly) {
    await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
    await writeFile(EVIDENCE_PATH, `${JSON.stringify(measured, null, 2)}\n`);
    process.stdout.write(`${describe(measured)}\nwrote ${EVIDENCE_PATH}\n`);
    return;
  }
  const stored = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  assert.deepEqual(
    measured,
    stored,
    "the measured Distributed Scene Cover no longer matches the stored evidence",
  );
  process.stdout.write(`${describe(measured)}\ncover instance measurement: OK\n`);
}

await main();

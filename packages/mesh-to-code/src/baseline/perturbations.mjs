import * as THREE from "three";

import { createMesh, meshBounds } from "../geometry/mesh.mjs";
import {
  quantizeRadialResolution,
  removeMeaningfulComponent,
  removeMeaningfulComponentFamily,
} from "../measurement/perturbations.mjs";
import { weldedConnectedComponents } from "../kernel/decompose.mjs";

/**
 * The generic perturbation manifest, generated from the mesh alone.
 *
 * Every control is declared once, applied identically to every unit, and tagged
 * with the domain it belongs to. A destructive control additionally names the
 * metrics responsible for rejecting it.
 *
 * That naming is load-bearing, and pooling instead of naming was tried and was
 * wrong. Uniform scaling about the bottom centre leaves the bottom anchor exactly
 * where it was, and a pivot shift leaves every extent exactly as it was — so each
 * bounds metric is blind to one control by construction. Judging a metric against
 * every control in a shared group therefore made every bounds and depth metric
 * look unable to separate, and would have turned the baseline diagnostic for a
 * reason that was an artefact of the pooling rather than a property of the metric.
 * The frozen hand-written baselines name their destructive scenarios per threshold
 * for the same reason.
 *
 * Component deletion, family reduction, and radial quantization reuse the
 * vendored helpers rather than reimplementing them, so the automatic manifest
 * damages a reference by exactly the strategies the frozen hand-written
 * calibrations used.
 */

export const METRIC_GROUPS = Object.freeze({
  "geometry.bounds.maxAxisRelativeError": "bounds",
  "geometry.bounds.bottomAnchorErrorCanonical": "bounds",
  "geometry.silhouette.meanIou": "silhouette",
  "geometry.silhouette.worstViewIou": "silhouette",
  "geometry.silhouette.meanEdgeDistancePixels": "silhouette",
  "geometry.silhouette.edgeDistanceP95Pixels": "silhouette",
  "geometry.depth.mae": "depth",
  "geometry.depth.p95": "depth",
});

const BOUNDS_SIZE = "geometry.bounds.maxAxisRelativeError";
const BOUNDS_ANCHOR = "geometry.bounds.bottomAnchorErrorCanonical";
const SILHOUETTE = Object.freeze([
  "geometry.silhouette.meanIou",
  "geometry.silhouette.worstViewIou",
  "geometry.silhouette.meanEdgeDistancePixels",
  "geometry.silhouette.edgeDistanceP95Pixels",
]);
const DEPTH = Object.freeze(["geometry.depth.mae", "geometry.depth.p95"]);
const ALL_GEOMETRY_METRICS = Object.freeze([
  BOUNDS_SIZE,
  BOUNDS_ANCHOR,
  ...SILHOUETTE,
  ...DEPTH,
]);

/**
 * The declared ladders. `level` records where a control sits on its ladder so a
 * report can show mild, intermediate, and severe rungs rather than a flat list.
 * A mild control must be tolerated by every geometry metric; a destructive control
 * must be rejected by the metrics it names.
 */
export const CONTROL_LADDERS = Object.freeze([
  // Mild controls: every geometry metric should tolerate these.
  ladder("uniform-scale/1.005", "mild", "mild", ALL_GEOMETRY_METRICS, (mesh) =>
    scaleAboutBottomCenter(mesh, [1.005, 1.005, 1.005]),
  ),
  ladder("uniform-scale/0.995", "mild", "mild", ALL_GEOMETRY_METRICS, (mesh) =>
    scaleAboutBottomCenter(mesh, [0.995, 0.995, 0.995]),
  ),
  ladder("uniform-scale/1.01", "mild", "intermediate", ALL_GEOMETRY_METRICS, (mesh) =>
    scaleAboutBottomCenter(mesh, [1.01, 1.01, 1.01]),
  ),
  ladder("pivot-shift/0.004", "mild", "mild", ALL_GEOMETRY_METRICS, (mesh) =>
    shiftPivot(mesh, 0.004),
  ),
  ladder("pivot-shift/0.008", "mild", "intermediate", ALL_GEOMETRY_METRICS, (mesh) =>
    shiftPivot(mesh, 0.008),
  ),
  ladder("rotate-y/1.0", "mild", "mild", ALL_GEOMETRY_METRICS, (mesh) =>
    rotateAboutBottomCenter(mesh, "y", 1),
  ),
  ladder("rotate-y/2.5", "mild", "intermediate", ALL_GEOMETRY_METRICS, (mesh) =>
    rotateAboutBottomCenter(mesh, "y", 2.5),
  ),
  ladder("rotate-x/1.0", "mild", "mild", ALL_GEOMETRY_METRICS, (mesh) =>
    rotateAboutBottomCenter(mesh, "x", 1),
  ),

  // Destructive controls, each naming the metrics responsible for rejecting it.
  ladder("uniform-scale/1.05", "destructive", "severe", [BOUNDS_SIZE], (mesh) =>
    scaleAboutBottomCenter(mesh, [1.05, 1.05, 1.05]),
  ),
  ladder("uniform-scale/0.95", "destructive", "severe", [BOUNDS_SIZE], (mesh) =>
    scaleAboutBottomCenter(mesh, [0.95, 0.95, 0.95]),
  ),
  ladder("anisotropic-x/1.10", "destructive", "severe", [BOUNDS_SIZE, ...SILHOUETTE], (mesh) =>
    scaleAboutBottomCenter(mesh, [1.1, 1, 1]),
  ),
  ladder(
    "squash-y/0.80",
    "destructive",
    "severe",
    [BOUNDS_SIZE, ...SILHOUETTE, ...DEPTH],
    (mesh) => scaleAboutBottomCenter(mesh, [1, 0.8, 1]),
  ),
  ladder("pivot-shift/0.10", "destructive", "severe", [BOUNDS_ANCHOR], (mesh) =>
    shiftPivot(mesh, 0.1),
  ),
  ladder("delete-component", "destructive", "severe", [...SILHOUETTE, ...DEPTH], (mesh) =>
    deleteComponent(mesh),
  ),
  ladder("reduce-family", "destructive", "severe", [...SILHOUETTE, ...DEPTH], (mesh) =>
    reduceFamily(mesh),
  ),
  ladder("collapse-structure", "destructive", "severe", [...SILHOUETTE, ...DEPTH], (mesh) =>
    collapseStructure(mesh),
  ),
  ladder("quantize-resolution/6", "destructive", "severe", [...SILHOUETTE, ...DEPTH], (mesh) =>
    quantizeResolution(mesh, 6),
  ),

  // Appearance-domain controls. Generated because the manifest is not complete
  // without them, and deliberately naming no geometry metric: they leave geometry
  // untouched, so no geometry metric can or should reject them.
  ladder(
    "flatten-appearance",
    "destructive",
    "severe",
    [],
    (mesh) => ({ mesh, appearance: { flatten: true } }),
    "appearance",
  ),
  ladder(
    "corrupt-palette",
    "destructive",
    "severe",
    [],
    (mesh) => ({ mesh, appearance: { hueRotationDegrees: 120 } }),
    "appearance",
  ),
]);

function ladder(id, kind, level, metrics, apply, domain = "geometry") {
  return Object.freeze({
    id,
    kind,
    level,
    metrics: Object.freeze([...metrics]),
    domain,
    apply,
  });
}

function longestDimension(mesh) {
  return Math.max(...meshBounds(mesh).size) || 1;
}

function bottomCenter(mesh) {
  const bounds = meshBounds(mesh);
  return [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    bounds.min[1],
    (bounds.min[2] + bounds.max[2]) * 0.5,
  ];
}

function mapPositions(mesh, transform) {
  const positions = new Float64Array(mesh.positions.length);
  for (let offset = 0; offset < positions.length; offset += 3) {
    const moved = transform(
      mesh.positions[offset],
      mesh.positions[offset + 1],
      mesh.positions[offset + 2],
    );
    positions[offset] = moved[0];
    positions[offset + 1] = moved[1];
    positions[offset + 2] = moved[2];
  }
  return createMesh({ positions, indices: mesh.indices, name: mesh.name });
}

export function scaleAboutBottomCenter(mesh, factors) {
  const origin = bottomCenter(mesh);
  return {
    mesh: mapPositions(mesh, (x, y, z) => [
      origin[0] + (x - origin[0]) * factors[0],
      origin[1] + (y - origin[1]) * factors[1],
      origin[2] + (z - origin[2]) * factors[2],
    ]),
  };
}

export function shiftPivot(mesh, fraction) {
  const offset = longestDimension(mesh) * fraction;
  return { mesh: mapPositions(mesh, (x, y, z) => [x + offset, y, z]) };
}

export function rotateAboutBottomCenter(mesh, axis, degrees) {
  const origin = bottomCenter(mesh);
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    mesh: mapPositions(mesh, (x, y, z) => {
      const dx = x - origin[0];
      const dy = y - origin[1];
      const dz = z - origin[2];
      if (axis === "y") {
        return [
          origin[0] + dx * cos + dz * sin,
          y,
          origin[2] - dx * sin + dz * cos,
        ];
      }
      return [
        x,
        origin[1] + dy * cos - dz * sin,
        origin[2] + dy * sin + dz * cos,
      ];
    }),
  };
}

/** The axis-aligned bounding box: the strongest generic structural collapse. */
export function collapseStructure(mesh) {
  const bounds = meshBounds(mesh);
  const positions = [];
  for (const z of [bounds.min[2], bounds.max[2]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const x of [bounds.min[0], bounds.max[0]]) {
        positions.push(x, y, z);
      }
    }
  }
  return {
    mesh: createMesh({
      positions,
      indices: [
        0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0,
        4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5,
      ],
      name: "collapsed",
    }),
  };
}

function toBufferGeometry(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(Float32Array.from(mesh.positions), 3),
  );
  geometry.setIndex(Array.from(mesh.indices));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function fromBufferGeometry(geometry, name) {
  const position = geometry.getAttribute("position");
  const positions = new Float64Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    positions[index * 3] = position.getX(index);
    positions[index * 3 + 1] = position.getY(index);
    positions[index * 3 + 2] = position.getZ(index);
  }
  const indices = geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: position.count }, (_, index) => index);
  return createMesh({ positions, indices, name });
}

/**
 * A vendored helper refuses a mesh it cannot damage in its declared way — too few
 * components, or a non-dominant family too small to reach the requested area
 * fraction. That refusal is a property of the reference, so it is recorded as not
 * applicable and the metrics naming that control fall back to whichever controls
 * remain. It is never swallowed into a silent success.
 */
function attempt(build, name) {
  try {
    return build();
  } catch (error) {
    return {
      notApplicable: `${name} is not applicable to this reference: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export function deleteComponent(mesh) {
  const { components } = weldedConnectedComponents(mesh);
  if (components.length < 2) {
    return { notApplicable: "component deletion needs at least two connected components" };
  }
  return attempt(() => {
    const result = removeMeaningfulComponent(toBufferGeometry(mesh));
    return {
      mesh: fromBufferGeometry(result.geometry, "component-deleted"),
      metadata: result.metadata,
    };
  }, "component deletion");
}

export const FAMILY_REDUCTION_AREA_FRACTION = 0.2;

export function reduceFamily(mesh) {
  const { components } = weldedConnectedComponents(mesh);
  if (components.length < 3) {
    return { notApplicable: "family reduction needs at least three connected components" };
  }
  return attempt(() => {
    const result = removeMeaningfulComponentFamily(
      toBufferGeometry(mesh),
      FAMILY_REDUCTION_AREA_FRACTION,
    );
    return {
      mesh: fromBufferGeometry(result.geometry, "family-reduced"),
      metadata: result.metadata,
    };
  }, "family reduction");
}

export function quantizeResolution(mesh, segmentCount) {
  // Radial quantization is measured about the object's own vertical axis, so the
  // mesh is centred first and restored afterwards.
  const origin = bottomCenter(mesh);
  return attempt(() => {
    const centred = mapPositions(mesh, (x, y, z) => [x - origin[0], y, z - origin[2]]);
    const quantized = quantizeRadialResolution(toBufferGeometry(centred), segmentCount);
    const restored = fromBufferGeometry(quantized, "resolution-quantized");
    return {
      mesh: mapPositions(restored, (x, y, z) => [x + origin[0], y, z + origin[2]]),
      metadata: { segmentCount },
    };
  }, `radial quantization to ${segmentCount} segments`);
}

/**
 * Generate the manifest for one reference. Controls the mesh cannot support are
 * recorded as not applicable rather than silently dropped, because a metric that
 * loses every destructive control naming it must be reported as diagnostic, not
 * quietly treated as separable.
 */
export function generatePerturbationManifest({ mesh }) {
  const controls = [];
  for (const definition of CONTROL_LADDERS) {
    const applied = definition.apply(mesh);
    controls.push({
      id: definition.id,
      kind: definition.kind,
      level: definition.level,
      domain: definition.domain,
      metrics: [...definition.metrics],
      applicable: applied.notApplicable === undefined,
      notApplicableReason: applied.notApplicable ?? null,
      mesh: applied.mesh ?? null,
      appearance: applied.appearance ?? null,
      metadata: applied.metadata ?? null,
    });
  }
  return {
    version: "decompiler-generic-perturbation-manifest-v1",
    generatedFrom: "the mesh alone; no per-object manifest is authored",
    controls,
  };
}

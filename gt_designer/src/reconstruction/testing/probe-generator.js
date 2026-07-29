import * as THREE from "three";

import { semanticPartId } from "../core/object-generator.js";

export const PROBE_RECIPE = Object.freeze({
  id: "test.probe",
  kind: "acceptance-probe-v1",
  seed: 0x51a7e,
  shape: Object.freeze({
    width: 2.4,
    depth: 1.6,
    bodyHeight: 1.8,
    beaconHeight: 1.2,
    beaconRadius: 0.72,
    radialSegments: 6,
  }),
  appearance: Object.freeze({
    bodyColor: 0x386f8f,
    beaconColor: 0xf2aa4c,
    roughness: 0.72,
    metalness: 0.04,
  }),
});

/**
 * Synthetic fixture for contract and offline smoke tests. It is not an island
 * object and must not become a general geometry abstraction.
 *
 * @param {typeof PROBE_RECIPE} recipe
 * @param {import("../core/object-generator.js").SeededRng} rng
 */
export function generateProbe(recipe, rng) {
  const { shape, appearance } = recipe;
  const root = new THREE.Group();
  root.name = "Acceptance Probe";
  root.userData.semanticId = recipe.id;
  root.userData.generatorKind = recipe.kind;
  root.userData.recipeSeed = recipe.seed;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(shape.width, shape.bodyHeight, shape.depth),
    new THREE.MeshStandardMaterial({
      color: appearance.bodyColor,
      roughness: appearance.roughness,
      metalness: appearance.metalness,
    }),
  );
  body.name = "Probe Body";
  body.position.y = shape.bodyHeight * 0.5;
  body.userData.semanticId = semanticPartId(recipe.id, "body");
  root.add(body);

  const beacon = new THREE.Mesh(
    new THREE.ConeGeometry(
      shape.beaconRadius,
      shape.beaconHeight,
      shape.radialSegments,
    ),
    new THREE.MeshStandardMaterial({
      color: appearance.beaconColor,
      roughness: appearance.roughness,
      metalness: appearance.metalness,
    }),
  );
  beacon.name = "Probe Beacon";
  beacon.position.y = shape.bodyHeight + shape.beaconHeight * 0.5;
  beacon.rotation.y = rng.nextFloat() * Math.PI * 2;
  beacon.userData.semanticId = semanticPartId(recipe.id, "beacon");
  root.add(beacon);

  root.updateMatrixWorld(true);
  return root;
}

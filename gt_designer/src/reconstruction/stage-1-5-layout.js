import * as THREE from "three";

import { generateObject } from "./core/object-generator.js";
import { getEightSlotLabSlot } from "./eight-slot-lab-layout.js";
import { getObjectDefinition } from "./objects/object-registry.js";

export const STAGE_1_5_LAYOUT_VERSION =
  "stage-1-5-eight-slot-lab-layout-v2";

function placement(objectId, displayScale) {
  const slot = getEightSlotLabSlot(objectId);
  return Object.freeze({
    objectId,
    position: Object.freeze([
      slot.position[0],
      slot.position[1] + 0.01,
      slot.position[2],
    ]),
    displayScale,
  });
}

// The generators remain in source units. These four compact scale measurements
// reproduce the Lab's seven-unit largest-dimension normalization without loading
// the Authored Reference or development evidence at runtime.
export const STAGE_1_5_PLACEMENTS = Object.freeze([
  placement("stone-path", 0.7665970674761228),
  placement("stone", 0.4358635000232776),
  placement("vase", 1.7930120712667892),
  placement("umbrella", 0.6399488880108278),
]);

export function createStage15Assembly() {
  const root = new THREE.Group();
  root.name = "Stage 1.5 Eight-slot Lab Assembly";
  root.userData.semanticId =
    "single-mesh.stage-1-5.eight-slot-lab-layout";
  root.userData.layoutVersion = STAGE_1_5_LAYOUT_VERSION;

  const entries = STAGE_1_5_PLACEMENTS.map((scenePlacement) => {
    const definition = getObjectDefinition(scenePlacement.objectId);
    const objectRoot = generateObject(definition.recipe, definition.generator);
    objectRoot.position.fromArray(scenePlacement.position);
    objectRoot.scale.setScalar(scenePlacement.displayScale);
    objectRoot.userData.scenePlacementId = scenePlacement.objectId;
    root.add(objectRoot);
    return Object.freeze({
      definition,
      placement: scenePlacement,
      root: objectRoot,
    });
  });

  root.updateMatrixWorld(true);
  return Object.freeze({ root, entries: Object.freeze(entries) });
}

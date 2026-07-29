import * as THREE from "three";

import { generateObject } from "./core/object-generator.js";
import { getObjectDefinition } from "./objects/object-registry.js";

export const STAGE_1_5_LAYOUT_VERSION = "stage-1-5-reference-layout-v1";

function placement(objectId, position) {
  return Object.freeze({
    objectId,
    position: Object.freeze(position),
  });
}

// Compact scene-level placement measurements. Each Procedural Replacement is
// already expressed in its bottom-center Reconstruction Frame, so translation
// alone restores the corresponding Authored Reference world position.
export const STAGE_1_5_PLACEMENTS = Object.freeze([
  placement("stone-path", [-58.20568084716797, 25.57322120666504, 34.20328330993652]),
  placement("stone", [174.04873657226562, 12.001924514770508, 125.59476470947266]),
  placement("vase", [24.338738441467285, 25.514421463012695, -5.522238731384277]),
  placement("umbrella", [23.53999900817871, 25.305038452148438, 32.74954700469971]),
]);

export function createStage15Assembly() {
  const root = new THREE.Group();
  root.name = "Stage 1.5 Reference-layout Assembly";
  root.userData.semanticId = "island.stage-1-5.reference-layout";
  root.userData.layoutVersion = STAGE_1_5_LAYOUT_VERSION;

  const entries = STAGE_1_5_PLACEMENTS.map((scenePlacement) => {
    const definition = getObjectDefinition(scenePlacement.objectId);
    const objectRoot = generateObject(definition.recipe, definition.generator);
    objectRoot.position.fromArray(scenePlacement.position);
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

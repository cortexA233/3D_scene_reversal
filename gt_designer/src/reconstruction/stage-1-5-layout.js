import * as THREE from "three";

import { generateObject } from "./core/object-generator.js";
import { getEightSlotLabSlot } from "./eight-slot-lab-layout.js";
import { getObjectDefinition } from "./objects/object-registry.js";

export const EIGHT_OBJECT_LAB_LAYOUT_VERSION =
  "stage-2-eight-object-lab-layout-v1";

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

// The generators remain in source units. These eight compact scale measurements
// reproduce the Lab's seven-unit largest-dimension normalization without loading
// the Authored Reference or development evidence at runtime.
export const EIGHT_OBJECT_LAB_PLACEMENTS = Object.freeze([
  placement("stone-path", 0.7665970674761228),
  placement("stone", 0.4358635000232776),
  placement("bamboo-shoot", 0.7595135905776024),
  placement("blue-hat", 3.4997797150981937),
  placement("vase", 1.7930120712667892),
  placement("candle", 2.3809643058027157),
  placement("mushroom", 0.9975287488162892),
  placement("umbrella", 0.6399488880108278),
]);

export function createEightObjectLabAssembly() {
  const root = new THREE.Group();
  root.name = "Stage 2 Eight-object Lab Assembly";
  root.userData.semanticId =
    "single-mesh.stage-2.eight-object-lab-layout";
  root.userData.layoutVersion = EIGHT_OBJECT_LAB_LAYOUT_VERSION;

  const entries = EIGHT_OBJECT_LAB_PLACEMENTS.map((scenePlacement) => {
    const definition = getObjectDefinition(scenePlacement.objectId);
    const objectRoot = generateObject(definition.recipe, definition.generator);
    objectRoot.scale.setScalar(scenePlacement.displayScale);
    objectRoot.updateMatrixWorld(true);
    const localBounds = new THREE.Box3().setFromObject(objectRoot);
    const localBottomCenter = new THREE.Vector3(
      (localBounds.min.x + localBounds.max.x) * 0.5,
      localBounds.min.y,
      (localBounds.min.z + localBounds.max.z) * 0.5,
    );
    objectRoot.position.add(new THREE.Vector3(
      scenePlacement.position[0] - localBottomCenter.x,
      scenePlacement.position[1] - localBottomCenter.y,
      scenePlacement.position[2] - localBottomCenter.z,
    ));
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

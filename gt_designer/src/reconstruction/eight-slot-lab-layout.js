function vector(values) {
  return Object.freeze(values);
}

function slot(id, position) {
  return Object.freeze({ id, position: vector(position) });
}

export const EIGHT_SLOT_LAB_REFERENCE_LAYOUT = Object.freeze({
  id: "eight-slot-lab-reference",
  canonicalMaxDimension: 7,
  camera: Object.freeze({
    fov: 38,
    near: 0.1,
    far: 180,
    position: vector([2, 22, 36]),
    target: vector([0, 2.2, 0]),
  }),
  floor: Object.freeze({
    size: vector([42, 42]),
    color: 0xd8d2c3,
  }),
  slots: Object.freeze([
    slot("stone-path", [-14.25, 0, -7]),
    slot("stone", [-4.75, 0, -7]),
    slot("bamboo-shoot", [4.75, 0, -7]),
    slot("blue-hat", [14.25, 0, -7]),
    slot("vase", [-14.25, 0, 7]),
    slot("candle", [-4.75, 0, 7]),
    slot("mushroom", [4.75, 0, 7]),
    slot("umbrella", [14.25, 0, 7]),
  ]),
});

export function getEightSlotLabSlot(objectId) {
  const result = EIGHT_SLOT_LAB_REFERENCE_LAYOUT.slots.find(
    ({ id }) => id === objectId,
  );
  if (!result) throw new Error(`Unknown eight-slot Lab object: ${objectId}`);
  return result;
}

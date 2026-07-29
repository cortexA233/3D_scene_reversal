import {
  EIGHT_SLOT_LAB_REFERENCE_LAYOUT,
  getEightSlotLabSlot,
} from "../src/reconstruction/eight-slot-lab-layout.js";

function object(spec) {
  return Object.freeze({
    ...spec,
    slot: getEightSlotLabSlot(spec.id).position,
  });
}

// Fixed reference setup for procedural single-mesh reconstruction experiments.
// Every source mesh is moved to a bottom-center pivot and uniformly normalized
// so its largest bounding-box dimension equals canonicalMaxDimension.
export const LAB_SCENE = Object.freeze({
  canonicalMaxDimension:
    EIGHT_SLOT_LAB_REFERENCE_LAYOUT.canonicalMaxDimension,
  camera: EIGHT_SLOT_LAB_REFERENCE_LAYOUT.camera,
  floor: EIGHT_SLOT_LAB_REFERENCE_LAYOUT.floor,
  objects: Object.freeze([
    object({
      id: "stone-path",
      label: "Stone Path",
      description: "64 triangles · irregular extrusion",
      sourceNode: "StonePath__stonepath_13__1",
    }),
    object({
      id: "stone",
      label: "Stone",
      description: "212 triangles · displaced low-poly volume",
      sourceNode: "Stone__stone_8__0.003",
    }),
    object({
      id: "bamboo-shoot",
      label: "Bamboo Shoot",
      description: "424 triangles · tapered axial form",
      sourceNode: "Bamboo_shoot_01_FBX__bambooshoot01fbx_1__0",
    }),
    object({
      id: "blue-hat",
      label: "Blue Hat",
      description: "704 triangles · crown and radial brim",
      sourceNode: "blue_hat_fbx__bluehatfbx_1__0",
    }),
    object({
      id: "vase",
      label: "Vase",
      description: "732 triangles · lathed profile",
      sourceNode: "vase_fbx__vasefbx_1__0",
    }),
    object({
      id: "candle",
      label: "Candle",
      description: "852 triangles · candle and carved pedestal",
      sourceNode: "Candle_fbx__candlefbx_1__0",
    }),
    object({
      id: "mushroom",
      label: "Mushroom",
      description: "1,802 triangles · stem and radial cap",
      sourceNode: "SM_Env_Mushroom_Giant_05__smenvmushroomgiant_1__2",
    }),
    object({
      id: "umbrella",
      label: "Umbrella",
      description: "3,840 triangles · radial canopy and handle",
      sourceNode: "Umbrella_fbx__umbrellafbx_1__0",
    }),
  ]),
});

// Fixed reference setup for procedural single-mesh reconstruction experiments.
// Every source mesh is moved to a bottom-center pivot and uniformly normalized
// so its largest bounding-box dimension equals canonicalMaxDimension.
export const LAB_SCENE = {
  canonicalMaxDimension: 7,
  camera: {
    fov: 38,
    near: 0.1,
    far: 180,
    position: [2, 22, 36],
    target: [0, 2.2, 0],
  },
  floor: {
    size: [42, 42],
    color: 0xd8d2c3,
  },
  objects: [
    {
      id: "stone-path",
      label: "Stone Path",
      description: "64 triangles · irregular extrusion",
      sourceNode: "StonePath__stonepath_13__1",
      slot: [-14.25, 0, -7],
    },
    {
      id: "stone",
      label: "Stone",
      description: "212 triangles · displaced low-poly volume",
      sourceNode: "Stone__stone_8__0.003",
      slot: [-4.75, 0, -7],
    },
    {
      id: "bamboo-shoot",
      label: "Bamboo Shoot",
      description: "424 triangles · tapered axial form",
      sourceNode: "Bamboo_shoot_01_FBX__bambooshoot01fbx_1__0",
      slot: [4.75, 0, -7],
    },
    {
      id: "blue-hat",
      label: "Blue Hat",
      description: "704 triangles · crown and radial brim",
      sourceNode: "blue_hat_fbx__bluehatfbx_1__0",
      slot: [14.25, 0, -7],
    },
    {
      id: "vase",
      label: "Vase",
      description: "732 triangles · lathed profile",
      sourceNode: "vase_fbx__vasefbx_1__0",
      slot: [-14.25, 0, 7],
    },
    {
      id: "candle",
      label: "Candle",
      description: "852 triangles · candle and carved pedestal",
      sourceNode: "Candle_fbx__candlefbx_1__0",
      slot: [-4.75, 0, 7],
    },
    {
      id: "mushroom",
      label: "Mushroom",
      description: "1,802 triangles · stem and radial cap",
      sourceNode: "SM_Env_Mushroom_Giant_05__smenvmushroomgiant_1__2",
      slot: [4.75, 0, 7],
    },
    {
      id: "umbrella",
      label: "Umbrella",
      description: "3,840 triangles · radial canopy and handle",
      sourceNode: "Umbrella_fbx__umbrellafbx_1__0",
      slot: [14.25, 0, 7],
    },
  ],
};

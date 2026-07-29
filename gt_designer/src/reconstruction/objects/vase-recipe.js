/**
 * @typedef {object} VaseRecipe
 * @property {string} id
 * @property {string} kind
 * @property {number} seed
 * @property {{outerProfile: readonly (readonly [number, number])[], radialSegments: number, axisTilt: readonly [number, number], wallThickness: number, baseThickness: number, rimThickness: number}} shape
 * @property {{baseColor: number, topColor: number, transitionHeight: number, roughness: number, metalness: number}} appearance
 */

/** @type {Readonly<VaseRecipe>} */
export const VASE_RECIPE = Object.freeze({
  id: "island.decor.vase",
  kind: "hollow-lathed-profile-v1",
  seed: 0x5a5e0001,
  shape: Object.freeze({
    outerProfile: Object.freeze([
      Object.freeze([0.4875, 0]),
      Object.freeze([0.4541, 0.0202]),
      Object.freeze([0.4875, 0.1568]),
      Object.freeze([0.6615, 0.352]),
      Object.freeze([0.933, 0.6643]),
      Object.freeze([1.1533, 1.0416]),
      Object.freeze([1.2269, 1.3344]),
      Object.freeze([1.1866, 1.628]),
      Object.freeze([1.0056, 1.9403]),
      Object.freeze([0.7443, 2.1615]),
      Object.freeze([0.4561, 2.4332]),
      Object.freeze([0.3945, 2.6597]),
      Object.freeze([0.4705, 3.4679]),
      Object.freeze([0.5743, 3.6453]),
      Object.freeze([0.8624, 3.8593]),
      Object.freeze([0.8592, 3.8915]),
    ]),
    radialSegments: 12,
    axisTilt: Object.freeze([0.00946, -0.00125]),
    wallThickness: 0.034,
    baseThickness: 0.276,
    rimThickness: 0.078,
  }),
  appearance: Object.freeze({
    baseColor: 0x951d12,
    topColor: 0xfff4e5,
    transitionHeight: 0.9,
    roughness: 0.8,
    metalness: 0,
  }),
});

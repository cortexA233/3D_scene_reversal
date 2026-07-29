/**
 * @typedef {object} StonePathRecipe
 * @property {string} id
 * @property {string} kind
 * @property {number} seed
 * @property {{footprint: readonly (readonly [number, number])[], basePlane: readonly [number, number, number], extrusion: readonly [number, number, number], hardSideCorners: readonly number[]}} shape
 * @property {{color: number, roughness: number, metalness: number}} appearance
 */

/** @type {Readonly<StonePathRecipe>} */
export const STONE_PATH_RECIPE = Object.freeze({
  id: "island.path.stone-path",
  kind: "shallow-footprint-extrusion-v1",
  seed: 0x5a17e001,
  shape: Object.freeze({
    footprint: Object.freeze([
      Object.freeze([-0.576911926, 2.545286179]),
      Object.freeze([-3.49080658, 2.664556503]),
      Object.freeze([-4.565631866, 1.947961807]),
      Object.freeze([-3.514774323, -0.177858353]),
      Object.freeze([-1.604084015, -1.634878159]),
      Object.freeze([1.978473663, -2.494709015]),
      Object.freeze([3.530937195, -2.661909103]),
      Object.freeze([4.486351013, -0.989759445]),
      Object.freeze([4.558105469, 0.156820297]),
      Object.freeze([3.507247925, 1.852655411]),
    ]),
    basePlane: Object.freeze([
      -0.014371128553539378,
      0.005112762942845987,
      0.06952903150497299,
    ]),
    extrusion: Object.freeze([
      0.007524108900000071,
      0.5262370588,
      -0.002702712999999954,
    ]),
    hardSideCorners: Object.freeze([2, 6, 9]),
  }),
  appearance: Object.freeze({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0,
  }),
});

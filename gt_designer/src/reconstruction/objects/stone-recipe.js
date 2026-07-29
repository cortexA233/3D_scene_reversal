/**
 * @typedef {object} StoneRecipe
 * @property {string} id
 * @property {string} kind
 * @property {number} seed
 * @property {{footprint: readonly (readonly [number, number])[], bottomPlane: readonly [number, number], topPlane: readonly [number, number], topCenter: readonly [number, number], topScale: number, shoulderProgress: number, shoulderScale: number, height: number, deformation: number}} shape
 * @property {{linearGray: number, roughness: number}} appearance
 */

/** @type {Readonly<StoneRecipe>} */
export const STONE_RECIPE = Object.freeze({
  id: "island.nature.stone",
  kind: "seeded-low-poly-volume-v1",
  seed: 0x5700e001,
  shape: Object.freeze({
    footprint: Object.freeze([
      Object.freeze([-7.393371582, 0.267]),
      Object.freeze([-6.889, -3.673]),
      Object.freeze([-2.991, -6.3]),
      Object.freeze([3.767, -8.030036926]),
      Object.freeze([5.14, -6.034]),
      Object.freeze([7.393371582, 2.801]),
      Object.freeze([4.497, 6.033]),
      Object.freeze([-3.305, 8.030036926]),
      Object.freeze([-5.801, 6.989]),
    ]),
    bottomPlane: Object.freeze([
      0.003888225686703514,
      0.005868557804308738,
    ]),
    topPlane: Object.freeze([
      0.016541144857932216,
      0.014699659484297966,
    ]),
    topCenter: Object.freeze([-0.58, -0.34]),
    topScale: 0.7,
    shoulderProgress: 0.78,
    shoulderScale: 0.78,
    height: 7.474605560302734,
    deformation: 0.015,
  }),
  appearance: Object.freeze({
    linearGray: 0.4918658137321472,
    roughness: 0.78,
  }),
});

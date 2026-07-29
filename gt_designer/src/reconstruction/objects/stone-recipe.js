/**
 * @typedef {object} StoneRecipe
 * @property {string} id
 * @property {string} kind
 * @property {number} seed
 * @property {{supportDistances: readonly number[], orientation: readonly [number, number, number], deformation: number}} shape
 * @property {{linearGray: number, roughness: number}} appearance
 */

/** @type {Readonly<StoneRecipe>} */
export const STONE_RECIPE = Object.freeze({
  id: "island.nature.stone",
  kind: "bounded-support-polyhedron-v2",
  seed: 0x5700e002,
  shape: Object.freeze({
    supportDistances: Object.freeze([
      7.393372,
      7.393372,
      7.474606,
      0,
      8.030037,
      8.030037,
      6.290965,
      7.12871,
      6.531625,
      7.634384,
      8.190199,
      7.418739,
      7.15722,
      7.439888,
      8.006101,
      8.243552,
      8.116754,
      8.177689,
      8.124639,
      7.242121,
      6.972414,
      7.51558,
      7.497669,
      8.018415,
    ]),
    orientation: Object.freeze([0, 0, 0]),
    deformation: 0,
  }),
  appearance: Object.freeze({
    linearGray: 0.4918658137321472,
    roughness: 0.78,
  }),
});

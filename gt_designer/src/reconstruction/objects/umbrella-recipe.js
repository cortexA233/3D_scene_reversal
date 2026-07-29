/**
 * @typedef {object} UmbrellaRecipe
 * @property {string} id
 * @property {string} kind
 * @property {number} seed
 * @property {{canopyRadius: number, canopySurfaceRadius: number, canopyDrop: number, rimDrop: number, canopyThickness: number, panels: number, angularSubdivisions: number, radialBands: number, phaseDegrees: number, axis: readonly [number, number, number], shaftLength: number, shaftRadius: number, runnerCenter: number, runnerLength: number, runnerRadius: number, gripCenter: number, gripLength: number, gripRadius: number, ribStart: number, ribLayerOffset: number, supportRadius: number, supportHubHeight: number, supportEndHeight: number}} shape
 * @property {{canopyColor: number, ribColor: number, flowerColor: number, leafColor: number, accentColor: number, blossoms: readonly (readonly [number, number, number])[], leaves: readonly (readonly [number, number, number, number])[], roughness: number, metalness: number}} appearance
 */

/** @type {Readonly<UmbrellaRecipe>} */
export const UMBRELLA_RECIPE = Object.freeze({
  id: "island.prop.umbrella",
  kind: "radial-parasol-assembly-v1",
  seed: 0x0b3e1101,
  shape: Object.freeze({
    canopyRadius: 5.614,
    canopySurfaceRadius: 5.34,
    canopyDrop: 2.18,
    rimDrop: 0.107,
    canopyThickness: 0.053,
    panels: 24,
    angularSubdivisions: 8,
    radialBands: 8,
    phaseDegrees: -7.3233,
    axis: Object.freeze([-0.2231853, 0.6613441, 0.7161092]),
    shaftLength: 9.349,
    shaftRadius: 0.082,
    runnerCenter: -2.555,
    runnerLength: 1.075,
    runnerRadius: 0.294,
    gripCenter: -9.077,
    gripLength: 1.076,
    gripRadius: 0.171,
    ribStart: 0.43,
    ribLayerOffset: 0.122,
    supportRadius: 2.48,
    supportHubHeight: -2.211,
    supportEndHeight: -1.282,
  }),
  appearance: Object.freeze({
    canopyColor: 0xbdbdbd,
    ribColor: 0x686644,
    flowerColor: 0xe5e1d8,
    leafColor: 0x315751,
    accentColor: 0x9e7d50,
    blossoms: Object.freeze([
      Object.freeze([0.3, -1.85, 0.55]),
      Object.freeze([1.05, 0.15, 0.68]),
      Object.freeze([1.55, 0.85, 0.72]),
      Object.freeze([1.85, -0.45, 0.74]),
      Object.freeze([2.27, -2.47, 0.7]),
    ]),
    leaves: Object.freeze([
      Object.freeze([2.2, 1.6, 0.87, 0.35]),
      Object.freeze([2.75, -0.35, 1.12, 0.42]),
      Object.freeze([3.4, 0.25, 1.15, 0.43]),
      Object.freeze([3.45, -2.77, 0.98, 0.38]),
      Object.freeze([3.85, -0.75, 1.12, 0.42]),
      Object.freeze([4.25, -2.43, 1.01, 0.38]),
    ]),
    roughness: 0.8,
    metalness: 0,
  }),
});

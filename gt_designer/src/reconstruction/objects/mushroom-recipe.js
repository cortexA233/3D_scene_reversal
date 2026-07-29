export const MUSHROOM_RECIPE = Object.freeze({
  id: "island.nature.mushroom",
  kind: "curved-stem-bell-cap-cluster-v1",
  seed: 0x6d757368,
  shape: Object.freeze({
    radialSegments: 12,
    stemSegments: 8,
    capHeightRatio: 1.4,
    capProfile: Object.freeze([
      Object.freeze([0, 1]),
      Object.freeze([0.2, 0.98]),
      Object.freeze([0.46, 0.89]),
      Object.freeze([0.73, 0.67]),
      Object.freeze([0.93, 0.36]),
    ]),
    forms: Object.freeze([
      Object.freeze([1.25, 0.13, 1.12, 0.74, 0.84, 0.87, 0.4, 0.7, 7.017, 0.815, 0.983, 0.17]),
      Object.freeze([0.97, 0.25, 1.32, -0.22, 1.25, -0.4, 1.044, -0.383, 6.034, 0.693, 1.033, 0.16]),
      Object.freeze([0.9, 0.36, 0.05, 0.28, -0.52, 0.26, -0.729, 0.215, 5.129, 0.695, 1.062, 0.19]),
      Object.freeze([0.92, 0.37, 0.64, -0.45, 0.42, -0.5, 0.29, -0.538, 4.496, 0.713, 0.977, 0.17]),
      Object.freeze([0.95, -0.03, -0.2, -0.44, -1, -0.78, -1.189, -0.927, 3.04, 0.547, 1.048, 0.19]),
    ]),
  }),
  appearance: Object.freeze({
    stemColor: 0xa6a194,
    capColor: 0x965547,
    roughness: 0.8,
    metalness: 0,
  }),
});

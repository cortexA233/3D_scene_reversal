/**
 * Horizon Profile computation.
 *
 * The elevation angle of geometry as a function of azimuth around a fixed
 * anchor. Binning raw vertices would make the result depend on how finely each
 * subject happens to be tessellated, so every triangle is subdivided until its
 * projected samples are finer than one azimuth bin. A coarse procedural ridge
 * and a dense authored mesh therefore produce comparable profiles, and a real
 * gap in the skyline is a real gap.
 *
 * Shared by the browser-side reference measurement and the Node-side candidate
 * measurement so the two can never drift apart.
 */

export const HORIZON_BINS = 720;
export const MAXIMUM_SUBDIVISION = 24;

export function createProfileAccumulator(anchor, bins = HORIZON_BINS) {
  const profile = new Array(bins).fill(Number.NEGATIVE_INFINITY);
  const binWidth = (Math.PI * 2) / bins;
  let minimumDistance = Infinity;
  let maximumDistance = 0;

  function add(x, y, z) {
    const dx = x - anchor[0];
    const dz = z - anchor[2];
    const ground = Math.hypot(dx, dz);
    if (ground < 1e-6) return;
    if (ground < minimumDistance) minimumDistance = ground;
    if (ground > maximumDistance) maximumDistance = ground;
    const azimuth = Math.atan2(dz, dx);
    const bin =
      (Math.floor(((azimuth + Math.PI * 2) % (Math.PI * 2)) / binWidth) + bins) % bins;
    const elevation = Math.atan2(y - anchor[1], ground);
    if (elevation > profile[bin]) profile[bin] = elevation;
  }

  function azimuthOf(x, z) {
    return Math.atan2(z - anchor[2], x - anchor[0]);
  }

  /** @param {number[]} a @param {number[]} b @param {number[]} c world triangle */
  function addTriangle(a, b, c) {
    const azimuths = [azimuthOf(a[0], a[2]), azimuthOf(b[0], b[2]), azimuthOf(c[0], c[2])];
    let span = 0;
    for (let left = 0; left < 3; left += 1) {
      for (let right = left + 1; right < 3; right += 1) {
        const delta = Math.abs(
          Math.atan2(
            Math.sin(azimuths[left] - azimuths[right]),
            Math.cos(azimuths[left] - azimuths[right]),
          ),
        );
        if (delta > span) span = delta;
      }
    }
    const steps = Math.min(
      MAXIMUM_SUBDIVISION,
      Math.max(1, Math.ceil(span / binWidth) + 1),
    );
    for (let i = 0; i <= steps; i += 1) {
      for (let j = 0; i + j <= steps; j += 1) {
        const u = i / steps;
        const v = j / steps;
        const w = 1 - u - v;
        add(
          a[0] * w + b[0] * u + c[0] * v,
          a[1] * w + b[1] * u + c[1] * v,
          a[2] * w + b[2] * u + c[2] * v,
        );
      }
    }
  }

  return {
    add,
    addTriangle,
    result() {
      return {
        profile: profile.map((value) => (Number.isFinite(value) ? value : null)),
        depthInterval: Number.isFinite(minimumDistance)
          ? [minimumDistance, maximumDistance]
          : null,
      };
    },
  };
}

/**
 * Feeds every world-space triangle of a Three.js object into an accumulator.
 * `transform` maps a local vertex into world space.
 */
export function accumulateMeshTriangles(mesh, accumulator, transform) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return;
  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  const vertex = (offset) => {
    const at = index ? index.getX(offset) : offset;
    return transform([position.getX(at), position.getY(at), position.getZ(at)]);
  };
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = triangle * 3;
    accumulator.addTriangle(vertex(base), vertex(base + 1), vertex(base + 2));
  }
}

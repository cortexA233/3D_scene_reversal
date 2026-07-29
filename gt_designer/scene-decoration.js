// Procedural coastal detail: irregular stones, grass tufts, and low shrubs.
// Density follows broad noise fields, leaving the village center open while
// allowing richer clusters to form naturally near the shore.
import * as THREE from "three";

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x),
  lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function mulberry32(s) {
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function h2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz,
    ux = fx * fx * (3 - 2 * fx),
    uz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz),
    b = h2(ix + 1, iz),
    c = h2(ix, iz + 1),
    d = h2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

// lumpy stone: displace an icosahedron's vertices along their normals by noise
function lumpyStone(detail, rough) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      0.5 +
      0.5 * vnoise(v.x * 2.3 + 11, v.z * 2.3 + 7) +
      0.5 * vnoise(v.y * 3.1 + 3, v.x * 3.1 + 9);
    const s = 1 + (n - 0.75) * rough;
    v.multiplyScalar(s);
    p.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// a small foliage clump (squashed lump of low-poly leaves)
function clumpGeo() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.scale(1, 0.7, 1);
  const p = g.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * 3 + 1, v.z * 3 + 5);
    v.multiplyScalar(0.8 + n * 0.5);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// a few-blade grass tuft
function tuftGeo() {
  const bp = [],
    bi = [];
  const blades = 5;
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * 6.28 + 0.5,
      r = 0.18,
      ox = Math.cos(a) * r,
      oz = Math.sin(a) * r,
      lean = 0.25;
    const base = bp.length / 3;
    bp.push(ox - 0.05, 0, oz, ox + 0.05, 0, oz, ox + lean * 0.4, 1, oz + lean);
    bi.push(base, base + 1, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  g.setIndex(bi);
  g.computeVertexNormals();
  return g;
}

export function naturalDecor(ctx, opts = {}) {
  const { scene, WORLD, islandH, slopeAt } = ctx;
  if (!scene || !WORLD || !islandH) return;
  const C = WORLD.center,
    seaY = WORLD.seaY,
    gY = WORLD.groundY;
  const RX = WORLD.coast[0] * 1.02,
    RZ = WORLD.coast[1] * 1.02;
  const flat = WORLD.flat;
  const flavor = opts.flavor || "standard"; // 'standard' | 'flat'
  const mkMat = (col, rough) =>
    new THREE.MeshStandardMaterial({
      color: col,
      roughness: rough,
      metalness: 0,
      flatShading: flavor === "flat",
    });

  // distance from centre normalised to the flat footprint (1 at footprint edge)
  const coreFade = (x, z) => {
    const dx = (x - C[0]) / flat[0],
      dz = (z - C[1]) / flat[1];
    return smooth(0.35, 0.95, Math.hypot(dx, dz));
  };
  const onLand = (x, z) => {
    const dx = (x - C[0]) / RX,
      dz = (z - C[1]) / RZ;
    return Math.hypot(dx, dz) < 1;
  };

  function scatter({
    geo,
    count,
    seed,
    sizeFn,
    yLo,
    yHi,
    slopeMax,
    colorFn,
    sink,
    useCore,
    yawFlat,
    jitterScale,
    castShadow = true,
  }) {
    const inst = new THREE.InstancedMesh(
      geo,
      mkMat(0xffffff, colorFn ? 0.92 : 0.92),
      count,
    );
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    const rng = mulberry32(seed);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      pos = new THREE.Vector3(),
      scl = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0),
      col = new THREE.Color();
    let n = 0,
      tries = 0,
      maxTries = count * 40;
    while (n < count && tries++ < maxTries) {
      const x = C[0] + (rng() * 2 - 1) * RX,
        z = C[1] + (rng() * 2 - 1) * RZ;
      if (!onLand(x, z)) continue;
      const y = islandH(x, z),
        rel = y - seaY;
      if (rel < yLo || rel > yHi) continue;
      if (slopeAt && slopeAt(x, z) > slopeMax) continue;
      // natural clustering: low-freq noise patches + a coast bias
      const patch = vnoise(
        x * (jitterScale || 0.02) + seed,
        z * (jitterScale || 0.02) + seed * 0.3,
      );
      const core = coreFade(x, z); // 0 in village core → 1 at edge
      let accept = patch * (useCore ? 1 : core);
      if (accept < 0.34 + rng() * 0.4) continue;
      const s = sizeFn(rng());
      const sy = s * (0.78 + rng() * 0.5);
      pos.set(x, y - sink * s, z);
      if (yawFlat) {
        q.setFromAxisAngle(up, rng() * 6.28);
        scl.set(s, sy, s);
      } else {
        q.setFromEuler(
          new THREE.Euler(rng() * 0.5 - 0.25, rng() * 6.28, rng() * 0.5 - 0.25),
        );
        scl.set(s * (0.8 + rng() * 0.5), sy, s * (0.8 + rng() * 0.5));
      }
      m.compose(pos, q, scl);
      inst.setMatrixAt(n, m);
      if (colorFn) {
        inst.setColorAt(n, col.copy(colorFn(rng)));
      }
      n++;
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);
    return n;
  }

  const warmGrey = (rng, sat = 0.1) => {
    const base = 0.42 + rng() * 0.34;
    const c = new THREE.Color().setHSL(0.07 + rng() * 0.06, sat, base);
    return c;
  };
  const mossy = (rng) =>
    new THREE.Color().setHSL(0.22 + rng() * 0.06, 0.3, 0.3 + rng() * 0.12);
  const foliage = (rng) =>
    new THREE.Color().setHSL(
      0.26 + rng() * 0.08,
      0.45 + rng() * 0.2,
      0.3 + rng() * 0.14,
    );

  const boulderGeo = lumpyStone(2, 0.7),
    pebbleGeo = lumpyStone(1, 0.5),
    shrub = clumpGeo(),
    tuft = tuftGeo();

  // big rounded boulders — sparse in the village core, gather on dunes/slopes/shore
  scatter({
    geo: boulderGeo,
    count: opts.boulders ?? 360,
    seed: 1217,
    sizeFn: (r) => 1.0 + Math.pow(r, 1.9) * 4.6,
    yLo: 0.4,
    yHi: 120,
    slopeMax: 0.95,
    colorFn: (r) =>
      r < 0.18 ? mossy(r2(r)) : warmGrey(mulberry32((r * 1e6) | 0)),
    sink: 0.22,
    useCore: false,
    jitterScale: 0.012,
  });
  // medium rocks — fill between boulders
  scatter({
    geo: pebbleGeo,
    count: opts.rocks ?? 900,
    seed: 5531,
    sizeFn: (r) => 0.4 + Math.pow(r, 2.0) * 1.7,
    yLo: 0.2,
    yHi: 110,
    slopeMax: 1.0,
    colorFn: (r) => warmGrey(mulberry32((r * 7e5) | 0), 0.08),
    sink: 0.28,
    useCore: false,
    jitterScale: 0.02,
  });
  // small pebbles — dense, down to the waterline (beaches), allowed in the core too
  scatter({
    geo: pebbleGeo,
    count: opts.pebbles ?? 4200,
    seed: 77,
    sizeFn: (r) => 0.14 + Math.pow(r, 2.3) * 0.7,
    yLo: -0.8,
    yHi: 60,
    slopeMax: 1.1,
    colorFn: (r) => warmGrey(mulberry32((r * 3e5) | 0), 0.06),
    sink: 0.3,
    useCore: true,
    jitterScale: 0.05,
  });
  // low shrubs / foliage clumps — meadow + dunes, off the village core
  scatter({
    geo: shrub,
    count: opts.shrubs ?? 520,
    seed: 909,
    sizeFn: (r) => 1.2 + Math.pow(r, 1.6) * 3.0,
    yLo: 1.4,
    yHi: 90,
    slopeMax: 0.55,
    colorFn: (r) => foliage(mulberry32((r * 9e5) | 0)),
    sink: 0.12,
    useCore: false,
    jitterScale: 0.018,
  });
  // grass tufts — irregular clumps over the green land (complements the blade carpet)
  if (opts.tufts !== false)
    scatter({
      geo: tuft,
      count: opts.tufts ?? 5000,
      seed: 333,
      sizeFn: (r) => 1.4 + r * 2.2,
      yLo: 1.0,
      yHi: 55,
      slopeMax: 0.5,
      colorFn: (r) => foliage(mulberry32((r * 5e5) | 0)),
      sink: 0.02,
      useCore: true,
      yawFlat: true,
      jitterScale: 0.04,
      castShadow: false,
    });
}
function r2(r) {
  return mulberry32((r * 123457) | 0);
}

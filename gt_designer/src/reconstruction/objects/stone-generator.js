import * as THREE from "three";

function planeHeight(plane, x, z, elevation) {
  return plane[0] * x + plane[1] * z + elevation;
}

/**
 * @param {import("./stone-recipe.js").StoneRecipe} recipe
 * @param {import("../core/object-generator.js").SeededRng} rng
 */
export function generateStone(recipe, rng) {
  const shape = recipe.shape;
  const rings = [0, shape.shoulderProgress, 1].map((progress) => {
    const scale =
      progress === 0
        ? 1
        : progress === 1
          ? shape.topScale
          : shape.shoulderScale;
    return shape.footprint.map(([baseX, baseZ]) => {
      const seededScale =
        1 + (rng.nextFloat() * 2 - 1) * shape.deformation * progress;
      const x =
        baseX * scale * seededScale + shape.topCenter[0] * progress;
      const z =
        baseZ * scale * seededScale + shape.topCenter[1] * progress;
      const bottomY = planeHeight(shape.bottomPlane, x, z, 0);
      const topY = planeHeight(shape.topPlane, x, z, 1);
      return new THREE.Vector3(
        x,
        THREE.MathUtils.lerp(bottomY, topY, progress),
        z,
      );
    });
  });
  const positions = rings.flatMap((ring) => ring.flatMap((point) => point.toArray()));
  const indices = [];
  const segments = shape.footprint.length;
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const lower = ring * segments;
      const upper = (ring + 1) * segments;
      indices.push(
        lower + segment,
        upper + segment,
        lower + next,
        upper + segment,
        upper + next,
        lower + next,
      );
    }
  }

  const addCap = (ringIndex, reverse) => {
    const ring = rings[ringIndex];
    const center = ring
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .multiplyScalar(1 / ring.length);
    const centerIndex = positions.length / 3;
    positions.push(...center);
    const offset = positions.length / 3;
    for (const point of ring) positions.push(...point);
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      if (reverse) indices.push(centerIndex, offset + next, offset + segment);
      else indices.push(centerIndex, offset + segment, offset + next);
    }
  };
  addCap(0, true);
  addCap(rings.length - 1, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const generatedSize = bounds.getSize(new THREE.Vector3());
  const bottomCenter = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    bounds.min.y,
    (bounds.min.z + bounds.max.z) * 0.5,
  );
  const targetWidth =
    Math.max(...shape.footprint.map((entry) => entry[0])) -
    Math.min(...shape.footprint.map((entry) => entry[0]));
  const targetDepth =
    Math.max(...shape.footprint.map((entry) => entry[1])) -
    Math.min(...shape.footprint.map((entry) => entry[1]));
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).sub(bottomCenter);
    point.set(
      (point.x / generatedSize.x) * targetWidth,
      (point.y / generatedSize.y) * shape.height,
      (point.z / generatedSize.z) * targetDepth,
    );
    position.setXYZ(index, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const color = new THREE.Color().setRGB(
    recipe.appearance.linearGray,
    recipe.appearance.linearGray,
    recipe.appearance.linearGray,
  );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: recipe.appearance.roughness,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "Stone";
  mesh.userData.semanticId = recipe.id;
  mesh.userData.generatorKind = recipe.kind;
  mesh.userData.recipeSeed = recipe.seed;
  mesh.updateMatrixWorld(true);
  return mesh;
}

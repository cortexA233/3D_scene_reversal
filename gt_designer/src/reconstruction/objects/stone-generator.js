import * as THREE from "three";

export const STONE_SUPPORT_DIRECTION_COUNT = 24;

export function canonicalSupportDirections() {
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const phase = -Math.PI / (2 * 3);
  for (let index = 0; index < 4; index += 1) {
    const angle = phase + index * Math.PI / 2;
    for (const azimuth of [angle, angle + Math.PI / 4]) {
      directions.push(new THREE.Vector3(
        Math.cos(azimuth),
        0.5,
        Math.sin(azimuth),
      ).normalize());
    }
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = phase + index * Math.PI / 2;
    for (const azimuth of [angle, angle + Math.PI / 4]) {
      directions.push(new THREE.Vector3(
        Math.cos(azimuth),
        3,
        Math.sin(azimuth),
      ).normalize());
    }
  }
  for (const azimuth of [phase, phase + Math.PI]) {
    directions.push(
      new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)),
    );
  }
  if (directions.length !== STONE_SUPPORT_DIRECTION_COUNT) {
    throw new RangeError("stone canonical support count is incomplete");
  }
  return directions;
}

function supportPlanes(recipe, rng) {
  const rotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...recipe.shape.orientation),
  );
  if (
    recipe.shape.supportDistances.length !== STONE_SUPPORT_DIRECTION_COUNT
  ) {
    throw new RangeError("stone support distance count is incomplete");
  }
  return canonicalSupportDirections()
    .map((normal, index) => ({
    normal: normal.applyQuaternion(rotation),
    distance: recipe.shape.supportDistances[index] * (
      1 + (rng.nextFloat() * 2 - 1) * recipe.shape.deformation
    ),
    }));
}

function intersection(first, second, third) {
  const secondCrossThird = new THREE.Vector3().crossVectors(
    second.normal,
    third.normal,
  );
  const denominator = first.normal.dot(secondCrossThird);
  if (Math.abs(denominator) <= Number.EPSILON) return null;
  return secondCrossThird
    .multiplyScalar(first.distance)
    .add(
      new THREE.Vector3()
        .crossVectors(third.normal, first.normal)
        .multiplyScalar(second.distance),
    )
    .add(
      new THREE.Vector3()
        .crossVectors(first.normal, second.normal)
        .multiplyScalar(third.distance),
    )
    .multiplyScalar(1 / denominator);
}

function polyhedronVertices(planes) {
  const vertices = [];
  const tolerance = Math.sqrt(Number.EPSILON);
  for (let first = 0; first < planes.length - 2; first += 1) {
    for (let second = first + 1; second < planes.length - 1; second += 1) {
      for (let third = second + 1; third < planes.length; third += 1) {
        const point = intersection(
          planes[first],
          planes[second],
          planes[third],
        );
        if (!point) continue;
        const inside = planes.every(
          (plane) => plane.normal.dot(point) <= plane.distance + tolerance,
        );
        const duplicate = vertices.some(
          (vertex) => vertex.distanceToSquared(point) < tolerance * tolerance,
        );
        if (inside && !duplicate) vertices.push(point);
      }
    }
  }
  return vertices;
}

function triangulatePlanes(planes, vertices) {
  const indices = [];
  const tolerance = Math.sqrt(Number.EPSILON);
  for (const plane of planes) {
    const face = vertices
      .map((point, index) => ({ point, index }))
      .filter(
        ({ point }) =>
          Math.abs(plane.normal.dot(point) - plane.distance) < tolerance,
      );
    if (face.length < 3) continue;
    const center = face
      .reduce((sum, entry) => sum.add(entry.point), new THREE.Vector3())
      .multiplyScalar(1 / face.length);
    const guide = Math.abs(plane.normal.y) > 0.5
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3()
      .crossVectors(guide, plane.normal)
      .normalize();
    const bitangent = new THREE.Vector3()
      .crossVectors(plane.normal, tangent)
      .normalize();
    face.sort((left, right) => {
      const leftOffset = left.point.clone().sub(center);
      const rightOffset = right.point.clone().sub(center);
      return Math.atan2(
        leftOffset.dot(bitangent),
        leftOffset.dot(tangent),
      ) - Math.atan2(
        rightOffset.dot(bitangent),
        rightOffset.dot(tangent),
      );
    });
    for (let index = 1; index < face.length - 1; index += 1) {
      indices.push(face[0].index, face[index].index, face[index + 1].index);
    }
  }
  return indices;
}

/**
 * Intersect one fixed canonical set of support planes. The recipe stores only
 * their distances plus a whole-form orientation and bounded seeded variation.
 *
 * @param {import("./stone-recipe.js").StoneRecipe} recipe
 * @param {import("../core/object-generator.js").SeededRng} rng
 */
export function generateStone(recipe, rng) {
  const planes = supportPlanes(recipe, rng);
  const vertices = polyhedronVertices(planes);
  const indices = triangulatePlanes(planes, vertices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      vertices.flatMap((point) => point.toArray()),
      3,
    ),
  );
  geometry.setIndex(indices);
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

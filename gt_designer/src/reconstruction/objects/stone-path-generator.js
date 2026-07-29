import * as THREE from "three";

/**
 * Build one closed shallow extrusion directly from its semantic outline.
 *
 * @param {import("./stone-path-recipe.js").StonePathRecipe} recipe
 */
export function generateStonePath(recipe) {
  const { footprint, basePlane, extrusion, hardSideCorners } = recipe.shape;
  if (footprint.length < 3) {
    throw new RangeError("stone path footprint needs at least three points");
  }

  const base = footprint.map(([x, z]) =>
    new THREE.Vector3(x, basePlane[0] * x + basePlane[1] * z + basePlane[2], z),
  );
  const top = base.map((point) =>
    point.clone().add(new THREE.Vector3().fromArray(extrusion)),
  );
  const faces = THREE.ShapeUtils.triangulateShape(
    footprint.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  const positions = [];
  const normals = [];

  const triangle = (first, second, third, firstNormal, secondNormal, thirdNormal) => {
    positions.push(...first, ...second, ...third);
    normals.push(...firstNormal, ...secondNormal, ...thirdNormal);
  };
  const faceNormal = (first, second, third) =>
    new THREE.Vector3()
      .subVectors(second, first)
      .cross(new THREE.Vector3().subVectors(third, first))
      .normalize();
  for (const [a, b, c] of faces) {
    const topNormal = faceNormal(top[c], top[b], top[a]);
    const baseNormal = faceNormal(base[a], base[b], base[c]);
    triangle(top[c], top[b], top[a], topNormal, topNormal, topNormal);
    triangle(base[a], base[b], base[c], baseNormal, baseNormal, baseNormal);
  }
  const sideNormals = footprint.map((_, index) => {
    const next = (index + 1) % footprint.length;
    return faceNormal(base[index], top[index], base[next]);
  });
  const hardCorners = new Set(hardSideCorners);
  const cornerNormal = (corner, edge) => {
    if (hardCorners.has(corner)) return sideNormals[edge];
    const previous = (corner - 1 + footprint.length) % footprint.length;
    return sideNormals[previous].clone().add(sideNormals[corner]).normalize();
  };
  for (let index = 0; index < footprint.length; index += 1) {
    const next = (index + 1) % footprint.length;
    const startNormal = cornerNormal(index, index);
    const endNormal = cornerNormal(next, index);
    triangle(
      base[index],
      top[index],
      base[next],
      startNormal,
      startNormal,
      endNormal,
    );
    triangle(
      top[index],
      top[next],
      base[next],
      startNormal,
      endNormal,
      endNormal,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: recipe.appearance.color,
      roughness: recipe.appearance.roughness,
      metalness: recipe.appearance.metalness,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "Stone Path";
  mesh.userData.semanticId = recipe.id;
  mesh.userData.generatorKind = recipe.kind;
  mesh.userData.recipeSeed = recipe.seed;
  mesh.updateMatrixWorld(true);
  return mesh;
}

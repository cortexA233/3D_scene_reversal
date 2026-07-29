import * as THREE from "three";

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function insetProfile(outer, shape) {
  return outer.map((point, index) => {
    const previous = outer[Math.max(0, index - 1)];
    const next = outer[Math.min(outer.length - 1, index + 1)];
    const tangentRadius = next.x - previous.x;
    const tangentHeight = next.y - previous.y;
    const length = Math.hypot(tangentRadius, tangentHeight) || 1;
    const thickness = index < 2
      ? shape.baseThickness
      : index >= outer.length - 2
        ? shape.rimThickness
        : shape.wallThickness;
    return new THREE.Vector2(
      Math.max(0.01, point.x - (tangentHeight / length) * thickness),
      Math.max(0, point.y + (tangentRadius / length) * thickness),
    );
  });
}

function addProceduralColors(geometry, recipe, height, profileLength, outerCount) {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(recipe.appearance.baseColor);
  const top = new THREE.Color(recipe.appearance.topColor);
  const innerBase = base.clone().lerp(top, 0.15);
  const innerTop = top.clone().lerp(new THREE.Color(), 0.5);
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const progress = THREE.MathUtils.clamp(position.getY(index) / height, 0, 1);
    const profileIndex = Math.round(uv.getY(index) * (profileLength - 1));
    const innerWall = profileIndex >= outerCount &&
      profileIndex < outerCount * 2;
    const transition = innerWall
      ? THREE.MathUtils.clamp((progress - 0.72) / 0.28, 0, 1)
      : THREE.MathUtils.clamp(
          progress / recipe.appearance.transitionHeight,
          0,
          1,
        );
    color
      .copy(innerWall ? innerBase : base)
      .lerp(innerWall ? innerTop : top, smoothstep(transition));
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * Build a closed ceramic shell from one editable outer axial profile. The
 * inner wall is a compact normal offset, rather than retained source samples.
 *
 * @param {import("./vase-recipe.js").VaseRecipe} recipe
 */
export function generateVase(recipe) {
  const outer = recipe.shape.outerProfile.map(
    ([radius, height]) => new THREE.Vector2(radius, height),
  );
  if (outer.length < 4) throw new RangeError("vase profile is incomplete");
  const inner = insetProfile(outer, recipe.shape).reverse();
  const profile = [...outer, ...inner, outer[0].clone()];
  const geometry = new THREE.LatheGeometry(
    profile,
    recipe.shape.radialSegments,
  );
  addProceduralColors(
    geometry,
    recipe,
    outer.at(-1).y,
    profile.length,
    outer.length,
  );

  const axis = new THREE.Vector3(
    recipe.shape.axisTilt[0],
    1,
    recipe.shape.axisTilt[1],
  ).normalize();
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis),
  );
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  geometry.translate(
    -(bounds.min.x + bounds.max.x) * 0.5,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) * 0.5,
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: recipe.appearance.roughness,
      metalness: recipe.appearance.metalness,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "Vase";
  mesh.userData.semanticId = recipe.id;
  mesh.userData.generatorKind = recipe.kind;
  mesh.userData.recipeSeed = recipe.seed;
  mesh.updateMatrixWorld(true);
  return mesh;
}

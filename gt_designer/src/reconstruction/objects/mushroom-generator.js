import * as THREE from "three";

import { semanticPartId } from "../core/object-generator.js";

function mergeGeometries(geometries) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const geometry of geometries) {
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const offset = positions.length / 3;
    positions.push(...geometry.getAttribute("position").array);
    normals.push(...geometry.getAttribute("normal").array);
    const sourceIndices = geometry.index
      ? geometry.index.array
      : Array.from(
          { length: geometry.getAttribute("position").count },
          (_, index) => index,
        );
    for (const index of sourceIndices) indices.push(offset + index);
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

function formPoints(recipe, form) {
  const [
    baseX, baseZ, firstX, firstZ, secondX, secondZ, topX, topZ,
    height, radius, , stemRadius,
  ] = form;
  const capHeight = radius * recipe.shape.capHeightRatio;
  const stemTop = height - capHeight;
  return [
    new THREE.Vector3(baseX, stemRadius, baseZ),
    new THREE.Vector3(firstX, stemTop / 3, firstZ),
    new THREE.Vector3(secondX, stemTop * 2 / 3, secondZ),
    new THREE.Vector3(topX, stemTop, topZ),
  ];
}

function makeStemGeometry(recipe, form) {
  const [, , , , , , , , , , , stemRadius] = form;
  const curve = new THREE.CatmullRomCurve3(formPoints(recipe, form));
  return new THREE.TubeGeometry(
    curve,
    recipe.shape.stemSegments,
    stemRadius,
    recipe.shape.radialSegments,
    false,
  );
}

function makeCapGeometry(recipe, form) {
  const [, , , , , , topX, topZ, height, radius, depthScale] = form;
  const capHeight = radius * recipe.shape.capHeightRatio;
  const positions = [];
  const indices = [];
  const { radialSegments, capProfile } = recipe.shape;
  for (const [progress, width] of capProfile) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      positions.push(
        topX + Math.cos(angle) * radius * width,
        height - capHeight + progress * capHeight,
        topZ + Math.sin(angle) * radius * width * depthScale,
      );
    }
  }
  for (let ring = 0; ring < capProfile.length - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const lower = ring * radialSegments;
      const upper = lower + radialSegments;
      indices.push(
        lower + segment, lower + next, upper + segment,
        upper + segment, lower + next, upper + next,
      );
    }
  }
  const underside = positions.length / 3;
  positions.push(topX, height - capHeight, topZ);
  const apex = positions.length / 3;
  positions.push(topX, height, topZ);
  const topRing = (capProfile.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(underside, next, segment);
    indices.push(apex, topRing + segment, topRing + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function material(color, recipe) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: recipe.appearance.roughness,
    metalness: recipe.appearance.metalness,
  });
}

export function generateMushroom(recipe) {
  const root = new THREE.Group();
  root.name = "Mushroom";
  root.userData.semanticId = recipe.id;
  root.userData.generatorKind = recipe.kind;
  root.userData.recipeSeed = recipe.seed;
  const stems = new THREE.Mesh(
    mergeGeometries(recipe.shape.forms.map((form) => makeStemGeometry(recipe, form))),
    material(recipe.appearance.stemColor, recipe),
  );
  stems.name = "Curved Stem Cluster";
  stems.userData.semanticId = semanticPartId(recipe.id, "stems");
  const caps = new THREE.Mesh(
    mergeGeometries(recipe.shape.forms.map((form) => makeCapGeometry(recipe, form))),
    material(recipe.appearance.capColor, recipe),
  );
  caps.name = "Bell Cap Cluster";
  caps.userData.semanticId = semanticPartId(recipe.id, "caps");
  root.add(stems, caps);
  recipe.shape.forms.forEach((form, index) => {
    const semantic = new THREE.Object3D();
    semantic.name = `Mushroom ${index + 1}`;
    semantic.userData.semanticId = semanticPartId(recipe.id, `form-${index + 1}`);
    semantic.position.copy(formPoints(recipe, form).at(-1));
    root.add(semantic);
  });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  root.position.y -= bounds.min.y;
  root.updateMatrixWorld(true);
  return root;
}

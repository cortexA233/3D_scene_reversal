import * as THREE from "three";

import { semanticPartId } from "../core/object-generator.js";

function frame(recipe) {
  const axis = new THREE.Vector3(
    recipe.shape.axisLean[0],
    1,
    recipe.shape.axisLean[1],
  ).normalize();
  const radialX = new THREE.Vector3(1, 0, 0)
    .sub(axis.clone().multiplyScalar(axis.x))
    .normalize();
  const radialZ = new THREE.Vector3().crossVectors(axis, radialX).normalize();
  const origin = new THREE.Vector3(
    recipe.shape.baseOffset[0],
    0,
    recipe.shape.baseOffset[1],
  );
  return { axis, radialX, radialZ, origin };
}

function pointAt(frameValue, radius, height, angle) {
  return frameValue.origin.clone()
    .addScaledVector(frameValue.axis, height)
    .addScaledVector(frameValue.radialX, Math.cos(angle) * radius)
    .addScaledVector(frameValue.radialZ, Math.sin(angle) * radius);
}

function makePedestalGeometry(recipe) {
  const profile = recipe.shape.pedestalProfile;
  const radialSegments = recipe.shape.radialSegments;
  const frameValue = frame(recipe);
  const positions = [];
  const indices = [];
  for (const [radius, height] of profile) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      positions.push(...pointAt(frameValue, radius, height, angle).toArray());
    }
  }
  for (let ring = 0; ring < profile.length; ring += 1) {
    const nextRing = (ring + 1) % profile.length;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const lower = ring * radialSegments;
      const upper = nextRing * radialSegments;
      indices.push(
        lower + segment, upper + segment, lower + next,
        lower + next, upper + segment, upper + next,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function waxTop(recipe, segment) {
  const [, maximum, , amplitude, phase] = recipe.shape.wax;
  const angle = segment / recipe.shape.radialSegments * Math.PI * 2;
  return maximum - amplitude * (
    Math.sin(angle * 2 + phase) * 0.5 + 0.5
  );
}

function makeWaxGeometry(recipe) {
  const [minimum, maximum, radius] = recipe.shape.wax;
  const radialSegments = recipe.shape.radialSegments;
  const frameValue = frame(recipe);
  const heights = [minimum, minimum + 0.084, maximum - 0.17];
  const positions = [];
  const indices = [];
  for (const height of heights) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      positions.push(...pointAt(
        frameValue,
        radius,
        height,
        segment / radialSegments * Math.PI * 2,
      ).toArray());
    }
  }
  const topOffset = positions.length / 3;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    positions.push(...pointAt(
      frameValue,
      radius,
      waxTop(recipe, segment),
      segment / radialSegments * Math.PI * 2,
    ).toArray());
  }
  const bottomCenter = positions.length / 3;
  positions.push(...pointAt(frameValue, 0, minimum, 0).toArray());
  const topCenter = positions.length / 3;
  positions.push(...pointAt(frameValue, 0, maximum - 0.01, 0).toArray());
  for (let ring = 0; ring < heights.length; ring += 1) {
    const lower = ring * radialSegments;
    const upper = ring === heights.length - 1
      ? topOffset
      : (ring + 1) * radialSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      indices.push(
        lower + segment, upper + segment, lower + next,
        lower + next, upper + segment, upper + next,
      );
    }
  }
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(bottomCenter, next, segment);
    indices.push(topCenter, topOffset + segment, topOffset + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function stonePatternSource(recipe) {
  const [xFrequency, zFrequency, yFrequency] = recipe.appearance.grainFrequency;
  const [darkThreshold, lightThreshold] = recipe.appearance.grainThresholds;
  return `
    float stoneHash(vec3 cell) {
      return fract(sin(dot(cell, vec3(2.0, 3.0, 4.0))) * ${recipe.seed}.0);
    }

    float stoneNoise(vec3 point) {
      vec3 cell = floor(point);
      vec3 local = fract(point);
      vec3 blend = local * local * (3.0 - 2.0 * local);
      float lowerNear = mix(
        stoneHash(cell),
        stoneHash(cell + vec3(1.0, 0.0, 0.0)),
        blend.x
      );
      float lowerFar = mix(
        stoneHash(cell + vec3(0.0, 0.0, 1.0)),
        stoneHash(cell + vec3(1.0, 0.0, 1.0)),
        blend.x
      );
      float upperNear = mix(
        stoneHash(cell + vec3(0.0, 1.0, 0.0)),
        stoneHash(cell + vec3(1.0, 1.0, 0.0)),
        blend.x
      );
      float upperFar = mix(
        stoneHash(cell + vec3(0.0, 1.0, 1.0)),
        stoneHash(cell + vec3(1.0, 1.0, 1.0)),
        blend.x
      );
      float lower = mix(lowerNear, lowerFar, blend.z);
      float upper = mix(upperNear, upperFar, blend.z);
      return mix(lower, upper, blend.y);
    }

    vec3 stoneColor(vec3 point) {
      vec3 scaledPoint = point * vec3(
        ${xFrequency}.0,
        ${yFrequency}.0,
        ${zFrequency}.0
      );
      float broadGrain = stoneNoise(scaledPoint);
      float detailGrain = stoneNoise(
        scaledPoint * 2.0 + vec3(1.0, 2.0, 3.0)
      );
      float grain = mix(
        broadGrain,
        detailGrain,
        ${recipe.appearance.grainDetailWeight}
      );
      float filterWidth = max(fwidth(grain) * 0.5, 0.0001);
      float middleCoverage = smoothstep(
        ${darkThreshold} - filterWidth,
        ${darkThreshold} + filterWidth,
        grain
      );
      float lightCoverage = smoothstep(
        ${lightThreshold} - filterWidth,
        ${lightThreshold} + filterWidth,
        grain
      );
      vec3 color = mix(stoneDark, stoneMid, middleCoverage);
      return mix(color, stoneLight, lightCoverage);
    }
  `;
}

function stoneUniforms(recipe) {
  return {
    stoneDark: { value: new THREE.Color(recipe.appearance.stoneDark) },
    stoneMid: { value: new THREE.Color(recipe.appearance.stoneMid) },
    stoneLight: { value: new THREE.Color(recipe.appearance.stoneLight) },
  };
}

function makeStoneAlbedoMaterial(recipe) {
  return new THREE.ShaderMaterial({
    uniforms: stoneUniforms(recipe),
    vertexShader: `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 stoneDark;uniform vec3 stoneMid;uniform vec3 stoneLight;varying vec3 vLocal;${stonePatternSource(recipe)}void main(){gl_FragColor=vec4(stoneColor(vLocal),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    side: THREE.DoubleSide,
  });
}

function makeStoneMaterial(recipe) {
  const material = new THREE.MeshStandardMaterial({
    roughness: recipe.appearance.roughness,
    metalness: recipe.appearance.metalness,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, stoneUniforms(recipe));
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal=position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 stoneDark;uniform vec3 stoneMid;uniform vec3 stoneLight;varying vec3 vLocal;${stonePatternSource(recipe)}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb=stoneColor(vLocal);");
  };
  material.customProgramCacheKey = () => recipe.kind;
  material.userData.createAlbedoMaterial = () => makeStoneAlbedoMaterial(recipe);
  return material;
}

function standardMaterial(color, recipe) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: recipe.appearance.roughness,
    metalness: recipe.appearance.metalness,
  });
}

export function generateCandle(recipe) {
  const root = new THREE.Group();
  root.name = "Candle and Carved Pedestal";
  root.userData.semanticId = recipe.id;
  root.userData.generatorKind = recipe.kind;
  root.userData.recipeSeed = recipe.seed;

  const pedestal = new THREE.Mesh(makePedestalGeometry(recipe), makeStoneMaterial(recipe));
  pedestal.name = "Carved Pedestal";
  pedestal.userData.semanticId = semanticPartId(recipe.id, "pedestal");
  const wax = new THREE.Mesh(
    makeWaxGeometry(recipe),
    standardMaterial(recipe.appearance.waxColor, recipe),
  );
  wax.name = "Wax Pillar";
  wax.userData.semanticId = semanticPartId(recipe.id, "wax");
  const wickCurve = new THREE.CatmullRomCurve3(
    recipe.shape.wick.points.map((point) => new THREE.Vector3(...point)),
  );
  const wick = new THREE.Mesh(
    new THREE.TubeGeometry(
      wickCurve,
      recipe.shape.wick.tubularSegments,
      recipe.shape.wick.radius,
      recipe.shape.wick.radialSegments,
      false,
    ),
    standardMaterial(recipe.appearance.wickColor, recipe),
  );
  wick.name = "Wick";
  wick.userData.semanticId = semanticPartId(recipe.id, "wick");
  root.add(pedestal, wax, wick);

  root.updateMatrixWorld(true);
  const correction = -new THREE.Box3().setFromObject(root).min.y;
  for (const mesh of [pedestal, wax, wick]) mesh.geometry.translate(0, correction, 0);
  root.updateMatrixWorld(true);
  return root;
}

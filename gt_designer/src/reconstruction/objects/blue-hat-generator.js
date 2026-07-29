import * as THREE from "three";

import { semanticPartId } from "../core/object-generator.js";

function axisQuaternion(recipe) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(
      recipe.shape.axisLean[0],
      1,
      recipe.shape.axisLean[1],
    ).normalize(),
  );
}

function axisCenter(recipe, y) {
  return new THREE.Vector3(0, y, 0).applyQuaternion(axisQuaternion(recipe));
}

function makeMainGeometry(recipe) {
  const { profile, radialSegments } = recipe.shape;
  const positions = [];
  const indices = [];
  const ringOffsets = [];
  const axisRotation = axisQuaternion(recipe);
  for (const [radius, y] of profile) {
    ringOffsets.push(positions.length / 3);
    if (radius === 0) {
      positions.push(...new THREE.Vector3(0, y, 0).applyQuaternion(axisRotation).toArray());
      continue;
    }
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      positions.push(...new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      ).applyQuaternion(axisRotation).toArray());
    }
  }
  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    const lowerRadius = profile[profileIndex][0];
    const upperRadius = profile[profileIndex + 1][0];
    const lowerOffset = ringOffsets[profileIndex];
    const upperOffset = ringOffsets[profileIndex + 1];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      if (lowerRadius === 0) {
        indices.push(lowerOffset, upperOffset + segment, upperOffset + next);
      } else if (upperRadius === 0) {
        indices.push(lowerOffset + segment, upperOffset, lowerOffset + next);
      } else {
        indices.push(
          lowerOffset + segment, upperOffset + segment, lowerOffset + next,
          lowerOffset + next, upperOffset + segment, upperOffset + next,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function patternSource(recipe) {
  const appearance = recipe.appearance;
  return `
    vec3 hatColor(vec3 point) {
      if (point.y < ${appearance.brimTop}) return brimColor;
      float angle = atan(point.z, point.x);
      float panel = mod(floor((angle + ${appearance.phase}) * ${appearance.panelCount}.0 / ${appearance.tau}), 2.0);
      vec3 base = mix(darkPanelColor, lightPanelColor, panel);
      float motif = sin(angle * ${appearance.motifFrequency[0]}.0 + point.y * ${appearance.motifFrequency[1]}.0) * 0.5 + 0.5;
      float ink = step(${appearance.motifThreshold}, motif);
      return mix(base, mix(base, lightPanelColor, ${appearance.motifBlend}), ink);
    }
  `;
}

function uniforms(recipe) {
  return {
    brimColor: { value: new THREE.Color(recipe.appearance.brimColor) },
    darkPanelColor: { value: new THREE.Color(recipe.appearance.darkPanelColor) },
    lightPanelColor: { value: new THREE.Color(recipe.appearance.lightPanelColor) },
  };
}

function makeAlbedoMaterial(recipe) {
  return new THREE.ShaderMaterial({
    uniforms: uniforms(recipe),
    vertexShader: `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 brimColor;uniform vec3 darkPanelColor;uniform vec3 lightPanelColor;varying vec3 vLocal;${patternSource(recipe)}void main(){gl_FragColor=vec4(hatColor(vLocal),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    side: THREE.DoubleSide,
  });
}

function makeMainMaterial(recipe) {
  const material = new THREE.MeshStandardMaterial({
    roughness: recipe.appearance.roughness,
    metalness: recipe.appearance.metalness,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms(recipe));
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal=position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 brimColor;uniform vec3 darkPanelColor;uniform vec3 lightPanelColor;varying vec3 vLocal;${patternSource(recipe)}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb=hatColor(vLocal);");
  };
  material.customProgramCacheKey = () => recipe.kind;
  material.userData.createAlbedoMaterial = () => makeAlbedoMaterial(recipe);
  return material;
}

function makeButton(recipe) {
  const [centerY, radius, verticalRadius, widthSegments, heightSegments] = recipe.shape.button;
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  geometry.scale(1, verticalRadius / radius, 1);
  const center = axisCenter(recipe, centerY);
  geometry.applyQuaternion(axisQuaternion(recipe));
  geometry.translate(center.x, center.y, center.z);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: recipe.appearance.darkPanelColor,
      roughness: recipe.appearance.roughness,
      metalness: recipe.appearance.metalness,
    }),
  );
}

export function generateBlueHat(recipe) {
  const root = new THREE.Group();
  root.name = "Blue Hat";
  root.userData.semanticId = recipe.id;
  root.userData.generatorKind = recipe.kind;
  root.userData.recipeSeed = recipe.seed;
  const shell = new THREE.Mesh(makeMainGeometry(recipe), makeMainMaterial(recipe));
  shell.name = "Panel Shell and Brim";
  shell.userData.semanticId = semanticPartId(recipe.id, "shell");
  const button = makeButton(recipe);
  button.name = "Top Button";
  button.userData.semanticId = semanticPartId(recipe.id, "button");
  root.add(shell, button);
  for (const part of ["brim", "panels", "motifs"]) {
    const semantic = new THREE.Object3D();
    semantic.userData.semanticId = semanticPartId(recipe.id, part);
    shell.add(semantic);
  }
  root.updateMatrixWorld(true);
  return root;
}

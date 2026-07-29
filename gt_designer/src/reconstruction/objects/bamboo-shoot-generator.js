import * as THREE from "three";

import { semanticPartId } from "../core/object-generator.js";

function ringCenter(ring) {
  return new THREE.Vector3(ring[0], ring[1], ring[2]);
}

function sampleCore(recipe, progress) {
  const rings = recipe.shape.coreRings;
  const targetY = rings.at(-1)[1] * progress;
  let upper = rings.findIndex((ring) => ring[1] >= targetY);
  if (upper < 1) upper = 1;
  const lowerRing = rings[upper - 1];
  const upperRing = rings[upper];
  const amount = (targetY - lowerRing[1]) / (upperRing[1] - lowerRing[1]);
  return {
    center: ringCenter(lowerRing).lerp(ringCenter(upperRing), amount),
    radius: THREE.MathUtils.lerp(lowerRing[3], upperRing[3], amount),
  };
}

function makeCoreGeometry(recipe) {
  const { radialSegments, coreRings, phase } = recipe.shape;
  const positions = [];
  const indices = [];
  for (let ring = 0; ring < coreRings.length; ring += 1) {
    const center = ringCenter(coreRings[ring]);
    const radius = coreRings[ring][3];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = phase + segment / radialSegments * Math.PI * 2;
      positions.push(
        center.x + Math.cos(angle) * radius,
        center.y,
        center.z + Math.sin(angle) * radius,
      );
    }
  }
  for (let ring = 0; ring < coreRings.length - 1; ring += 1) {
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
  const bottomCenterIndex = positions.length / 3;
  positions.push(...ringCenter(coreRings[0]).toArray());
  const topCenterIndex = positions.length / 3;
  positions.push(...ringCenter(coreRings.at(-1)).toArray());
  const topRing = (coreRings.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(bottomCenterIndex, next, segment);
    indices.push(topCenterIndex, topRing + segment, topRing + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function bladeGeometry(
  recipe,
  height,
  angle,
  baseFactor,
  length,
  rise,
  extensionAngle = angle,
) {
  const progress = height / recipe.shape.coreRings.at(-1)[1];
  const sample = sampleCore(recipe, progress);
  const center = sample.center;
  const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const extension = new THREE.Vector3(
    Math.cos(extensionAngle),
    0,
    Math.sin(extensionAngle),
  );
  const tangent = new THREE.Vector3(
    -Math.sin(extensionAngle),
    0,
    Math.cos(extensionAngle),
  );
  const width = recipe.shape.coreRings.at(-1)[3];
  const base = center.clone().addScaledVector(radial, sample.radius * baseFactor);
  const shoulder = base.clone().addScaledVector(extension, length * 0.5).add(new THREE.Vector3(0, rise * 0.5, 0));
  const tip = base.clone().addScaledVector(extension, length).add(new THREE.Vector3(0, rise, 0));
  const vertices = [
    base.clone().addScaledVector(tangent, -width),
    shoulder.clone().addScaledVector(tangent, -width * 0.5),
    tip,
    shoulder.clone().addScaledVector(tangent, width * 0.5),
    base.clone().addScaledVector(tangent, width),
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices.flatMap((point) => point.toArray()), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4, 2, 1, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

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

function makeLayersGeometry(recipe) {
  const geometries = [];
  for (let familyIndex = 0; familyIndex < recipe.shape.sheathFamilies.length; familyIndex += 1) {
    const [start, spacing, angle, baseFactor, length, rise] =
      recipe.shape.sheathFamilies[familyIndex];
    for (let index = 0; index < 3; index += 1) {
      const interval = Math.abs(spacing);
      const familyHeightAdjustment = familyIndex === 2
        ? recipe.shape.phase * index * (2 - index) -
          recipe.shape.phase * index * (index - 1) * 0.5
        : 0;
      const height = start + interval * index + familyHeightAdjustment +
        (spacing < 0 ? rise * index * (index - 1) * 0.5 : 0);
      const extensionAngle = familyIndex === 1
        ? angle - recipe.shape.phase * index * (index - 1) * 0.5 -
          recipe.shape.phase * index * 0.5 * 0.5
        : familyIndex === 2
          ? angle - recipe.shape.phase * index * index -
            recipe.shape.phase * index * (index - 1) * 0.5
          : angle;
      const layerLength = familyIndex === 2
        ? length * (1 - recipe.shape.phase * index * (index - 1) * 0.5)
        : length;
      const attachmentAngle = familyIndex === 0
        ? index === 1
          ? angle + recipe.shape.phase * (3 + 0.5)
          : angle + recipe.shape.phase * (1 - index * 0.5)
        : familyIndex === 1
          ? angle + recipe.shape.phase * index
          : angle - Math.PI * recipe.shape.phase;
      geometries.push(
        bladeGeometry(
          recipe,
          height,
          attachmentAngle,
          baseFactor,
          layerLength,
          rise,
          extensionAngle,
        ),
      );
    }
  }
  const [height, angle, baseFactor, length, rise] = recipe.shape.heroSheath;
  geometries.push(
    bladeGeometry(
      recipe,
      height,
      angle - Math.PI * 0.5,
      baseFactor,
      length,
      rise,
      angle,
    ),
  );
  const crownBase = ringCenter(recipe.shape.coreRings.at(-1));
  const [crownTopRadius, crownBottomRadius] = recipe.shape.crownRadii;
  for (let index = 0; index < recipe.shape.crownCount; index += 1) {
    const crownAngle = recipe.shape.phase + index / recipe.shape.crownCount * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(crownAngle), 0, Math.sin(crownAngle));
    const branchSpread = index === 0 ? 0 : recipe.shape.crownSpread;
    const branchLength = index === 0
      ? recipe.shape.crownLength
      : recipe.shape.crownLength * (1 - recipe.shape.phase * 2);
    const direction = radial.clone()
      .multiplyScalar(branchSpread)
      .setY(branchLength);
    const geometry = new THREE.CylinderGeometry(
      crownTopRadius,
      crownBottomRadius,
      direction.length(),
      3,
    );
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
    );
    geometry.translate(
      crownBase.x + radial.x * branchSpread * 0.5 + direction.x * 0.5,
      crownBase.y + direction.y * 0.5,
      crownBase.z + radial.z * branchSpread * 0.5 + direction.z * 0.5,
    );
    geometries.push(geometry);
  }
  return mergeGeometries(geometries);
}

function patternSource(recipe) {
  return `
    float bambooHash(vec3 point) {
      return fract(sin(dot(point, vec3(2.0, 3.0, 4.0))) * ${recipe.seed}.0);
    }
    vec3 bambooColor(vec3 point) {
      float bands = sin(point.y * 4.0 + atan(point.z, point.x) * 2.0) * 0.5 + 0.5;
      float grain = bambooHash(floor(point * 3.0));
      float amount = clamp((bands + grain) * 0.5, 0.0, 1.0);
      return mix(coreColor, coreAccent, amount);
    }
  `;
}

function coreUniforms(recipe) {
  return {
    coreColor: { value: new THREE.Color(recipe.appearance.coreColor) },
    coreAccent: { value: new THREE.Color(recipe.appearance.coreAccent) },
  };
}

function makeCoreAlbedoMaterial(recipe) {
  return new THREE.ShaderMaterial({
    uniforms: coreUniforms(recipe),
    vertexShader: `varying vec3 vLocal; void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 coreColor;uniform vec3 coreAccent;varying vec3 vLocal;${patternSource(recipe)}void main(){gl_FragColor=vec4(bambooColor(vLocal),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    side: THREE.DoubleSide,
  });
}

function makeCoreMaterial(recipe) {
  const material = new THREE.MeshStandardMaterial({
    roughness: recipe.appearance.roughness,
    metalness: recipe.appearance.metalness,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coreUniforms(recipe));
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal=position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 coreColor;uniform vec3 coreAccent;varying vec3 vLocal;${patternSource(recipe)}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb=bambooColor(vLocal);");
  };
  material.customProgramCacheKey = () => recipe.kind;
  material.userData.createAlbedoMaterial = () => makeCoreAlbedoMaterial(recipe);
  return material;
}

export function generateBambooShoot(recipe) {
  const root = new THREE.Group();
  root.name = "Bamboo Shoot";
  root.userData.semanticId = recipe.id;
  root.userData.generatorKind = recipe.kind;
  root.userData.recipeSeed = recipe.seed;
  const core = new THREE.Mesh(makeCoreGeometry(recipe), makeCoreMaterial(recipe));
  core.name = "Tapered Core";
  core.userData.semanticId = semanticPartId(recipe.id, "core");
  const layers = new THREE.Mesh(
    makeLayersGeometry(recipe),
    new THREE.MeshStandardMaterial({
      color: recipe.appearance.sheathColor,
      roughness: recipe.appearance.roughness,
      metalness: recipe.appearance.metalness,
      side: THREE.DoubleSide,
    }),
  );
  layers.name = "Axial Layer Families";
  layers.userData.semanticId = semanticPartId(recipe.id, "layers");
  root.add(core, layers);
  for (const part of ["sheaths", "crown"]) {
    const semantic = new THREE.Object3D();
    semantic.userData.semanticId = semanticPartId(recipe.id, part);
    layers.add(semantic);
  }
  root.updateMatrixWorld(true);
  return root;
}

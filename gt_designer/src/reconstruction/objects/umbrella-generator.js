import * as THREE from "three";

import { semanticPartId } from "../core/object-generator.js";

function makeCanopyGeometry(recipe) {
  const shape = recipe.shape;
  const angularCount = shape.panels * shape.angularSubdivisions;
  const phase = THREE.MathUtils.degToRad(shape.phaseDegrees);
  const panelAngle = (Math.PI * 2) / shape.panels;
  const angularStep = (Math.PI * 2) / angularCount;
  const positions = [];
  const canopyData = [];
  const indices = [];
  const layers = [];

  for (const side of [1, -1]) {
    const center = positions.length / 3;
    positions.push(0, side * shape.canopyThickness * 0.5, 0);
    canopyData.push(0, 0, side);
    const rings = [];
    const radialBandCount = side > 0 ? shape.radialBands : 1;
    for (let ring = 1; ring <= radialBandCount; ring += 1) {
      const fraction = ring / radialBandCount;
      const ringIndices = [];
      for (let segment = 0; segment < angularCount; segment += 1) {
        const angle = phase + segment * angularStep;
        const offset =
          ((segment % shape.angularSubdivisions) /
            shape.angularSubdivisions - 0.5) * panelAngle;
        const chordScale = Math.cos(panelAngle * 0.5) / Math.cos(offset);
        const radius = shape.canopySurfaceRadius * fraction * chordScale;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        positions.push(
          x,
          -shape.canopyDrop * fraction +
            side * shape.canopyThickness * 0.5,
          z,
        );
        canopyData.push(x, z, side);
        ringIndices.push(positions.length / 3 - 1);
      }
      rings.push(ringIndices);
    }
    const outerEdge = [];
    for (let segment = 0; segment < angularCount; segment += 1) {
      const angle = phase + segment * angularStep;
      const offset =
        ((segment % shape.angularSubdivisions) /
          shape.angularSubdivisions - 0.5) * panelAngle;
      const chordScale = Math.cos(panelAngle * 0.5) / Math.cos(offset);
      const radius = shape.canopyRadius * chordScale;
      positions.push(
        Math.cos(angle) * radius,
        -shape.canopyDrop - shape.rimDrop +
          side * shape.canopyThickness * 0.5,
        Math.sin(angle) * radius,
      );
      canopyData.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        side,
      );
      outerEdge.push(positions.length / 3 - 1);
    }
    rings.push(outerEdge);
    for (let segment = 0; segment < angularCount; segment += 1) {
      const next = (segment + 1) % angularCount;
      if (side > 0) indices.push(center, rings[0][segment], rings[0][next]);
      else indices.push(center, rings[0][next], rings[0][segment]);
    }
    for (let ring = 0; ring < rings.length - 1; ring += 1) {
      for (let segment = 0; segment < angularCount; segment += 1) {
        const next = (segment + 1) % angularCount;
        const lower = rings[ring];
        const upper = rings[ring + 1];
        if (side > 0) {
          indices.push(
            lower[segment], upper[segment], lower[next],
            upper[segment], upper[next], lower[next],
          );
        } else {
          indices.push(
            lower[segment], lower[next], upper[segment],
            upper[segment], lower[next], upper[next],
          );
        }
      }
    }
    layers.push({ center, rings });
  }

  const topEdge = layers[0].rings.at(-1);
  const bottomEdge = layers[1].rings.at(-1);
  for (let segment = 0; segment < angularCount; segment += 1) {
    const next = (segment + 1) % angularCount;
    indices.push(
      topEdge[segment], bottomEdge[segment], topEdge[next],
      topEdge[next], bottomEdge[segment], bottomEdge[next],
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "canopyData",
    new THREE.Float32BufferAttribute(canopyData, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function cylinderBetween(start, end, radius, radialSegments = 3) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    direction.length(),
    radialSegments,
  );
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function mergeColoredGeometries(entries) {
  const positions = [];
  const normals = [];
  const colors = [];
  for (const { geometry: source, color: colorValue } of entries) {
    if (!source.getAttribute("normal")) source.computeVertexNormals();
    const geometry = source.index ? source.toNonIndexed() : source;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const color = new THREE.Color(colorValue);
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      colors.push(color.r, color.g, color.b);
    }
    if (geometry !== source) geometry.dispose();
    source.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}

function makeHardwareGeometry(recipe) {
  const shape = recipe.shape;
  const entries = [];
  const hardwareColor = recipe.appearance.ribColor;
  entries.push({
    geometry: cylinderBetween(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -shape.shaftLength, 0),
      shape.shaftRadius,
      8,
    ),
    color: hardwareColor,
  });
  entries.push({
    geometry: cylinderBetween(
      new THREE.Vector3(0, shape.runnerCenter - shape.runnerLength * 0.5, 0),
      new THREE.Vector3(0, shape.runnerCenter + shape.runnerLength * 0.5, 0),
      shape.runnerRadius,
      12,
    ),
    color: hardwareColor,
  });
  entries.push({
    geometry: cylinderBetween(
      new THREE.Vector3(0, shape.gripCenter - shape.gripLength * 0.5, 0),
      new THREE.Vector3(0, shape.gripCenter + shape.gripLength * 0.5, 0),
      shape.gripRadius,
      12,
    ),
    color: hardwareColor,
  });
  const phase = THREE.MathUtils.degToRad(shape.phaseDegrees);
  for (let panel = 0; panel < shape.panels; panel += 1) {
    const angle = phase + (panel / shape.panels) * Math.PI * 2;
    const radialPoint = (radius, height) => new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius,
    );
    for (const layerOffset of [0, -shape.ribLayerOffset]) {
      entries.push({
        geometry: cylinderBetween(
          radialPoint(
            shape.ribStart,
            -(shape.canopyDrop * shape.ribStart) /
              shape.canopySurfaceRadius +
              shape.canopyThickness * 0.5 + layerOffset,
          ),
          radialPoint(
            shape.canopyRadius,
            -shape.canopyDrop - shape.rimDrop +
              shape.canopyThickness * 0.5 + layerOffset,
          ),
          0.032,
        ),
        color: hardwareColor,
      });
    }
    entries.push({
      geometry: cylinderBetween(
        new THREE.Vector3(0, shape.supportHubHeight, 0),
        radialPoint(
          shape.supportRadius,
          shape.supportEndHeight,
        ),
        0.025,
      ),
      color: hardwareColor,
    });
  }
  const cap = new THREE.SphereGeometry(0.23, 12, 6);
  cap.translate(0, 0.08, 0);
  entries.push({ geometry: cap, color: recipe.appearance.accentColor });
  return mergeColoredGeometries(entries);
}

function canopyPatternSource(recipe) {
  const phase = THREE.MathUtils.degToRad(recipe.shape.phaseDegrees);
  const panelAngle = (Math.PI * 2) / recipe.shape.panels;
  const leafCode = recipe.appearance.leaves.map(
    ([x, z, major, minor], index) => {
      const angle = Math.atan2(z, x) + (index % 2 === 0 ? 0.55 : -0.45);
      return `
        {
          vec2 delta = data.xy - vec2(${x}, ${z});
          float cosine = cos(${angle});
          float sine = sin(${angle});
          vec2 local = vec2(
            cosine * delta.x + sine * delta.y,
            -sine * delta.x + cosine * delta.y
          );
          if (dot(local / vec2(${major}, ${minor}),
                  local / vec2(${major}, ${minor})) < 1.0) {
            result = leafColor;
          }
        }
      `;
    },
  ).join("\n");
  const blossomCode = recipe.appearance.blossoms.map(
    ([x, z, radius]) => `
      {
        vec2 delta = data.xy - vec2(${x}, ${z});
        float distance = length(delta);
        float petal = ${radius * 0.78} +
          ${radius * 0.22} * cos(atan(delta.y, delta.x) * 8.0);
        if (distance < petal) result = flowerColor;
        if (distance < ${radius * 0.18}) result = accentColor;
      }
    `,
  ).join("\n");
  return `
    vec3 umbrellaCanopyPattern(vec3 data) {
      if (data.z < 0.0) return canopyColor;
      float angle = atan(data.y, data.x);
      float panel = fract((angle - ${phase}) / ${panelAngle});
      float boundary = min(panel, 1.0 - panel);
      if (boundary < 0.035) return ribColor;

      vec3 result = canopyColor;
      float stem = abs(data.y + 0.12 * data.x -
        0.18 * sin(data.x * 1.7));
      if (data.x > 0.7 && data.x < 5.2 && stem < 0.055) result = leafColor;
      ${leafCode}
      ${blossomCode}
      return result;
    }
  `;
}

function canopyUniforms(recipe) {
  return {
    canopyColor: { value: new THREE.Color(recipe.appearance.canopyColor) },
    ribColor: { value: new THREE.Color(recipe.appearance.ribColor) },
    flowerColor: { value: new THREE.Color(recipe.appearance.flowerColor) },
    leafColor: { value: new THREE.Color(recipe.appearance.leafColor) },
    accentColor: { value: new THREE.Color(recipe.appearance.accentColor) },
  };
}

function makeCanopyAlbedoMaterial(recipe) {
  return new THREE.ShaderMaterial({
    uniforms: canopyUniforms(recipe),
    vertexShader: `
      attribute vec3 canopyData;
      varying vec3 vCanopyData;
      void main() {
        vCanopyData = canopyData;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 canopyColor;
      uniform vec3 ribColor;
      uniform vec3 flowerColor;
      uniform vec3 leafColor;
      uniform vec3 accentColor;
      varying vec3 vCanopyData;
      ${canopyPatternSource(recipe)}
      void main() {
        gl_FragColor = vec4(umbrellaCanopyPattern(vCanopyData), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  });
}

function makeCanopyMaterial(recipe) {
  const material = new THREE.MeshStandardMaterial({
    roughness: recipe.appearance.roughness,
    metalness: recipe.appearance.metalness,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, canopyUniforms(recipe));
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute vec3 canopyData;\nvarying vec3 vCanopyData;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvCanopyData = canopyData;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform vec3 canopyColor;
         uniform vec3 ribColor;
         uniform vec3 flowerColor;
         uniform vec3 leafColor;
         uniform vec3 accentColor;
         varying vec3 vCanopyData;
         ${canopyPatternSource(recipe)}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.rgb = umbrellaCanopyPattern(vCanopyData);`,
      );
  };
  material.customProgramCacheKey = () => recipe.kind;
  material.userData.createAlbedoMaterial = () =>
    makeCanopyAlbedoMaterial(recipe);
  return material;
}

function bakeReconstructionFrame(geometries, axis) {
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3().fromArray(axis).normalize(),
  );
  const bounds = new THREE.Box3();
  for (const geometry of geometries) {
    geometry.applyQuaternion(quaternion);
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox);
  }
  const offset = new THREE.Vector3(
    -(bounds.min.x + bounds.max.x) * 0.5,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) * 0.5,
  );
  for (const geometry of geometries) {
    geometry.translate(offset.x, offset.y, offset.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
}

/**
 * Recover the authored single mesh as one semantic radial assembly with two
 * render batches: canopy and merged hardware.
 *
 * @param {import("./umbrella-recipe.js").UmbrellaRecipe} recipe
 */
export function generateUmbrella(recipe) {
  const canopyGeometry = makeCanopyGeometry(recipe);
  const hardwareGeometry = makeHardwareGeometry(recipe);
  bakeReconstructionFrame(
    [canopyGeometry, hardwareGeometry],
    recipe.shape.axis,
  );
  const canopyMaterial = makeCanopyMaterial(recipe);
  const hardwareMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: recipe.appearance.roughness,
    metalness: recipe.appearance.metalness,
    side: THREE.DoubleSide,
  });
  const root = new THREE.Group();
  root.name = "Umbrella";
  root.userData.semanticId = recipe.id;
  root.userData.generatorKind = recipe.kind;
  root.userData.recipeSeed = recipe.seed;

  const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
  canopy.name = "Canopy";
  canopy.userData.semanticId = semanticPartId(recipe.id, "canopy");
  const hardware = new THREE.Mesh(hardwareGeometry, hardwareMaterial);
  hardware.name = "Merged Umbrella Hardware";
  hardware.userData.semanticId = semanticPartId(recipe.id, "hardware");
  root.add(canopy, hardware);
  for (const part of ["ribs", "shaft", "runner", "grip"]) {
    const semantic = new THREE.Object3D();
    semantic.name = `${part} semantic handle`;
    semantic.userData.semanticId = semanticPartId(recipe.id, part);
    hardware.add(semantic);
  }
  root.updateMatrixWorld(true);
  return root;
}

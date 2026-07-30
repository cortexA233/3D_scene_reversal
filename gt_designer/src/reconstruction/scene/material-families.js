import * as THREE from "three";

import { createSeededRng } from "../core/rng.js";

/**
 * Material Families.
 *
 * Every surface parameter is computed from the Scene Recipe's compact semantic
 * controls. No authored image, pixel table, sampled grid, or base64 payload is
 * involved; bounded variation inside a family comes from the entity's derived
 * material stream so two lanterns are not byte-identical.
 */
export function createMaterialFamilies(recipe) {
  const declared = new Map(
    recipe.materialFamilies.map((family) => [family.id, family]),
  );
  const cache = new Map();

  function baseMaterial(id) {
    const family = declared.get(id);
    if (!family) throw new Error(`Unknown Material Family: ${id}`);
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(...family.albedo),
      roughness: family.roughness,
      metalness: 0,
    });
  }

  function family(id) {
    if (!cache.has(id)) cache.set(id, baseMaterial(id));
    return cache.get(id);
  }

  /**
   * Bounded per-entity variant: a small hue/lightness offset drawn from the
   * entity's own material stream, so insertion or reordering cannot shift any
   * other entity's appearance.
   */
  function variant(id, seed) {
    const key = `${id}:${seed}`;
    if (cache.has(key)) return cache.get(key);
    const rng = createSeededRng(seed);
    const material = baseMaterial(id);
    const hsl = { h: 0, s: 0, l: 0 };
    material.color.getHSL(hsl);
    material.color.setHSL(
      (hsl.h + (rng.nextFloat() - 0.5) * 0.03 + 1) % 1,
      Math.min(1, Math.max(0, hsl.s + (rng.nextFloat() - 0.5) * 0.08)),
      Math.min(1, Math.max(0, hsl.l + (rng.nextFloat() - 0.5) * 0.07)),
    );
    material.roughness = Math.min(
      1,
      Math.max(0, material.roughness + (rng.nextFloat() - 0.5) * 0.08),
    );
    cache.set(key, material);
    return material;
  }

  function apply(object, id, seed) {
    const material = variant(id, seed);
    object.traverse((child) => {
      if (child.isMesh) {
        child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return object;
  }

  function sky(controls) {
    const zenith = new THREE.Color(controls.zenith);
    const horizon = new THREE.Color(controls.horizon);
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: zenith },
        horizon: { value: horizon },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenith;
        uniform vec3 horizon;
        varying vec3 vWorld;
        void main() {
          float height = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(horizon, zenith, pow(height, 0.65)), 1.0);
        }
      `,
    });
  }

  function ocean(controls) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(controls.color),
      roughness: 0.14,
      metalness: 0.1,
      transparent: true,
      opacity: controls.alpha,
    });
  }

  function terrain(id) {
    const material = baseMaterial(id);
    material.vertexColors = true;
    material.color.set(0xffffff);
    return material;
  }

  return { family, variant, apply, sky, ocean, terrain, declared };
}

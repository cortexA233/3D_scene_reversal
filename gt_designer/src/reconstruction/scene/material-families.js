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

  /**
   * The sky dome: three stacked bands, a warm haze at the horizon, and a two-term
   * sun glow, all from Environment Recipe parameters.
   *
   * `fog: false` matters. The dome is the backdrop the fog fades *into*, so fogging
   * it mixes the fog colour into the sky twice and flattens the gradient the fog is
   * supposed to be read against.
   *
   * The height term is `clamp(dir.y, 0, 1)`, not a remap of `dir.y` into `0..1`
   * across the whole sphere. Only the upper hemisphere is sky; remapping spreads
   * the whole gradient over twice the arc and puts the horizon colour halfway up.
   */
  function sky(controls, sunDirection) {
    const colour = (value) => ({ value: new THREE.Color(value) });
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: colour(controls.zenith),
        horizon: colour(controls.horizon),
        mid: colour(controls.mid),
        haze: colour(controls.haze),
        glow: colour(controls.glow),
        sunDirection: { value: new THREE.Vector3(...sunDirection).normalize() },
        midStop: { value: new THREE.Vector2(...controls.midStop) },
        zenithStop: { value: new THREE.Vector2(...controls.zenithStop) },
        hazeBand: {
          value: new THREE.Vector3(
            controls.hazeBand.scale,
            controls.hazeBand.exponent,
            controls.hazeBand.mix,
          ),
        },
        sunGlow: {
          value: new THREE.Vector4(
            controls.sunGlow.wideExponent,
            controls.sunGlow.wideWeight,
            controls.sunGlow.tightExponent,
            controls.sunGlow.tightWeight,
          ),
        },
      },
      vertexShader: `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 mid;
        uniform vec3 haze;
        uniform vec3 glow;
        uniform vec3 sunDirection;
        uniform vec2 midStop;
        uniform vec2 zenithStop;
        uniform vec3 hazeBand;
        uniform vec4 sunGlow;
        varying vec3 vLocal;

        void main() {
          vec3 direction = normalize(vLocal);
          float height = clamp(direction.y, 0.0, 1.0);

          vec3 colour = mix(horizon, mid, smoothstep(midStop.x, midStop.y, height));
          colour = mix(colour, zenith, smoothstep(zenithStop.x, zenithStop.y, height));

          float band = pow(1.0 - clamp(height * hazeBand.x, 0.0, 1.0), hazeBand.y);
          colour = mix(colour, haze, band * hazeBand.z);

          float towardsSun = max(dot(direction, sunDirection), 0.0);
          colour += glow * pow(towardsSun, sunGlow.x) * sunGlow.y;
          colour += glow * pow(towardsSun, sunGlow.z) * sunGlow.w;

          gl_FragColor = vec4(colour, 1.0);
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

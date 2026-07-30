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

  /**
   * The Ocean Appearance Surface.
   *
   * The authored sea is `THREE.Water`: a mirror render target, four samples of a
   * loaded normal map at two fine and two coarse tilings, a Schlick Fresnel
   * blend between scattered water colour and that reflection, and a Blinn-Phong
   * sun term. None of the loading is available to the Production Runtime, and a
   * flat `MeshStandardMaterial` plane is what the sea was before this: one
   * saturated colour with no glint, no Fresnel, and no horizon, measured at
   * DeltaE 16.13 to 26.04 across the six frozen cameras.
   *
   * Reconstructed analytically. The wave bands stand in for the normal map's own
   * tilings — the authored shader divides world XY by 103, 107, 1091 and 8907 at
   * `size` 2, which is why the declared wavelengths are near 51, 53, 545 and
   * 4450 world units. The reflection samples the same sky gradient the dome
   * renders rather than a second render pass, so what the water reflects and
   * what the camera sees behind it cannot disagree.
   *
   * The surface stays a flat plane on the Semantic Sea Level, exactly as the
   * authored one does: `Water` perturbs the normal and never the vertex, so the
   * datum the land, shore, and sea classification is measured against is a
   * consequence of the representation rather than a constraint bolted onto it.
   */
  function ocean(controls, sky, sunDirection) {
    const colour = (value) => ({ value: new THREE.Color(value) });
    const bands = controls.waveBands;
    return new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          waterColour: colour(controls.color),
          sunColour: colour(controls.sunColor),
          sunDirection: { value: new THREE.Vector3(...sunDirection).normalize() },
          distortion: { value: controls.distortion },
          alpha: { value: controls.alpha },
          phase: { value: controls.phase },
          waveLength: { value: new THREE.Vector4(...bands.map((band) => band.wavelength)) },
          waveHeight: { value: new THREE.Vector4(...bands.map((band) => band.amplitude)) },
          waveAngle: { value: new THREE.Vector4(...bands.map((band) => band.angle)) },
          zenith: colour(sky.zenith),
          horizon: colour(sky.horizon),
          mid: colour(sky.mid),
          haze: colour(sky.haze),
          midStop: { value: new THREE.Vector2(...sky.midStop) },
          zenithStop: { value: new THREE.Vector2(...sky.zenithStop) },
          hazeBand: {
            value: new THREE.Vector3(
              sky.hazeBand.scale,
              sky.hazeBand.exponent,
              sky.hazeBand.mix,
            ),
          },
        },
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform vec3 waterColour;
        uniform vec3 sunColour;
        uniform vec3 sunDirection;
        uniform float distortion;
        uniform float alpha;
        uniform float phase;
        uniform vec4 waveLength;
        uniform vec4 waveHeight;
        uniform vec4 waveAngle;
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 mid;
        uniform vec3 haze;
        uniform vec2 midStop;
        uniform vec2 zenithStop;
        uniform vec3 hazeBand;
        varying vec3 vWorld;

        // One travelling band's contribution to the surface slope. Two crossed
        // terms per band, so a band is a swell rather than corduroy.
        vec2 band(vec2 p, float wavelength, float amplitude, float angle) {
          float k = 6.2831853 / wavelength;
          vec2 along = vec2(cos(angle), sin(angle));
          vec2 across = vec2(-along.y, along.x);
          float a = dot(p, along) * k + phase;
          float b = dot(p, across) * k * 0.73 - phase * 0.61;
          return along * (amplitude * k * cos(a)) + across * (amplitude * k * 0.6 * cos(b));
        }

        // The dome's own gradient, so the reflection and the backdrop agree.
        vec3 skyAlong(vec3 direction) {
          float height = clamp(direction.y, 0.0, 1.0);
          vec3 colour = mix(horizon, mid, smoothstep(midStop.x, midStop.y, height));
          colour = mix(colour, zenith, smoothstep(zenithStop.x, zenithStop.y, height));
          float low = pow(1.0 - clamp(height * hazeBand.x, 0.0, 1.0), hazeBand.y);
          return mix(colour, haze, low * hazeBand.z);
        }

        void main() {
          vec2 p = vWorld.xz;
          vec2 slope = band(p, waveLength.x, waveHeight.x, waveAngle.x)
            + band(p, waveLength.y, waveHeight.y, waveAngle.y)
            + band(p, waveLength.z, waveHeight.z, waveAngle.z)
            + band(p, waveLength.w, waveHeight.w, waveAngle.w);
          // The authored control scales how far the surface bends what it
          // reflects, which is the same thing as how steep its slopes read.
          slope *= distortion;
          vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

          vec3 eye = normalize(cameraPosition - vWorld);
          vec3 reflected = reflect(-eye, normal);
          reflected.y = abs(reflected.y);
          vec3 reflection = skyAlong(reflected);

          float theta = max(dot(eye, normal), 0.0);
          float reflectance = 0.3 + 0.7 * pow(1.0 - theta, 5.0);

          vec3 halfway = normalize(sunDirection + eye);
          float diffuse = max(dot(sunDirection, normal), 0.0);
          float specular = pow(max(dot(normal, halfway), 0.0), 100.0) * 3.0;
          vec3 scatter = max(0.0, dot(normal, eye)) * waterColour;

          vec3 albedo = mix(
            sunColour * diffuse * 0.3 + scatter,
            reflection * 0.9 + sunColour * specular,
            reflectance
          );
          gl_FragColor = vec4(albedo, alpha);
          #include <fog_fragment>
        }
      `,
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

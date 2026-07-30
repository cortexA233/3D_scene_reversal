import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * The Environment Recipe's post-processing chain, built from its parameters.
 *
 * Without this the island renders straight out of the renderer while the authored
 * scene renders through a composer, so every appearance measurement was dominated
 * by a wholesale difference in bloom, grade, and vignette rather than by anything
 * about the island.
 *
 * Everything here is a small number of semantic parameters and one shader written
 * as source. No captured pixel, gradient table, sampled curve, or lookup texture
 * is retained, and nothing is loaded: the chain is resolution-independent and
 * editable, and changing `grading.warmMix` in the recipe changes the grade.
 *
 * Film grain is a declared parameter and is off, because the frozen render
 * contract disables it — a per-frame random term would make a capture
 * unrepeatable, which is the opposite of what the Frozen Observation Clock is
 * for. It stays a parameter rather than being deleted so the runtime describes
 * the authored chain completely.
 */

export const ENVIRONMENT_POSTPROCESSING_VERSION = "environment-postprocessing-v1";

/**
 * Grade, vignette, and optional grain in one pass, matching the authored chain's
 * single shader rather than splitting it into three. Order matters: the grade
 * mixes, then gamma, then the vignette multiplies, then grain adds. Reordering
 * changes the result even with identical parameters.
 */
function gradePass({ grading, vignette, filmGrain }) {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      warmMix: { value: grading.warmMix },
      gamma: { value: grading.gamma },
      tint: { value: new THREE.Vector3(...grading.tint) },
      lift: { value: new THREE.Vector3(...grading.lift) },
      vignetteAmount: { value: vignette.amount },
      vignetteFalloff: { value: vignette.falloff },
      grainAmount: { value: filmGrain.amount },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform vec3 tint;
      uniform vec3 lift;
      uniform float warmMix;
      uniform float gamma;
      uniform float vignetteAmount;
      uniform float vignetteFalloff;
      uniform float grainAmount;
      uniform float time;

      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec3 colour = texture2D(tDiffuse, vUv).rgb;
        // Warm grade: lift the shadows towards warm and roll the highlights off.
        colour = mix(colour, colour * tint + lift, warmMix);
        colour = pow(colour, vec3(gamma));
        // Soft vignette measured from the frame centre.
        vec2 offset = vUv - 0.5;
        float falloff = 1.0 - vignetteAmount * dot(offset, offset) * vignetteFalloff;
        colour *= clamp(falloff, 0.0, 1.0);
        if (grainAmount > 0.0) {
          colour += (noise(vUv * vec2(1920.0, 1080.0) + time) - 0.5) * grainAmount;
        }
        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  });
}

/**
 * Builds the composer for a generated scene.
 *
 * @param {object} options
 * @param {THREE.WebGLRenderer} options.renderer
 * @param {THREE.Scene} options.scene
 * @param {THREE.Camera} options.camera
 * @param {object} options.environment the generated Environment Recipe
 * @param {[number, number]} options.size framebuffer size in pixels
 */
export function createEnvironmentComposer({ renderer, scene, camera, environment, size }) {
  const post = environment.postprocessing;
  const [width, height] = size;
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const passes = ["render"];
  if (post.bloom.strength > 0) {
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(width, height),
        post.bloom.strength,
        post.bloom.radius,
        post.bloom.threshold,
      ),
    );
    passes.push("bloom");
  }
  const grade = gradePass(post);
  composer.addPass(grade);
  passes.push("grade");
  // The output pass performs the tone mapping and colour-space conversion the
  // renderer would have done for a direct render, so it has to be last.
  composer.addPass(new OutputPass());
  passes.push("output");

  return {
    version: ENVIRONMENT_POSTPROCESSING_VERSION,
    composer,
    passes,
    render() {
      composer.render();
    },
    setSize(nextWidth, nextHeight) {
      composer.setSize(nextWidth, nextHeight);
    },
    /**
     * Points the chain at another camera. A fixed-camera capture renders the same
     * scene through six frozen cameras, and rebuilding the chain for each would
     * allocate a fresh bloom mip pyramid every time; the passes themselves are
     * camera-independent.
     */
    setCamera(nextCamera) {
      renderPass.camera = nextCamera;
    },
    /**
     * Only meaningful when film grain is enabled, which the frozen contract does
     * not do. It exists so a caller that animates does not have to know whether
     * the chain has a time-dependent term.
     */
    setTime(seconds) {
      grade.uniforms.time.value = seconds;
    },
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  DEPTH_MATERIAL,
  NORMAL_MATERIAL,
  PASS_IDENTITY_CAPACITY,
  PASS_IDENTITY_STEP,
  SEMANTIC_GROUPS,
  SEMANTIC_LABELS,
  decodeSemantic,
  groupIndex,
  semanticMaterial,
  tintedInstancedMeshes,
  withPassMaterials,
} from "../tools/evaluation/scene-pass-encoding.mjs";

/**
 * Analytical fixtures for the pass encodings, which every rendered gate metric
 * is read back out of.
 *
 * They exist because an encoding defect is indistinguishable from a candidate
 * defect in the reported numbers. All three checked here were live: a
 * per-instance colour that tinted the identity a pass had just written, depth
 * and normal shaders that ignored `instanceMatrix`, and an identity lattice that
 * overflowed the channel it was written into. Between them they mismeasured the
 * reference's own `cover` group by a factor of forty-one, and the fitting that
 * followed chased the wrong direction.
 */

/**
 * A scene stand-in with the parts `withPassMaterials` walks. Real three.js
 * objects would do, but building them by hand keeps what the fixture is claiming
 * visible: an InstancedMesh with a per-instance colour, one without, and a
 * sprite that cannot take a mesh material.
 */
function fakeScene(children) {
  return {
    background: "the-background",
    fog: "the-fog",
    traverse(visit) {
      for (const child of children) visit(child);
    },
  };
}

const instancedMesh = (instanceColor) => ({
  isMesh: true,
  isInstancedMesh: true,
  visible: true,
  material: "authored-material",
  instanceColor,
});

test("every declared identity fits the channel it is written into", () => {
  // The defect this replaces: at a step of 20 the fourteenth group needed 280 of
  // 255, so `environment` clamped onto `cover`'s value and every environment
  // pixel was counted as cover.
  assert.ok(
    SEMANTIC_GROUPS.length <= PASS_IDENTITY_CAPACITY,
    `${SEMANTIC_GROUPS.length} semantic groups do not fit the ${PASS_IDENTITY_CAPACITY} the red channel carries`,
  );
  assert.equal(
    groupIndex(SEMANTIC_GROUPS[SEMANTIC_GROUPS.length - 1]) * PASS_IDENTITY_STEP <= 255,
    true,
  );
  assert.throws(
    () => semanticMaterial(PASS_IDENTITY_CAPACITY + 1),
    RangeError,
    "an identity past the channel's capacity has to be refused rather than clamped",
  );
});

test("an identity round-trips through the byte it is encoded in", () => {
  // Encode exactly as the pass does, quantise to a byte the way the render
  // target does, and decode. Every declared group has to come back as itself,
  // including the highest, which is where clamping shows up.
  for (const [id, group] of Object.entries(SEMANTIC_LABELS)) {
    const numeric = Number(id);
    const material = semanticMaterial(numeric);
    const red = Math.round(
      Math.min(1, material.color.getRGB({}, THREE.LinearSRGBColorSpace).r) * 255,
    );
    const decoded = decodeSemantic(new Uint8Array([red, 0, 0, 255]));
    assert.equal(
      decoded[0],
      numeric,
      `${group} encoded to ${red} and decoded as ${SEMANTIC_LABELS[decoded[0]] ?? decoded[0]}`,
    );
  }
  // Nothing rendered stays nothing.
  assert.equal(decodeSemantic(new Uint8Array([0, 0, 0, 255]))[0], 0);
});

test("a pass suppresses per-instance colour and puts it back", () => {
  // The defect this replaces. three.js multiplies `instanceColor` into whatever
  // material is bound, so the identity a pass writes is not the identity that
  // reaches the framebuffer for any InstancedMesh carrying one. The reference's
  // two ground-rock populations call setColorAt and its three grass populations
  // do not, which is why the grass measured correctly and 5,100 rock instances
  // decoded as five other groups.
  const tinted = instancedMesh({ isInstancedBufferAttribute: true, id: "tint" });
  const plain = instancedMesh(null);
  const sprite = { isSprite: true, visible: true, material: "sprite-material" };
  const scene = fakeScene([tinted, plain, sprite]);

  let observed = null;
  const result = withPassMaterials(
    scene,
    () => "pass-material",
    () => {
      observed = {
        tintedInstanceColour: tinted.instanceColor,
        tintedMaterial: tinted.material,
        plainMaterial: plain.material,
        spriteVisible: sprite.visible,
        background: scene.background,
        fog: scene.fog,
      };
      return "ran";
    },
    () => false,
  );

  assert.equal(result, "ran");
  assert.equal(
    observed.tintedInstanceColour,
    null,
    "the per-instance colour was still bound while the identity pass rendered",
  );
  assert.equal(observed.tintedMaterial, "pass-material");
  assert.equal(observed.plainMaterial, "pass-material");
  assert.equal(observed.spriteVisible, false, "a sprite cannot take a mesh pass material");
  assert.equal(observed.background, null);
  assert.equal(observed.fog, null);

  // Restored exactly, by reference. This is the read-only contract the whole
  // Immutable Reference Capture rests on.
  assert.deepEqual(tinted.instanceColor, { isInstancedBufferAttribute: true, id: "tint" });
  assert.equal(tinted.material, "authored-material");
  assert.equal(plain.material, "authored-material");
  assert.equal(plain.instanceColor, null);
  assert.equal(sprite.visible, true);
  assert.equal(scene.background, "the-background");
  assert.equal(scene.fog, "the-fog");
});

test("per-instance colour is restored even when the pass throws", () => {
  const tinted = instancedMesh({ id: "tint" });
  const scene = fakeScene([tinted]);
  assert.throws(() =>
    withPassMaterials(
      scene,
      () => "pass-material",
      () => {
        throw new Error("the render failed");
      },
      () => false,
    ),
  );
  assert.deepEqual(tinted.instanceColor, { id: "tint" });
  assert.equal(tinted.material, "authored-material");
});

test("the tinted populations are nameable rather than inferred", () => {
  const tinted = instancedMesh({ id: "tint" });
  const plain = instancedMesh(null);
  const mesh = { isMesh: true, visible: true, material: "m" };
  assert.deepEqual(tintedInstancedMeshes(fakeScene([tinted, plain, mesh])), [tinted]);
});

test("the depth and normal passes place instanced geometry where it stands", () => {
  // The defect this replaces: both are ShaderMaterials, so no three.js chunk
  // applied `instanceMatrix` for them, and every instance of every population
  // rendered stacked on its mesh's own origin. Depth and orientation evidence
  // for an instanced group measured whatever stood behind it instead.
  for (const [name, material] of [
    ["depth", DEPTH_MATERIAL],
    ["world normal", NORMAL_MATERIAL],
  ]) {
    assert.match(
      material.vertexShader,
      /#ifdef USE_INSTANCING/,
      `the ${name} pass does not apply an instance transform`,
    );
    assert.match(
      material.vertexShader,
      /instanceMatrix \* local/,
      `the ${name} pass does not place instanced positions`,
    );
  }
  // Orientation has to be turned by the instance's own basis as well as moved,
  // the way three.js's own defaultnormal_vertex does it, or a rotated instance
  // reports its mesh's normals.
  assert.match(NORMAL_MATERIAL.vertexShader, /mat3\(instanceMatrix\) \* objectNormal/);
});

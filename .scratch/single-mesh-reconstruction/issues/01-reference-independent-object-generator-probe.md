# 01 — Reference-Independent Object Generator probe

**What to build:** Establish the smallest retained Object Generator and replacement-only runtime seam. A deliberately synthetic test fixture must prove that a typed semantic recipe and explicit versioned seed can generate and render one stable semantic object root in source-scene units without loading any Authored Reference or depending on Single Mesh Lab presentation state.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Define the minimal recipe responsibilities: stable semantic ID, generator kind, explicit seed, typed shape parameters, and separate typed appearance parameters.
- [x] Define the generated result as one `THREE.Object3D` semantic root that may contain meaningful child meshes but contains no Lab slot, camera, lighting, display normalization, or Authored Reference metadata.
- [x] Provide an explicit versioned integer RNG that does not call ambient `Math.random()` and whose output is covered by fixed-vector tests.
- [x] Generate a clearly identified synthetic acceptance fixture in source-scene units with its bottom-center at the Reconstruction Frame origin and source-world axis orientation preserved.
- [x] Assign stable semantic IDs to the fixture root and meaningful child parts.
- [x] Render the fixture through a production-style entrypoint using a locally bundled or vendored, version-locked Three.js dependency.
- [x] Demonstrate that the production-style entrypoint starts with network access blocked and has no imports of GLTF, Draco, texture, ground-truth, or evaluation loaders.
- [x] Verify repeated fixed-recipe generation has identical semantic hierarchy, attribute/index lengths, CPU typed-array bytes, material parameters, bounds, triangles, and draw calls on the normative browser.
- [x] Keep the fixture in test infrastructure rather than treating it as a real island object or the beginning of a general modeling DSL.
- [x] Provide one non-interactive smoke operation that exits unsuccessfully when generation, rendering, offline loading, or deterministic comparison fails.

## Answer

Implemented the minimal retained Object Generator seam with validated semantic recipes, `mulberry32-v1`, stable semantic IDs, and a synthetic bottom-centered probe. Added a replacement-only entrypoint that imports the locked local Three.js 0.170.0 package and no authored/reference loader or network dependency.

Acceptance is reproducible through `npm run accept:ticket-01`. It runs nine contract, deterministic-byte, Reconstruction Frame, and dependency-boundary tests, then starts the local replacement server with network resolution blocked and verifies a real headless WebGL render reaches `ready` with semantic object ID `test.probe`. A separate in-app browser inspection confirmed the rendered fixture and reported no browser warnings or errors.

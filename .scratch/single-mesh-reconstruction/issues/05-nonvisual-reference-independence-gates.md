# 05 — Non-visual acceptance and Reference Independence gates

**What to build:** Add the non-visual half of Exact-ish Reconstruction acceptance: compactness, runtime cost, deterministic structure, cross-browser tolerance, and a strong Reference Independence audit that detects hidden authored or source-resolution-dependent payloads.

**Blocked by:** 03 — Fixed-view Evaluation Harness.

**Status:** resolved

## Answer

Implemented the retained nonvisual acceptance stack and proved it first with the synthetic probe. Browser evidence records canonical recipe bytes, deterministic structure and typed-array checksums, triangles, real draw-call accounting, geometry memory, and warm-generation p95 after 10 warmups plus 100 disposed measurements on the exact normative machine, OS, Chrome, Three.js, and recorded power state. Object bundle cost is the gzip difference between matched minified/source-map-free shared and shared-plus-object builds with Three.js external.

The production audit consumes esbuild's machine-readable metafile, scans source and minified output, and rejects authored model/image/heightfield references, loader or evaluation imports, source manifests and node IDs, URLs, ambient randomness, CPU generation fed by GPU readback, WASM, runtime textures, base64, unapproved dependencies, and dense numeric payloads. A clean production bundle renders from an empty Chrome profile with network resolution blocked while the temporary server exposes only `index.html`, `bundle.js`, and locked local Three.js.

Normative Chrome/V8 evidence is byte-stable. Structural signatures also match the Safari 26.2 system JavaScriptCore and the SHA-256-verified official Firefox 153 SpiderMonkey shell with zero bounds variance against the allowed `7e-6` canonical tolerance. The frozen development-only report passes all six top-level gates and is reproducible with `npm run accept:ticket-05`.

- [x] Count every object-specific numeric constant wherever it appears and fail when an object exceeds its declared scalar budget.
- [x] Measure canonical minified UTF-8 recipe bytes and minified, source-map-free gzip production bundle delta relative to the shared production framework.
- [x] Measure generated triangle count, isolated draw calls, and geometry memory as the sum of index and vertex-attribute typed-array byte lengths.
- [x] Measure warm generation p95 after ten warm-ups over at least one hundred disposed repetitions, including semantic-root construction, attributes, normals, and bounds while excluding download, shader compilation, and GPU upload.
- [x] Record exact hardware, operating system, power state, browser, and Three.js versions in each benchmark report.
- [x] Use the accepted Apple M5 MacBook Pro, macOS 26.2, Chrome 150.0.7871.184, and Three.js 0.170.0 setup as the normative hard-timing baseline; require an explicit migration report before changing it.
- [x] On the normative browser, require repeated fixed-recipe generation to produce identical semantic hierarchy IDs, structure, CPU typed-array bytes, material parameters, bounds, triangles, and draw calls.
- [x] Across supported Chrome, Firefox, and Safari builds, require identical semantic structure, topology, branches, counts, and IDs, with bounds variance no greater than one millionth of the canonical maximum dimension.
- [x] Detect ambient `Math.random()` use and prevent shader randomness from determining topology, IDs, object count, layout, collision structure, or animation branches.
- [x] Build and run the production-style replacement entrypoint while authored directories are unavailable, network access is blocked, and browser cache is empty.
- [x] Statistically and statically reject authored GLB/GLTF/image/heightfield references, model-CDN URLs, ground-truth loaders, source manifests, source-node IDs, base64 payloads, oversized typed arrays, and suspicious sampled numeric constants.
- [x] Verify the production dependency direction: evaluation may import generators, but production cannot import evaluation, ground truth, analysis, or Lab presentation code.
- [x] Fail Stage 1 production acceptance if WASM or runtime texture bytes enter the replacement payload.
- [x] Emit one machine-readable report combining deterministic, compactness, timing, dependency, offline-network, and static-audit evidence.

# Single Mesh Runtime Audit

This development-only page and its Node orchestration implement the nonvisual
half of Exact-ish Reconstruction acceptance. The audit measures canonical recipe
bytes, every numeric literal in each object module, minified gzip bundle delta,
triangles, draw calls, typed-array memory, deterministic CPU bytes, and warm
generation p95 after 10 warmups and 100 measured/disposed generations.

Run and freeze the current report:

```sh
npm run audit:nonvisual
```

Rerun it non-interactively against the frozen schema:

```sh
npm run check:nonvisual
```

The audit builds a minified, source-map-free production bundle with Three.js
reported separately, then serves only `index.html`, `bundle.js`, and the locked
local Three.js module from a temporary web root. Chrome starts with an empty
profile and blocked network resolution, so the Authored Reference, loaders,
measurement files, and browser cache are unavailable.

Static checks reject authored model/image paths, source manifests and node IDs,
CDN URLs, loader imports, ambient `Math.random()`, WASM, GPU readback into CPU
generation, base64 payloads, large typed-array literals, and suspicious sampled
numeric arrays. The esbuild metafile enforces the one-way dependency boundary
and permits only Three.js as a production dependency.

Normative byte determinism and timing run in Chrome/V8. CPU structure, topology,
semantic IDs, counts, and canonical bounds are compared with a tolerance of
`7e-6` against the Safari 26.2 system JavaScriptCore and the SHA-256-verified
official Firefox 153 SpiderMonkey shell. These engine checks do not substitute
for the fixed-view browser visual gates.

Reports under `reports/` are development-only evidence and may not enter the
replacement bundle.

The Stage 1 certification additionally builds the complete four-generator
production entrypoint, measures sequential warm generation, sums runtime
texture use, scans the production bundle for WASM, and requires every object's
isolated offline audit to pass. Run it with `npm run certify:stage-1`; a
nonzero exit is the expected frozen v1 outcome because visual object gates fail,
even though the aggregate runtime and Reference Independence gates pass.

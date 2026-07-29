---
status: accepted
---

# Admit production WASM only through an evidence-gated exception

The first Single Mesh Lab reconstruction tranche excludes WASM so it can test whether Three.js and small purpose-built generators are sufficient without a general geometry kernel. The full-island Production Runtime also defaults to no WASM, but may admit a general-purpose Runtime Kernel when object-level evidence shows that at least two reusable shape classes materially benefit and the dependency passes bundle-size, initialization-time, and geometry-generation-time gates. An admitted kernel must be bundled locally for offline use, contain no object-specific authored or sampled data, preserve semantic recipes and deterministic parameters in TypeScript, convert generated results to `THREE.BufferGeometry`, and release temporary kernel objects after generation. Development-only analysis may use WASM without triggering this production exception.

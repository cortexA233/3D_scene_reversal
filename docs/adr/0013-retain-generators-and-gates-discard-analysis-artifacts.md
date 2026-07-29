---
status: accepted
---

# Retain generators and quality gates while isolating disposable analysis

The Single Mesh Lab is a retained vertical slice rather than a wholly throwaway prototype. Object recipes, generators, the versioned RNG, evidence-backed geometry and material helpers, semantic IDs, the replacement-only entrypoint, the Evaluation Harness, fixed capture protocol, and automated quality, performance, determinism, and Reference Independence gates remain project infrastructure. GLB decoding, one-off object analysis, extracted sections and images, fitting histories, and external Blender, Python, C++, WASM, or SDF experiments remain disposable or development-only. Ground-truth and evaluation code may import production generators, but production code may never import Lab placement, display normalization, reference loaders, passes, or measurement artifacts.

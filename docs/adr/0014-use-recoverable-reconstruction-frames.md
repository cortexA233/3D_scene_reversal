---
status: accepted
---

# Use recoverable reconstruction frames instead of invented authored transforms

The selected GLB nodes have no independent translation, rotation, or scale; their placement is baked into vertex positions, so the original authoring-tool local frames are not observable. Each current Object Generator therefore uses a source-aligned Reconstruction Frame in original scene units: source-world axis orientation is preserved and the source world-space bounding-box bottom-center becomes the local origin. Full-scene placement can restore that extracted bottom-center with identity rotation and scale for these baked references, while Lab slots and maximum-dimension normalization remain adapter-only. Future repeated-instance analysis may derive a shared semantic frame and explicit transforms, but it must not retroactively claim to recover an authored frame that the source no longer contains.

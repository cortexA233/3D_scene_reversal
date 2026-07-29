---
status: accepted
---

# Freeze a reference-framed scene evaluation camera set

Full-scene evaluation uses one authored overview camera at `390,190,410` looking at `80,26,-20` with a 58-degree vertical field of view, one top-down layout camera, and four opposing oblique cameras, all frozen from Authored Reference world-space evidence and never reframed from the Procedural Replacement. Every blocking render uses the `1440x810` Normative Scene Capture at device scale factor 1 under Three.js r170. A single overview would preserve the intended composition but hide placement and silhouette errors behind occlusion, while candidate-fitted views would invalidate parity evidence; distant geometry is additionally evaluated by a 360-degree world-space Horizon Profile from the fixed Scene Anchor at `[86,26,-24]`.

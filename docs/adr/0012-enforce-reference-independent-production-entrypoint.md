---
status: accepted
---

# Enforce a reference-independent production entrypoint

Every first-tranche object and the Lab replacement set must run through a production-style entrypoint whose import graph contains no GLB, Draco, texture, image, vector-art, material-asset, or ground-truth loaders. Its build excludes every ready-made artistic asset regardless of whether it is an Authored Reference, stock asset, generated asset, or encoded derivative, together with source-node identifiers, manifests, render passes, and measurement artifacts. Three.js and approved code dependencies are bundled locally, all network access is blocked with an empty cache during the acceptance test, and static checks reject artistic asset paths, oversized typed arrays, base64 blobs, sampled constants, and other attempts to disguise sampled appearance or geometry as code. A separate Evaluation Harness entrypoint may load Authored References as read-only ground truth and compare them with the same replacement modules, but asset bytes and sampled derivatives may never flow into an Object Generator, and production code may never import back into the reference toolchain.

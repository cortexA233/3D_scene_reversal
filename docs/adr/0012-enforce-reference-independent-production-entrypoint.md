---
status: accepted
---

# Enforce a reference-independent production entrypoint

Every first-tranche object and the Lab replacement set must run through a production-style entrypoint whose import graph contains no GLB, Draco, texture, or ground-truth loaders and whose build excludes Authored Reference files, source-node identifiers, manifests, render passes, and measurement artifacts. Three.js and approved code dependencies are bundled locally, all network access is blocked with an empty cache during the acceptance test, and static checks reject authored asset paths, oversized typed arrays, base64 blobs, and sampled constants. A separate Evaluation Harness entrypoint may load the Authored References and compare them with the same replacement modules, but production code may never import back into the reference toolchain.

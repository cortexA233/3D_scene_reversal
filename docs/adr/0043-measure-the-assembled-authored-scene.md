---
status: accepted
---

# Measure the assembled authored scene

The ready Assembled Authored Scene under the Frozen Observation Clock is the sole authority for final world transforms, visibility, geometry, materials, lights, procedural environment, and overrides used by Scene Measurement. Raw GLB, heightfield, wildlife, and layout-override files remain useful development evidence for semantic identification and cross-checking, but any disagreement is reported and resolved in favor of what the immutable reference application actually assembles and renders; this prevents an offline extractor and the live runtime from silently applying different transform semantics.

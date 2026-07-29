---
status: accepted
---

# Use a human-anchored compact geometry baseline for Mushroom

The hash-frozen Mushroom compact candidate at `a91fc67` uses one shared
Catmull–Rom stem and bell-cap generator for five Repeated Organic Forms. It
passes every nonvisual budget but fails the pre-calibrated category-v1 geometry
gate at mean/worst silhouette IoU `0.83110/0.77453`. Category v1 remains a
historical FAIL and is not edited.

The user subsequently authorized looser similarity thresholds. Mushroom may
therefore use a separately versioned, explicitly candidate-informed compact
geometry v2 positive anchor. The unchanged category-v1 bounds metrics remain
hard. Relaxed silhouette and depth limits are hard only if every pre-existing
reference-side `must-reject` geometry control in Stage 2 precalibration still
rejects the combined gate. Exact-position appearance is handled independently
by measured cap/stem Semantic Material Role Coverage.

This is a Human-anchored Compact Geometry Baseline, not a candidate-independent
Calibration Bracket or a Quarantined Rebaseline. The positive source, v2
baseline, and semantic variants are hash-bound; v1 and v2 reports remain
versioned evidence. Later candidates cannot inherit or further loosen it
without a new ADR, positive version, and destructive-control proof.

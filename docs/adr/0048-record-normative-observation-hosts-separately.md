---
status: accepted
---

# Record normative observation hosts separately

Immutable Reference Observation is recorded per normative host — the combination of OS, browser, and rasterizer backend — with one authoritative profile that a non-authoritative host may never rewrite. A second host must reproduce every fact the Assembled Authored Scene determines exactly, including all seven state digests, the Scene Render Contract, and the frozen Scene Evaluation Camera Set, and it must be repeatable within the unchanged same-host bounds; only native appearance carries the separately versioned `cross-host-observation-contract-v1` envelope, which keeps the mean-channel, standard-deviation, and histogram limits at their same-host values and widens only the perceptual difference hash. Treating one machine's software rasterizer as universal would misreport a SwiftShader backend change as reference mutation, while re-freezing the authoritative profile on whichever machine happens to run would erase the original evidence; the cross-host perceptual bound is therefore justified by measured backend drift and a calibration control in which declared appearance damage still fails, never by a candidate result.

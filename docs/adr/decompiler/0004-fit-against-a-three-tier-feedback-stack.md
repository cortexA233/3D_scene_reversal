---
status: accepted
---

# Fit against a three-tier feedback stack

Parameter fitting needs tens to hundreds of scored iterations per structure candidate, and the
Native GPU Visual Gate required by
[ADR-0019](../0019-require-native-cross-browser-gpu-visual-gates.md) costs seconds to tens of seconds
per pass, so it cannot be the inner-loop signal. Because `tools/evaluation/visual-metrics.mjs`
accepts plain RGBA buffers rather than a renderer, the Decompiler Program introduces a project-owned pure-JavaScript
triangle rasterizer that produces silhouette, depth, and normal buffers on the CPU and feeds the
existing metric functions and thresholds unchanged. Fitting therefore runs three tiers: analytic
measurements drive coarse search, CPU-rasterized geometry views drive fine search, and the native
cross-browser gate runs only on candidates that already pass the cheap tiers, under a hard cap on
browser passes.

A CPU rasterizer is viable here only because of the project's own compactness constraint: accepted
replacements are 672 to 5,336 triangles, reference-side buffers are rasterized once and cached, and
the inner loop uses progressive resolution — few views at low resolution for coarse search, the full
twelve-view `CAPTURE_SIZE` protocol only for final scoring. Beam candidates are rasterized in
parallel with Node's built-in `worker_threads`. The rejected GPU alternatives each fail on a stated
invariant rather than on speed: pixel readback moves roughly 38 MB per evaluation and is slower than
the CPU path; computing metrics on the GPU would require reimplementing every metric in GLSL and
calibrating its equivalence to the JavaScript implementation, which reintroduces the two-different-
rulers problem this stack exists to remove; and native GL bindings violate the zero-native-dependency
rule in [DECOMP-0005](./0005-ship-the-decompiler-as-a-harness-neutral-package.md).

## Consequences

Appearance cannot descend to the CPU tier, because a Bounded Semantic Pattern Program executes as a
shader. Appearance is therefore solved analytically from reference-side statistics rather than by
iterative search, which is the reason
[ADR-0035](../0035-use-semantic-material-roles-for-procedural-mottling.md)-style material-role
evidence becomes the primary appearance path rather than an exception. The CPU rasterizer and the
GPU differ, so Phase A must quantify that divergence on the eight regression units and declare a
tolerance before any fitting result is trusted; an unquantified inner loop is optimising an unproven
ruler. Phase A must also publish measured wall-clock cost per fitting iteration and per unit
alongside that tolerance, because the choice of a CPU rasterizer rests on an estimate that only
measurement can confirm; exceeding the declared budget is evidence for revisiting the backend, not
grounds for weakening the gate. The rasterizer is byte-stable across platforms, which makes the inner loop more reproducible
than a GPU-based one would be.

---
status: accepted
---

# Separate reference-guided reconstruction from frozen acceptance

Development is organized around a strictly read-only Reference Access Module, a writable Scene Reconstruction Module that measures and fits production-safe Recipe or generator changes, the production Scene Generation Module, and a read-only Scene Acceptance Module that applies frozen baselines to freshly generated output; a replacement-only composition root imports only the Recipe and generation path. Reconstruction and Acceptance may share metric implementations and both may directly read the immutable reference through its adapter, but Acceptance cannot modify the Recipe, generators, or candidate, so every reference-guided correction must be persisted and reproduced through the asset-free production entrypoint before it can affect a passing report.

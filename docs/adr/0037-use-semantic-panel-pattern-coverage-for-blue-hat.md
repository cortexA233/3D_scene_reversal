---
status: accepted
---

# Use semantic panel-pattern coverage for Blue Hat

Blue Hat's compact profiled shell reproduces the reference geometry closely,
but its analytic resolution-independent panel and motif program does not copy
authored texels at identical image positions. The category-v1 appearance FAIL
remains historical evidence. A separately versioned semantic appearance v2
retains the unchanged category-v1 geometry, roughness, and metalness gates while
making exact-position DeltaE, SSIM, and palette clustering diagnostic.

The hard appearance boundary is bounded Semantic Material Role Coverage for the
black brim, dark panels, light panels, and motif ink. The hash-frozen positive
must pass, while deleting the brim, flattening the alternating panel system,
deleting motif ink, or rotating the role palette must reject with geometry still
passing. This is an object-specific application of ADR-0035's complex
procedural-appearance boundary, not a general discount for textured objects and
not a change to the frozen category-v1 thresholds.

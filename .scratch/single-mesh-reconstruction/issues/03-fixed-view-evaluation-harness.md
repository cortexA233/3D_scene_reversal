# 03 — Fixed-view Evaluation Harness

**What to build:** Deliver a development-only Evaluation Harness that places one Authored Reference and one Object Generator result into the same reference-derived comparison conditions, captures the fixed twelve-view pass set, and supports direct visual diagnosis without ever reframing the replacement independently.

**Blocked by:** 01 — Reference-Independent Object Generator probe; 02 — Ground Truth Extractor.

**Status:** resolved

- [x] Construct each Reconstruction Unit from one Authored Reference and one generated semantic root while keeping authored loading out of the replacement import graph.
- [x] Derive the comparison transform only from the Authored Reference: preserve the Reconstruction Frame, normalize its largest bounding-box dimension to seven canonical units, and apply that exact transform to the replacement.
- [x] Use 512-by-512 captures and a perspective camera with a 38-degree vertical field of view.
- [x] Capture eight views at 20-degree elevation and azimuths 0, 45, 90, 135, 180, 225, 270, and 315 degrees.
- [x] Capture four views at 60-degree elevation and azimuths 45, 135, 225, and 315 degrees.
- [x] Target the reference canonical bounding-box center and derive distance and clipping planes from its bounding sphere with the specified ten-percent framing margin.
- [x] Reuse identical camera matrices, transform, clipping planes, renderer, resolution, tone mapping, lighting, and pass definitions for reference and replacement.
- [x] Capture neutral-material RGB, binary silhouette, linear depth, world normal, semantic/object ID, unlit albedo, and frozen-lighting RGB with documented encodings.
- [x] Provide reference, replacement, overlay, difference, and individual-pass preview modes backed by the same captures used for automated evaluation.
- [x] Emit a schema-versioned capture manifest containing Reconstruction Unit ID, view IDs and poses, pass definitions, reference-derived framing data, renderer configuration, and environment metadata.
- [x] Include protocol tests that fail if a replacement is independently centered, normalized, clipped, lit, or framed.
- [x] Keep interactive orbit/focus behavior diagnostic only; it must not affect fixed captures or acceptance evidence.

## Answer

Implemented a development-only Evaluation Harness with a deep four-operation interface: capture one pass, capture the fixed protocol, render a diagnostic preview, or dispose. Reference loading and canonical framing remain on the evaluation side; the replacement is imported through the retained production Object Generator seam and is never independently centered, normalized, or reframed.

The versioned protocol fixes 512-by-512 RGBA8 captures, a 38-degree perspective camera, the accepted eight low and four high views, reference-derived bottom-center/scale/target/bounding-sphere framing, and seven documented passes. The page provides Reference, Replacement, Overlay, Difference, and split Pass Preview modes and can download the machine-readable manifest.

`npm run accept:ticket-03` runs twenty-one unit/protocol tests, verifies ground-truth freshness and replacement offline behavior, and performs a network-blocked Chrome capture of all 168 reference/replacement view-pass combinations. Every capture has the expected 1,048,576-byte payload and checksum, and the browser requested only localhost resources. Manual browser inspection verified Overlay and Difference/Silhouette rendering with no application warnings or errors.

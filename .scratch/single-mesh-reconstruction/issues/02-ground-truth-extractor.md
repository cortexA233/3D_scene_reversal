# 02 — Ground Truth Extractor

**What to build:** Create a development-only Ground Truth Extractor that turns each of the eight selected Authored References into a versioned, machine-readable evidence report. It automates object-independent measurements while leaving representation choice, semantic profile selection, and generator authoring to the human-guided Scene Decompiler Workflow.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Resolve exactly one selected authored mesh for each of the eight Reconstruction Units and record the mapping used by the development tool.
- [x] Record the source transform, whether placement appears baked into geometry, world-space bounds, world-space bottom-center, original scene scale, and the derived Reconstruction Frame.
- [x] Record source and welded vertex counts, triangle count, connected-component count, boundary-edge count, and non-manifold-edge count.
- [x] Record surface area for valid geometry and volume only when the mesh is closed and suitable for a meaningful signed-volume calculation; otherwise record why volume is unavailable.
- [x] Record material base color, roughness, metalness, and authored texture presence, dimensions, and encoded byte size without retaining texture pixels in production-facing data.
- [x] Preserve decoded vertices, indices, normals, UVs, source-node identifiers, dense samples, and intermediate analysis strictly behind the ground-truth/development boundary.
- [x] Emit deterministic, schema-versioned machine-readable output and a concise human-readable summary for all eight references.
- [x] Make malformed geometry, ambiguous source-node matches, missing attributes, or invalid material evidence explicit rather than silently substituting guesses.
- [x] Verify with small closed, open, disconnected, and non-manifold fixtures that topology classification and conditional volume reporting are correct.
- [x] Demonstrate that no production module imports the extractor or its generated evidence artifacts.
- [x] Do not implement automatic primitive, profile, repetition, or operation-tree inference in this ticket.

## Answer

Implemented a development-only GLB/Draco extractor using version-locked glTF Transform and Draco packages for decoding, with project-owned topology analysis for measurements. It emits a deterministic `single-mesh-ground-truth-v1` report covering all eight selected nodes, source/world transforms and baked-placement evidence, Reconstruction Frames, bounds, source/welded vertices, triangles, components, boundary/non-manifold edges, area, closed-only volume, PBR factors, and texture metadata without texture pixels.

The generated report is 33,693 bytes and contains no decoded vertex, index, normal, UV, or sampled arrays. Its object evidence agrees with the investigative baseline, including Bamboo Shoot's 17 components and 60 boundary edges and Umbrella's 76 components. `npm run accept:ticket-02` runs fifteen tests and then decodes the Authored Reference again to verify that the checked-in report is byte-current. Static inspection confirms the production replacement modules import neither the extractor dependencies nor its evidence artifact.

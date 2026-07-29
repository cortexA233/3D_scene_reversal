---
status: accepted
---

# Build purpose-built generators before a modeling DSL

The first reconstruction tranche uses Three.js primitives and project-owned, purpose-built Object Generators: compact footprint extrusion for Stone Path, deterministic polyhedral deformation for Stone, profile lathe construction for Vase, and radial part composition for Umbrella. Shared geometry helpers are extracted only after the same operation is needed by at least two generators; an operation tree is reconsidered only after several shape classes repeat the same composition language, and CSG, SDF, a general mesh kernel, or a third-party Runtime Kernel require object-level evidence that direct generation is inadequate. OpenSCAD, libfive, Sverchok, geonodes, and fogleman/sdf are architecture or development-tool references rather than first-tranche Production Runtime dependencies.

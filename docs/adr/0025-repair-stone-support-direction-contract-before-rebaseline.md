---
status: accepted
---

# Repair Stone's support-direction contract before rebaseline

The Stage 1.5 Stone artifact at commit `6ebb70c` is a Representation Contract
Failure: its fitting tool derives recipe distances for ten plane normals that
differ from the normals used by the production Object Generator to interpret
those same positions. Its recorded v1 metrics remain factual for that artifact,
but they do not prove that the 24-direction Bounded Support-plane Polyhedron
failed as a representation.

Before ADR-0024 may activate, the fitter must consume the production canonical
direction definition, the existing 24 distances may be refitted without adding
directions or parameters, and the corrected candidate must run against the
unchanged v1 visual and nonvisual gates. A v1 pass cancels the Stone rebaseline;
a remaining v1 failure freezes the corrected candidate and activates the
one-time Quarantined Rebaseline. This validity repair does not rewrite the old
negative report and does not count as a third representation.

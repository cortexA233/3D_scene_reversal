---
status: accepted
supersedes: 0036
---

# Reframe the auxiliary evaluation cameras inside the reference's atmosphere

The five auxiliary cameras frozen by ADR-0036 are re-derived to frame the island
rather than the full authored extent, and the camera set is re-frozen as
`reference-camera-set-v2`. The authored overview camera at `390,190,410` looking
at `80,26,-20` is unchanged, as are the `1440x810` Normative Scene Capture, the
58-degree vertical field of view, the Scene Anchor at `[86,26,-24]`, the
360-degree world-space Horizon Profile, and the framing margins themselves. Only
the volume those margins are applied to changes.

ADR-0036 derived the top-down and four oblique cameras from the full authored
world bounds. Those bounds span 2982 by 3365 units because they include the 16
distant horizon ridges, which reach 1400 to 1880 units out while the island
reaches 280. At a 58-degree vertical field of view, framing that volume demands
4868 units of horizontal standoff, which put the four obliques at `y=3127` and
5727 units from their target and the top-down camera at `y=4106`. The reference's
own linear fog ends at 3500 units, so every one of those five cameras stood
outside the atmosphere and recorded the fog colour `0xe6dcc2` instead of the
island. The obliques additionally stood at normalised radius 0.68 to 0.94 inside
a cloud shell whose sprite population begins at 0.25 and whose band reaches
`y=3174.86`, so they stood among the cloud sprites as well.

Measured from the frozen reference observation, the island occupied 10.10 per
cent of the authored overview's frame and 0.10 to 0.31 per cent of the five
auxiliary frames. Two groups were not merely small but absent: `paths` had zero
reference pixels on `oblique-north`, and `wildlife` had zero on `oblique-east`
and `oblique-south`. The reported aggregates of silhouette IoU 0.90 and semantic
agreement 0.867 were therefore dominated by the ocean plane and the sky, which
filled 79 to 94 per cent of those frames, and a per-group IoU of 0 recorded
absence rather than error. This is the metric blind spot the milestone spec warns
about, and the spec forbids resolving it by moving a threshold.

The framing subject is now the Scene Recipe's reference-measured entity layout
with the `horizon` group excluded. The backdrop needs no auxiliary framing
because distant geometry already has a dedicated measurement in the 360-degree
Horizon Profile taken from the Scene Anchor, which ADR-0036 established for
exactly that purpose. The environment layers need no exclusion rule because they
are not entities: the terrain and ocean planes, the sky dome, and the cloud
sprites are declared by the Terrain Program, the Environment Recipe, and the
Distributed Scene Cover populations. The resulting subject spans 559 by 104 by
489 units, which places the obliques 946 units from their target and the
top-down camera 598 units above the anchor, both comfortably inside the fog and
inside the unpopulated core of the cloud shell.

Two bounds are asserted statically against every frozen camera set, both read
from reference-only evidence. The farthest corner of the framing subject must lie
within 0.8 of the fog's far plane, taken from the Scene Render Contract that is
machine-verified against the reference source. The camera and its subject must
both lie inside the cloud shell's unpopulated core at normalised radius 0.25,
taken from the measured cover population, whose innermost sprite sits at 0.2539.
The core is an ellipse and therefore convex, so both endpoints being inside it
puts the whole line of sight inside it. These are necessary conditions only: the
binding evidence remains the measured per-camera island coverage of an actual
reference observation, which is required to reach half the authored overview's
coverage and to leave no group at zero pixels. The authored overview satisfies
both static bounds already, which is what establishes that they are not
arbitrary; a camera displaced 4000 units fails both, which is what establishes
that they bite.

Sprite quads are wide enough, up to 2089 units of half-width, that a sprite
centred just outside the core still overlaps it. The core bound therefore
constrains where a camera stands within the population rather than promising an
empty sky. This is acceptable because the auxiliary geometry passes already
exclude the sky shell and the cloud sprites, and because the coverage evidence
measures what the camera actually sees.

Because the frozen camera set is an input to every downstream threshold, this
migration invalidates the reference observation, the scene passes, and any
calibration derived from them. All of it is re-derived from the reference alone.
Calibrating the fixed-camera and native-appearance gate layers before this
migration would have frozen thresholds against five views that contained no
island, which is why reconstruction ticket 01 is sequenced after it.

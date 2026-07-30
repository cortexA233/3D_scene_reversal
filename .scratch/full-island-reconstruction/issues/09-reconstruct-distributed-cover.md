# 09 - Reconstruct Distributed Scene Cover

**What to build:** Place the rock, pebble, grass, and cloud populations in their measured regions at their measured densities so ground and sky cover stops being effectively absent.

**Blocked by:** 03 - Fit terrain elevation and the shore profile.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until each population's region occupancy and density ratio are inside their thresholds.
- [ ] Fit each population's region shape, centre, and extent from the reference's own instanced bounds rather than from an inscribed ellipse.
- [ ] Settle ground populations on the generated terrain and keep sky populations in their measured shell.
- [ ] Compare by population identity, region occupancy, density, count, scale and orientation distribution, and neighbourhood statistics, never by instance pairing.
- [ ] Keep the cloud population's visible contribution consistent with the atmosphere work.
- [ ] Report per-population evidence with the worst population retained.
- [ ] Keep instancing within the draw-call budget.

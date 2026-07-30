# 13 - Stabilise the dynamic environment

**What to build:** Make every declared dynamic moment produce a repeatable capture, so animation cannot make evidence unstable.

**Blocked by:** 04 - Reconstruct the Ocean Appearance Surface; 12 - Reconstruct Semantic Lights and emissive sources.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until repeated captures at each declared moment agree within reference repeatability.
- [ ] Drive every animated element from the Frozen Observation Clock rather than from wall-clock time.
- [ ] Capture the primary moment and both declared dynamic moments for both subjects.
- [ ] Prove no generator reads time, device state, or GPU results.
- [ ] Report per-moment evidence and the worst moment.

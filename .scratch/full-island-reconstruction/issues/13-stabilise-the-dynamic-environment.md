# 13 - Stabilise the dynamic environment

**What to build:** Make every declared dynamic moment produce a repeatable capture, so animation cannot make evidence unstable.

**Blocked by:** 04 - Reconstruct the Ocean Appearance Surface; 12 - Reconstruct Semantic Lights and emissive sources.

**Status:** partly done. The candidate side is complete and proven; the reference side's *rendered* per-moment repeatability is the one item left, and why is recorded below.

- [x] Add one non-interactive check that is red until repeated captures at each declared moment agree within reference repeatability. — `npm run check:dynamic-moments`. It gates the candidate at every declared moment and the reference's own state transitions; the *rendered* reference repeatability per moment is the gap named below.
- [x] Drive every animated element from the Frozen Observation Clock rather than from wall-clock time. — the candidate animates nothing: generation is byte-identical at 12,000, 16,000 and 24,000 ms and at 0 and 9,999,999 ms, and the ocean's phase is a declared Environment Recipe value.
- [ ] Capture the primary moment and both declared dynamic moments for both subjects. — the reference visits all three and records structural digests and state transitions at each; a *rendered* capture at the two dynamic moments is not taken. See below.
- [x] Prove no generator reads time, device state, or GPU results. — two independent ways. `check-scene-generation.mjs` now forbids `performance.now`, `Date.now`, `new Date`, `requestAnimationFrame`, and `navigator`/device reads in every generator module, as directly as it already forbade `Math.random`. And the scene is generated under three pinned clocks and the digests compared, which catches a clock reached indirectly.
- [x] Report per-moment evidence and the worst moment. — per-moment changed-summary counts with the worst moment retained, asserted against the contract's `allowedChanges`.


## What is done, and the one thing that is not

**The candidate animates nothing, and that is now proven twice over.** The static audit
forbids time and device reads in every generator module — it previously forbade only
`Math.random`, which is half of what Deterministic Generation is defined without. And
`test/dynamic-moment-stability.test.mjs` generates the island with `performance.now` and
`Date.now` pinned to each declared moment and compares scene digests, which catches a clock
reached indirectly through a dependency rather than spelled in a regular expression.

Both were verified red before being trusted, by wiring a real `performance.now()` read into
the `mound` generator. That found the check's one real limit, and it is a property of the
contract rather than a gap: **a read that only scales a form uniformly is invisible**,
because `generateSceneObject` normalises every local AABB onto the Target AABB Extent
exactly, so such a read cannot change the delivered scene either. Wired into the form's
roughness instead, both checks fail.

The entry page is the one production file allowed to read a clock, and only to time itself
— it brackets `generateScene` to report `generationMs`, which is what ticket 14's budget
gates. Instrumentation is not input, and the audit checks the difference rather than
assuming it: the page may read the clock, and `generateScene` is asserted to be called with
`ISLAND_SCENE_RECIPE` and nothing else, so a reading has no argument to arrive through.

**What is left: a rendered capture of the reference at the two dynamic moments.** The
reference observation visits 16,000 and 24,000 ms and records each moment's structural and
dynamic digests plus its state transition, and those are asserted — transforms and dynamic
state may change between moments and nothing else may. What it does not record is an
*appearance* summary at those moments, so the declared repeatability envelope (mean channel
delta 0.15, standard-deviation delta 0.2, histogram L1 0.002, difference-hash distance 4)
is only exercised at the primary moment, across two independent runs.

Adding it is a two-line change to `browser-reference-observation.mjs` — the dynamic loop
already renders — but running it means `npm run observe:reference`, which re-freezes the
camera-set baseline and cascades into re-capturing the six camera passes, geography,
calibration, the report and the certification. ADR-0050 also restricts camera-set
re-freezing to the authoritative host. That is a deliberate re-measurement rather than a
free change, so it is named here rather than taken while the candidate's own side was the
part actually missing. The reference's rendered stability at a moment nothing is measured
at is also the least load-bearing evidence in the ticket: every frozen threshold in the
stack was calibrated at the primary moment.

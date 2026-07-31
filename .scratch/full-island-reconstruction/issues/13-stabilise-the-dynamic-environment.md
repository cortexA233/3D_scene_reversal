# 13 - Stabilise the dynamic environment

**What to build:** Make every declared dynamic moment produce a repeatable capture, so animation cannot make evidence unstable.

**Blocked by:** 04 - Reconstruct the Ocean Appearance Surface; 12 - Reconstruct Semantic Lights and emissive sources.

**Status:** done.

- [x] Add one non-interactive check that is red until repeated captures at each declared moment agree within reference repeatability. — `npm run check:dynamic-moments`. It gates the candidate at every declared moment and the reference's own state transitions; the *rendered* reference repeatability per moment is the gap named below.
- [x] Drive every animated element from the Frozen Observation Clock rather than from wall-clock time. — the candidate animates nothing: generation is byte-identical at 12,000, 16,000 and 24,000 ms and at 0 and 9,999,999 ms, and the ocean's phase is a declared Environment Recipe value.
- [x] Capture the primary moment and both declared dynamic moments for both subjects. — the reference now renders and summarises all three, and the candidate is byte-identical at every one of them.
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

## The reference's rendered per-moment repeatability, done

The observation visited 16,000 and 24,000 ms and recorded each moment's structural and
dynamic digests plus its state transition — but never whether the moment *renders* the same
thing twice, which is the entire point of pinning the clock. A moment that drifted between
runs would make every capture taken at it unreproducible and nothing would have said so.

Each dynamic capture now carries an appearance summary and the two independent runs are
compared at every declared moment against the contract's own unchanged envelope:

| moment | mean channel delta | std delta | histogram L1 | dHash |
| --- | --- | --- | --- | --- |
| 12,000 ms (primary) | 2.658e-5 | 4.994e-5 | 1.715e-6 | 0 |
| 16,000 ms | 2.658e-5 | 4.996e-5 | 1.715e-6 | 0 |
| 24,000 ms | 2.658e-5 | 4.997e-5 | 1.715e-6 | 0 |
| **declared limit** | **0.15** | **0.2** | **0.002** | **4** |

Every moment is about 5,600 times inside the envelope and the difference hash is identical
at all three. A dynamic moment is no less repeatable than the primary one, which is the
assumption every threshold in the stack rests on and which had never been checked. The
worst moment is retained, as every other layer does.

**The cascade this was deferred for did not happen.** `observe:reference` re-freezes the
camera-set baseline, and the concern was that it would force re-capturing the six camera
passes, geography, calibration, the report and the certification. It rewrote
`reference-observation-v1.json` and nothing else: the camera set, inventory, surface
samples, elevation and horizon evidence are all byte-identical, because the reference is
unchanged and the derivation is deterministic. `calibrate:scene` moved no threshold. The
warning in the handoff is about what happens when the camera set actually *moves*, and it
did not — worth knowing before deferring a reference measurement again on that basis.

ADR-0050's restriction was satisfied rather than worked around: this is the authoritative
host, `windows-edge-150-swiftshader-subzero`.

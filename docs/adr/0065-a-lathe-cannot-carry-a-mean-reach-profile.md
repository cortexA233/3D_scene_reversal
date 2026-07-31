---
status: accepted
---

# A lathe cannot carry a mean reach profile

The Axial Layer Family — one revolved surface through a measured radius profile — is an
accepted representation, and six kinds are built with it. Fitting the two largest
vegetation kinds the same way failed, and the reason turned out to be a property of the
representation rather than of the vegetation. It is recorded here because it applies to
every kind already using it.

## The arithmetic

Three things are each individually right and jointly impossible:

- `reach[decile]` is a **mean** horizontal half-extent, as a fraction of the entity's own
  box. That is what `measure-architecture-massing.mjs` measures, for both subjects,
  through one sampler.
- The Target AABB Extent contract scales a generated form's AABB onto the box **exactly**.
- A lathe puts every sample in a decile at **one** radius, so its mean reach and its
  maximum are the same number.

So a lathe's widest ring always lands on the box, and the realised profile comes out as
`reach[decile] / max(reach)` — the whole shape inflated by `1 / max(reach)`. A lathe can
reproduce a measured mean-reach profile only when `max(reach)` is already 1, which is to
say only for a subject that is itself a surface of revolution.

## It is visible in every kind already built this way

Candidate peak reach, against the subject's:

| kind | authored max | candidate max | inflation |
| --- | --- | --- | --- |
| pavilion | 0.6990 | **1.0000** | 1.431 |
| shop-sign | 0.7826 | **1.0000** | 1.278 |
| pavilion-single | 0.7188 | 0.9068 | 1.262 |
| shop-stall | 0.7824 | 0.9497 | 1.214 |
| lantern | 0.8358 | 0.9202 | 1.101 |
| fruit-shop | 0.8295 | 0.9094 | 1.096 |
| npc-statue | 0.8431 | 0.8870 | 1.052 |

The candidate lands between 0.887 and 1.000 whatever the subject reads, which is the
signature of a form pinned to its own box rather than of seven independent fitting errors.
Kinds built some other way do not do this: `umbrella` reads 0.994 of its subject,
`wish-tree` 0.985, `swing-tree` 0.854, `bamboo-bed` 0.813.

The inflation is worst exactly where the subject is least like a solid of revolution, so
the representation is least accurate on the kinds it was least suited to — and its error
is invisible in the profile comparison, which is the shape it does reproduce.

## What was tried on the vegetation, and what each attempt measured

`palm` and `blossom` are 18.7 and 11.6 per cent of the scene's surface error over 289
entities, and both were hand-authored constants that had never been compared with their
subjects. Measured, both are the wrong shape: the authored palm carries its mass evenly up
its whole height, 9.3 per cent in the base decile against 8.9 in the top and nothing above
15.9, at a radius drifting only from 0.68 to 0.36 — while the candidate put **49 per cent
of its mass in the top two deciles** and 3.2 in the base, on a needle of 0.16 that bulged
to 0.88 at the fourth decile.

Every attempt is on the gate metric, `correspondence.surface.p95.mean` per kind:

| | palm | blossom | aggregate |
| --- | --- | --- | --- |
| hand-authored (kept) | **5.4020** | **3.9350** | **6.7228** |
| pure lathe | 8.3360 | 4.3750 | 7.4909 |
| lathe + tips to the box, 8 blades at 0.09 | 6.7270 | 3.7697 | 6.9975 |
| lathe + tips, 6 blades at 0.04 | 7.0560 | 3.8427 | 7.0883 |
| lathe + tips, default 20-side plan | — | 3.9692 | 6.7295 |

**All of it is reverted.** The generator is byte-identical to what it was, and
`scene-correspondence-v1.json` re-measures 6.7228.

Three things the numbers say that the reasoning did not:

**Tips that reach the box are not scaffolding.** Giving the form a bounded set of blades
running out to the box edge lets the lathe body sit at the measured radius instead of the
inflated one, and it recovered most of the loss. The obvious follow-on — that tips exist
only to set the AABB and so should carry as little area as possible — is wrong: narrowing
them from 0.09 to 0.04 and dropping eight to six moved **both** kinds the wrong way. A tip
carries surface the reference has there.

**The one apparent gain was an artefact.** `blossom` at 3.7697 against a hand-authored
3.9350 was the only improvement found. It came at an eight-sided plan, and this repository
already requires a canopy to carry 600 triangles — a crown of sparse facets reads as sticks
at overview distance however well its profile fits. That requirement predates the lathe and
is not a fitting ticket's to relax. At the plan that satisfies it, blossom reads 3.9692 and
is a regression. The eight-sided gain was not a better shape: an octagon's edge midpoints
sit at `0.924r` while its vertices set the AABB, so the plan under-fills its own box by
about three per cent — the same inflation defect, accidentally and partially cancelled by
coarsening the plan. Banking it would have been banking a rounding error as a fit.

**Fixing the vertical distribution was not enough to pay for the radial cost.** The lathe
did reproduce the even mass distribution, which was the largest measured defect. It still
lost, because the inflation is a whole-form error and the mass distribution is a
redistribution within the form.

## What this does not say

It does not retire the Axial Layer Family. For the six kinds using it the alternative on
offer was a stack of primitives, which ADR-0055 measured as worse on the rendered gates for
reasons this does not touch — a lathe has no seams. The inflation is a cost those kinds are
paying and it is now quantified rather than unknown, which is the change.

It does not say vegetation is at a representation boundary. `palm` remains the wrong shape
against a well-sampled subject — 156 placements, the best-sampled profile on the island —
and the residual is generator form, not a recorded limit. What is recorded is that the
lathe is not the route, and why, so the next attempt does not spend itself rediscovering
the same three multiplications.

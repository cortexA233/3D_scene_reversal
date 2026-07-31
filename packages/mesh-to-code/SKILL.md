---
name: mesh-to-code
description: Reverse one mesh file into a Code-only Three.js Procedural Replacement with reproducible acceptance evidence and a machine-enforced Reconstruction Tier. Use when asked to turn a model into a generator program rather than to load it as an asset.
---

# mesh-to-code

Reverse one mesh into executable geometry code. The deterministic kernel owns
the loop, the budget, the gates, and every numeric decision. You answer discrete
structural questions the kernel cannot answer from geometry alone.

You influence **where the search goes**. You never influence **what passes**.

## How you interact with it

Two capabilities only: run a command, and read or write a file. Nothing else is
assumed about your environment.

```
mesh-reverse run --input <mesh> --out <dir>
```

The command either finishes, or stops and asks you one question.

| Exit code | Meaning | What to do |
| --------: | ------- | ---------- |
| `0` | Complete. `<dir>/runtime/` holds the emitted code, `<dir>/evidence/` holds the tier. | Read `evidence/evidence.json`. |
| `2` | Suspended at a Decision Point. | Answer it, then rerun with `--resume`. |
| `3` | Emission withheld by a contract violation. | Read `evidence/evidence.json` for the classified diagnosis. |
| `4` | Your decision failed its schema. The loop did not advance. | Fix the decision file and rerun with `--resume`. |
| `1` | Usage or input error. | Read the message on standard error. |

## Answering a Decision Point

On exit code `2`, read `<dir>/state/pending-decision.json`. It contains:

- `decisionPoint` — which of the four questions is being asked;
- `question` — the question in prose;
- `evidence` — the mechanical measurements, always numeric;
- `responseSchema` — the exact schema your answer must satisfy;
- `imagery` — optional preview paths. Always answerable without them.

Write `<dir>/state/decision.json`:

```json
{
  "schemaVersion": "mesh-to-code-decision-v1",
  "runId": "<copy from the pending decision>",
  "round": 0,
  "decisionPoint": "unit-division",
  "response": { "units": [{ "unitId": "unit-0", "components": [0, 1] }] },
  "decider": { "kind": "your-identifier" }
}
```

Then rerun the same `run` command with `--resume` added.

A schema-invalid decision is rejected and the loop stays where it was, so a
malformed answer costs a retry and never corrupts a result.

## The four Decision Points

| Decision Point | What you are choosing | Response schema |
| -------------- | --------------------- | --------------- |
| `unit-division` | How components divide into Reconstruction Units. Five separated mushroom forms are one unit; a table and a cup are two. Geometry alone cannot tell them apart. | `schemas/response.unit-division.schema.json` |
| `semantic-grouping` | Which recomputable candidate grouping is the semantic one. | `schemas/response.semantic-grouping.schema.json` |
| `structure-proposal` | Which mutually dissimilar operator compositions the next search round tries. | `schemas/response.structure-proposal.schema.json` |
| `operator-authoring` | Whether to author a new operator after a measured library-only geometry-gate failure. | `schemas/response.operator-authoring.schema.json` |

Prefer structural diversity over re-proposing one structure with different
numbers: continuous parameters are fitted numerically and are not yours to set.

`operator-authoring` is only ever asked after the library-only search has already
failed this unit's geometry gate, and the pending evidence carries that recorded
failure. An authored operator must be a Contract Operator — pure, deterministic,
asset-free, with a declared parameter signature. One that is not gets composed in
anyway and then withholds emission, so authoring a violating operator produces a
diagnosis rather than a silent downgrade.

## What you get back

`<dir>/runtime/` — the emitted Procedural Replacement. It loads no asset of any
origin. `three` is injected into `createObject3D` rather than imported, so the
emitted module resolves nothing of its own.

`<dir>/evidence/` — development-only. Read at build time, never shipped.

- `structure-manifest.json` — every discrete decision, bound to a hash.
  Everything downstream of it reproduces bit-for-bit.
- `evidence.json` — the Reconstruction Tier and the per-axis diagnosis.
- `decision-trace.json` — who decided what, and in which round.

## Reconstruction Tier

| Tier | Meaning | Code emitted |
| ---- | ------- | -----------: |
| `accepted` | Every hard gate passed. | yes |
| `below-gate` | Contracts passed; visual fidelity fell short, or an axis was not evaluated. | yes, marked |
| `coarse` | Complexity exceeded the full path; the conservative path was taken. | yes, marked |
| `rejected` | A contract constraint was violated. | no, diagnosis only |

Only `accepted` units are admitted to a formal delivery. The tier is evidence,
not a runtime export: nothing in `runtime/` reports its own certification.

A `below-gate` result is a useful negative result, not a failure to hide. Its
classified diagnosis is the signal for which operator the library is missing.

## Other commands

```
mesh-reverse list --input <mesh>
mesh-reverse decide --out <dir> [--policy simplest-structure]
mesh-reverse emit --manifest <file> --input <mesh> --out <dir>
mesh-reverse fixture --kind lathe-profile --out <file>
```

`run --decider mock` answers every Decision Point with the shipped
simplest-structure policy. Use it to see the whole pipeline without answering
anything, and as the baseline that a real decision has to beat.

`--inline` additionally emits one self-contained file carrying only the
operators the composition actually uses.

`--baseline-stage coarse|fine|final` chooses the resolution the Calibration
Bracket measures at. `final` is the complete twelve-view protocol and the default;
the cheaper stages exist for fast iteration and produce different threshold values,
so a result you intend to keep should be measured at `final`.

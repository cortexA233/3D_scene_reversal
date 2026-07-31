# 15 - Record cross-browser native GPU evidence

**What to build:** Run the native GPU scene gates on every browser available on the host and record the rest as explicit blockers with reproducible commands.

**Blocked by:** 14 - Meet the Production Runtime budgets.

**Status:** the blocker this was carried under was the wrong one. It was never
Firefox and Safari not being installed — it was our own harness forcing SwiftShader
on every launch, so no native GPU gate could have passed however many browsers were
present. This host does have a GPU. See below.

- [x] Add one non-interactive check that records, per browser, either two stable full-protocol runs or an explicit unavailable status. — `npm run check:native-gpu`.
- [x] Record browser, OS, GPU and WebGL renderer, acceleration state, colour configuration, and Three.js revision for every run.
- [x] Reject software rendering for a native GPU gate. — a software run is recorded as `software-rendered`, which is not a pass.
- [x] Do not mark an unexecuted gate as passed under any circumstances. — `unavailable` rows carry zero runs and the check asserts it.
- [x] Save the exact command and expected evidence for each gate that cannot run here.
- [x] Keep the report schema compatible with results added later on other hardware. — one row per browser, keyed by id, with `describeNormativeHost`'s existing `hostKey`.

## The blocker was ours, not the host's

This ticket was carried as blocked on Firefox and Safari not being installed. That
was true and it was not the blocker. `scripts/lib/smoke-local-scene.mjs` passes

    --use-angle=swiftshader --enable-unsafe-swiftshader

on **every** launch, so every browser run in this milestone is software-rasterised —
including the frozen reference observation, whose `hostKey` is
`windows-edge-150-swiftshader-subzero` and whose `acceleration` is `software`. A gate
that rejects software rendering could not have passed on any number of browsers.

Probed directly over CDP, the flags were hiding a real adapter:

| launch | renderer | max texture |
| --- | --- | --- |
| forced swiftshader | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` | 8192 |
| `--use-angle=default` | `ANGLE (Intel, Intel(R) Arc(TM) 140T GPU (16GB) Direct3D11 vs_5_0 ps_5_0, D3D11)` | 16384 |

So `scripts/run-native-gpu-evidence.mjs` runs the Production Runtime under hardware
ANGLE by appending `--use-angle=default` through `browserArguments`, which land after
the harness's own flags and win. **The shared harness is unchanged**, so every
existing gate keeps the SwiftShader determinism its frozen evidence was measured
with.

It deliberately does not pass `--ignore-gpu-blocklist`: a browser that refuses a
blocklisted GPU has told us something, and forcing past it would record hardware the
browser declined to use.

## This does not re-baseline anything

The frozen evidence is a SwiftShader host. A GPU host is a **different host**, not a
better measurement of the same one, so its numbers belong in the cross-host record
that `tools/reference/normative-hosts.mjs` already models and nowhere near a
threshold. Nothing in `scene-quality-baseline-v1` moves because of this ticket.

## Chrome, and what is genuinely still blocked

Chrome was requested and is **not installed** on this host — no binary at any known
path, no `App Paths` registry entry, nothing on `PATH`, and `Program Files/Google`
holds only Play Games. Edge 150 is the Chromium browser that is here, and Chrome
would in any case be the same engine, the same ANGLE and the same adapter, so it
would add a browser row rather than engine diversity.

Firefox and Safari remain genuinely out of reach, and for a reason beyond installing
them: Gecko speaks WebDriver BiDi and WebKit speaks the WebKit inspector protocol,
so the shared CDP harness cannot drive either. Building a BiDi transport is the work;
the install is not the obstacle. Safari additionally needs macOS. Both are recorded
as `unavailable` with the command that would run them.

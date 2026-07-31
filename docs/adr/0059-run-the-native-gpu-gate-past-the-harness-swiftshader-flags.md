---
status: accepted
---

# Run the native GPU gate past the harness's SwiftShader flags

Ticket 15 was carried as blocked on Firefox and Safari not being installed. That was true and it was not the blocker.

`scripts/lib/smoke-local-scene.mjs` passes `--use-angle=swiftshader --enable-unsafe-swiftshader` on **every** launch, so every browser run in this milestone is software-rasterised. The frozen reference observation says so in its own record: `hostKey` is `windows-edge-150-swiftshader-subzero` and `acceleration` is `software`. A gate whose third requirement is "reject software rendering" could not have passed on this host however many browsers were installed, and installing a third Chromium would not have changed a single pixel of the answer.

Probed directly over CDP, the flags were hiding a real adapter:

| launch | renderer | max texture |
| --- | --- | --- |
| forced swiftshader | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` | 8192 |
| `--use-angle=default` | `ANGLE (Intel, Intel(R) Arc(TM) 140T GPU (16GB) Direct3D11 vs_5_0 ps_5_0, D3D11)` | 16384 |

So the native GPU gate asks for the real adapter per run through `browserArguments`, which the harness appends after its own flags and which win because later Chromium flags do. **The shared harness is unchanged.** That matters more than the convenience: every frozen threshold in `scene-quality-baseline-v1` was calibrated through SwiftShader, and a harness-wide switch to hardware would have moved every rendered measurement in the milestone at once while looking like a one-line improvement.

For the same reason this gate re-baselines nothing. The frozen evidence is a SwiftShader host; a GPU host is a **different host**, not a better measurement of the same one. Its numbers belong in the cross-host record `tools/reference/normative-hosts.mjs` already models — which is why the environment record is shaped for `describeNormativeHost` rather than given its own schema — and nowhere near a threshold.

Two deliberate refusals. The gate does not pass `--ignore-gpu-blocklist`: a browser that declines a blocklisted GPU has told us something, and forcing past it would record hardware the browser refused to use. And a software run is recorded as `software-rendered`, which is a fourth status alongside `native-gpu`, `unstable` and `unavailable` — not a pass. `unavailable` rows carry zero runs and the `--check` mode asserts that, because the one thing this ticket must never do is let an unexecuted gate read as green.

What the host reports, over two stable runs: Edge 150 on the Intel Arc 140T through D3D11, 549,629 triangles and 1,810 draw calls, matching the SwiftShader run's counts exactly — which is the useful cross-check, since geometry is generated on the CPU and should not care what draws it.

Chrome was asked for and is not installed: no binary at any known path, no `App Paths` registry entry, nothing on `PATH`. It would also have been the same engine, the same ANGLE and the same adapter as Edge, so it would have added a browser row rather than engine diversity.

Firefox and Safari stay out of reach for a reason beyond installation, and this is the part worth carrying forward: Gecko speaks WebDriver BiDi and WebKit speaks the WebKit inspector protocol, so the shared CDP harness cannot drive either. **Building a BiDi transport is the work; the install is not the obstacle.** Safari additionally needs macOS, which is irreplaceable hardware from here. Both are recorded with the command that would run them once a transport exists.

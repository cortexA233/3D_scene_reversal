# 02 — Native Firefox and Safari GPU visual gates

Type: task
Status: resolved
Blocked by: 01

Add hardware-browser automation and evidence reports for Firefox and Safari. Qualify the path with Stone Path and Vase before new candidates are fitted.

Acceptance:

- [x] Software rendering, SwiftShader, and engine shells are rejected by the gate.
- [x] Reference and replacement are captured fresh within each browser.
- [x] Two stable complete twelve-view runs are retained per object/browser.
- [x] Browser, OS, Three.js, GPU/WebGL renderer, color, and acceleration metadata are recorded for both browsers.
- [x] Stone Path and Vase pass their frozen baselines in Firefox and Safari.
- [x] CPU structure/bounds evidence remains separate.

## Comments

The vendor-WebDriver native, headful gate is implemented. Firefox 153.0.1 on
hardware WebGL 2 completed two checksum-stable fresh runs for Stone Path and
Vase; both frozen v1 baselines pass. Evidence is in
`gt_designer/single-mesh-evaluation/reports/firefox-native-gpu-gates-v1.json`.

Safari 26.2 refuses to create its first vendor WebDriver session until the
user enables Safari Settings > Developer > Allow remote automation. The
official `safaridriver --enable` alternative requires an administrator
password, which the agent cannot enter. Per the strict kill-gate order, Stone
fitting and every later ticket remain intentionally unstarted until this
external setting is enabled and Safari qualification passes.

After the setting was enabled, Safari 26.2 completed the same two fresh,
checksum-stable full-protocol runs for both qualifier objects on hardware
`Apple GPU` WebGL 2. Firefox and Safari qualification are now both green; the
retained Safari evidence is
`gt_designer/single-mesh-evaluation/reports/safari-native-gpu-gates-v1.json`.

## Answer

Firefox 153.0.1 and Safari 26.2 are qualified as native hardware-GPU visual
gate environments. Both passed Stone Path and Vase under the frozen v1
baseline with two stable 12-view × 7-pass reference/replacement repetitions.

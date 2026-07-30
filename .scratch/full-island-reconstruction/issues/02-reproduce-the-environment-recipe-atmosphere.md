# 02 - Reproduce the Environment Recipe's atmosphere

**What to build:** Make the candidate's sky, fog, tone mapping, exposure, and post-processing reproduce the authored look independently, so appearance measurement stops being dominated by a wholesale atmospheric difference.

**Blocked by:** 01 - Calibrate the fixed-camera and native-appearance gate layers.

**Status:** ready-for-agent

- [ ] Add one non-interactive check that is red until the candidate's atmospheric evidence is inside the calibrated appearance thresholds for the sky and geography regions.
- [ ] Reproduce linear fog at the frozen colour and near/far, so distance fades rather than ending at a hard horizon line.
- [ ] Reproduce the sky gradient's zenith and horizon colours and its falloff.
- [ ] Reproduce ACES tone mapping, exposure, and the sRGB output pipeline.
- [ ] Reproduce bloom, warm grading, and vignette with code-generated post-processing, keeping film grain disabled as the contract declares.
- [ ] Keep every value a compact Environment Recipe parameter; retain no captured pixel, gradient table, or sampled curve.
- [ ] Prove the candidate still renders with no reference dependency and no new runtime resource request.
- [ ] Report the appearance change per camera and per Material Family, with the worst camera retained.
- [ ] Confirm no geometry layer regressed.

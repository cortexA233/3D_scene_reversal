---
status: accepted
---

# Freeze the complete scene render contract

`Scene Render Contract v1` versions and machine-verifies every visible observation condition of the Authored Reference, including the full camera projection, Three.js r170 renderer and color pipeline, shadows, global and local lights, fog, sky, ocean, clouds, post-processing, URL options, and Frozen Observation Clock moments. Freezing only the overview camera or three global lights would allow unrelated renderer, point-light, and atmosphere drift to masquerade as material or geometry error; the Procedural Replacement therefore independently reproduces the complete contract and its material result with code-generated content rather than receiving shared evaluation lighting or loading authored textures.

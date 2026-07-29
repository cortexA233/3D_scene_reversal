// Keeps pointer capture aligned with browser gesture and cooldown requirements.
export function bindPointerLock(controls, surface, { enabled = true } = {}) {
  const EXIT_COOLDOWN_MS = 1300;
  let lastExit = -Infinity;

  controls.addEventListener("unlock", () => {
    lastExit = performance.now();
  });

  surface.addEventListener("click", () => {
    if (!enabled || controls.isLocked) return;
    if (performance.now() - lastExit < EXIT_COOLDOWN_MS) return;
    controls.lock();
  });
}

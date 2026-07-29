function assertMoment(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
}

export function createFrozenObservationClockPreload({
  primaryMomentMs,
  dynamicMomentsMs,
}) {
  assertMoment(primaryMomentMs, "primaryMomentMs");
  if (!Array.isArray(dynamicMomentsMs)) {
    throw new TypeError("dynamicMomentsMs must be an array");
  }
  for (const moment of dynamicMomentsMs) assertMoment(moment, "dynamic moment");
  const allowedMoments = [...new Set([primaryMomentMs, ...dynamicMomentsMs])];

  return `(() => {
    const allowedMomentsMs = Object.freeze(${JSON.stringify(allowedMoments)});
    const allowed = new Set(allowedMomentsMs);
    const epochMs = Date.now();
    let momentMs = ${JSON.stringify(primaryMomentMs)};
    const clock = Object.freeze({
      kind: "Frozen Observation Clock",
      source: "browser-preload",
      appearancePatched: false,
      allowedMomentsMs,
      get momentMs() { return momentMs; },
      setMoment(nextMomentMs) {
        if (!allowed.has(nextMomentMs)) {
          throw new RangeError("undeclared observation moment: " + nextMomentMs);
        }
        momentMs = nextMomentMs;
        return momentMs;
      },
    });
    Object.defineProperty(globalThis, "__frozenObservationClock", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: clock,
    });
    Object.defineProperty(performance, "now", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: () => momentMs,
    });
    Object.defineProperty(Date, "now", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: () => epochMs + momentMs,
    });
  })();`;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hex(value) {
  return value.toString(16).padStart(6, "0");
}

export function verifySceneRenderContractRuntime({ runtime, contract }) {
  const expected = contract.renderContract;
  const errors = [];
  const requireEqual = (label, actual, wanted) => {
    if (!same(actual, wanted)) errors.push(label);
  };

  requireEqual("CSS viewport", runtime?.capture?.cssViewport, contract.capture.cssViewport);
  requireEqual("framebuffer", runtime?.capture?.framebuffer, contract.capture.framebuffer);
  requireEqual(
    "device scale factor",
    runtime?.capture?.deviceScaleFactor,
    contract.capture.deviceScaleFactor,
  );
  requireEqual(
    "renderer antialias",
    runtime?.capture?.contextAttributes?.antialias,
    expected.renderer.antialias,
  );
  requireEqual(
    "renderer power preference",
    runtime?.capture?.contextAttributes?.powerPreference,
    expected.renderer.powerPreference,
  );
  requireEqual(
    "renderer tone mapping",
    runtime?.threeRenderer?.toneMapping,
    expected.renderer.toneMapping,
  );
  requireEqual("renderer exposure", runtime?.threeRenderer?.exposure, expected.renderer.exposure);
  requireEqual(
    "renderer output color space",
    runtime?.threeRenderer?.outputColorSpace,
    expected.renderer.outputColorSpace,
  );
  requireEqual(
    "renderer pixel ratio",
    runtime?.threeRenderer?.pixelRatio,
    expected.renderer.pixelRatio,
  );
  requireEqual(
    "shadow enablement",
    runtime?.threeRenderer?.shadows?.enabled,
    expected.shadows.enabled,
  );
  requireEqual("shadow type", runtime?.threeRenderer?.shadows?.type, expected.shadows.type);
  requireEqual(
    "fog",
    runtime?.capture?.fog,
    {
      type: expected.fog.kind,
      color: hex(expected.fog.color),
      near: expected.fog.near,
      far: expected.fog.far,
    },
  );
  requireEqual(
    "composer passes",
    runtime?.composer?.passes,
    expected.postprocessing.passes,
  );
  requireEqual("bloom", runtime?.composer?.bloom, {
    strength: expected.postprocessing.bloom.strength,
    radius: expected.postprocessing.bloom.radius,
    threshold: expected.postprocessing.bloom.threshold,
  });
  requireEqual("grading and vignette", runtime?.composer?.grading, {
    amount: expected.postprocessing.filmGrain.runtimeAmount,
    vignette: expected.postprocessing.vignette.amount,
  });
  requireEqual("global sun", runtime?.environment?.globalLights?.sun, {
    color: expected.globalLights.sun.color,
    intensity: expected.globalLights.sun.intensity,
    castShadow: expected.globalLights.sun.castShadow,
    shadowMapSize: expected.shadows.sunMapSize,
    shadowBias: expected.shadows.sunBias,
  });
  requireEqual(
    "global hemisphere",
    runtime?.environment?.globalLights?.hemisphere,
    expected.globalLights.hemisphere,
  );
  requireEqual(
    "global ambient",
    runtime?.environment?.globalLights?.ambient,
    expected.globalLights.ambient,
  );
  requireEqual(
    "local light count",
    runtime?.environment?.localLightCount,
    expected.localLights.runtimeCount,
  );
  requireEqual("sky", runtime?.environment?.sky, {
    kind: expected.sky.kind,
    zenith: expected.sky.zenith,
    horizon: expected.sky.horizon,
  });
  requireEqual("ocean", runtime?.environment?.ocean, {
    y: expected.ocean.y,
    color: expected.ocean.color,
    sunColor: expected.ocean.sunColor,
    distortion: expected.ocean.distortion,
    alpha: expected.ocean.alpha,
  });
  requireEqual(
    "cloud count",
    runtime?.environment?.cloudCount,
    expected.clouds.count,
  );
  requireEqual("reference URL options", runtime?.urlOptions, contract.reference.urlOptions);
  return errors;
}

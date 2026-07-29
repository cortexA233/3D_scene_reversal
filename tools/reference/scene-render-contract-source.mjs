function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberPattern(value) {
  return Number.isInteger(value)
    ? `${value}(?:\\.0+)?`
    : escapePattern(value);
}

function colorPattern(value) {
  return `0x${value.toString(16)}`;
}

function sourceAssertions(contract) {
  const render = contract.renderContract;
  const { renderer, globalLights, localLights, fog, sky, ocean, clouds } = render;
  const { bloom, grading, vignette, filmGrain } = render.postprocessing;
  const options = render.urlOptions;
  const pattern = (value, flags) => new RegExp(value, flags);
  return [
    [
      "renderer construction",
      pattern(
        `new THREE\\.WebGLRenderer\\(\\{\\s*antialias: ${renderer.antialias},\\s*powerPreference: "${escapePattern(renderer.powerPreference)}",\\s*\\}\\)`,
      ),
    ],
    ["renderer pixel ratio", /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio, 2\)\)/],
    ["renderer tone mapping", pattern(`toneMapping: THREE\\.${renderer.toneMapping}`)],
    ["renderer exposure", pattern(`exposure: ${numberPattern(renderer.exposure)}`)],
    [
      "renderer color space",
      pattern(`renderer\\.outputColorSpace = THREE\\.${renderer.outputColorSpace}`),
    ],
    ["shadow enablement", /renderer\.shadowMap\.enabled = true/],
    ["shadow type", pattern(`renderer\\.shadowMap\\.type = THREE\\.${render.shadows.type}`)],
    [
      "sun contract",
      pattern(
        `sun: \\{ elevDeg: ${numberPattern(globalLights.sun.elevationDegrees)}, azDeg: ${numberPattern(globalLights.sun.azimuthDegrees)}, color: ${colorPattern(globalLights.sun.color)}, intensity: ${numberPattern(globalLights.sun.intensity)} \\}`,
      ),
    ],
    [
      "hemisphere contract",
      pattern(
        `hemi: \\{ sky: ${colorPattern(globalLights.hemisphere.sky)}, ground: ${colorPattern(globalLights.hemisphere.ground)}, intensity: ${numberPattern(globalLights.hemisphere.intensity)} \\}`,
      ),
    ],
    [
      "ambient contract",
      pattern(
        `ambient: ${numberPattern(globalLights.ambient.intensity)},\\s*ambientColor: ${colorPattern(globalLights.ambient.color)}`,
      ),
    ],
    [
      "fog contract",
      pattern(
        `fog: \\{ color: ${colorPattern(fog.color)}, near: ${numberPattern(fog.near)}, far: ${numberPattern(fog.far)} \\}`,
      ),
    ],
    [
      "sky contract",
      pattern(
        `sky: "${escapePattern(sky.kind)}"[\\s\\S]*skyGradient: \\{ zenith: ${colorPattern(sky.zenith)}, horizon: ${colorPattern(sky.horizon)} \\}`,
      ),
    ],
    ["ocean color", pattern(`color: ${colorPattern(ocean.color)}`)],
    ["ocean sun color", pattern(`sunColor: ${colorPattern(ocean.sunColor)}`)],
    ["ocean distortion", pattern(`distortion: ${numberPattern(ocean.distortion)}`)],
    ["ocean alpha", pattern(`alpha: ${numberPattern(ocean.alpha)}`)],
    ["ocean normal map", /TEX_CDN \+ "waternormals\.jpg"/],
    [
      "cloud contract",
      pattern(`clouds: \\{ on: ${clouds.enabled}, count: ${numberPattern(clouds.count)} \\}`),
    ],
    [
      "bloom contract",
      pattern(
        `bloom: \\{ on: ${bloom.enabled}, strength: ${numberPattern(bloom.strength)}, radius: ${numberPattern(bloom.radius)}, threshold: ${numberPattern(bloom.threshold)} \\}`,
      ),
    ],
    [
      "vignette contract",
      pattern(
        `grain: \\{ on: true, amount: ${numberPattern(filmGrain.configuredAmount)}, vignette: ${numberPattern(vignette.amount)} \\}`,
      ),
    ],
    ["film grain disabled", /const GRAIN_NOISE =[^;]+\.get\("grain"\) === "1"/s],
    [
      "grading warm mix",
      pattern(
        `c=mix\\(c, c\\*vec3\\(1\\.04,1\\.015,0\\.97\\)\\+vec3\\(0\\.012,0\\.008,0\\.0\\), ${numberPattern(grading.warmMix)}\\)`,
      ),
    ],
    ["grading gamma", pattern(`c=pow\\(c, vec3\\(${numberPattern(grading.gamma)}\\)\\)`) ],
    [
      "paving default",
      pattern(`const PAVE_VARIANT =[\\s\\S]*?parseInt\\([^;]+\\) \\|\\| ${options.pavingVariant}`),
    ],
    ["lantern default", pattern(`return v == null \\? ${options.lanternMultiplier} :`)],
    ["boulders default", pattern(`boulders: num\\("boulders", ${options.boulders}\\)`) ],
    ["rocks default", pattern(`rocks: num\\("rocks", ${options.rocks}\\)`) ],
    ["pebbles default", pattern(`pebbles: num\\("pebbles", ${options.pebbles}\\)`) ],
    ["shrubs default", pattern(`shrubs: num\\("shrubs", ${options.shrubs}\\)`) ],
    [
      "sun shadow map",
      pattern(
        `sun\\.shadow\\.mapSize\\.set\\(${render.shadows.sunMapSize.join(", ")}\\)`,
      ),
    ],
    ["sun shadow bias", pattern(`sun\\.shadow\\.bias = ${numberPattern(render.shadows.sunBias)}`)],
    ["bloom pass", /new UnrealBloomPass\(/],
    ["grading pass", /new ShaderPass\(/],
    ["output pass", /composer\.addPass\(new OutputPass\(\)\)/],
    [
      "local light source scale",
      pattern(`\\* ${numberPattern(localLights.sourceIntensityScale)} \\* LANTERN_MULT`),
    ],
  ];
}

export function verifySceneRenderContractSource({ source, localLights, contract }) {
  const errors = [];
  if (typeof source !== "string") return ["reference source is not text"];
  for (const [label, pattern] of sourceAssertions(contract)) {
    if (!pattern.test(source)) errors.push(label);
  }

  const expected = contract?.renderContract?.localLights;
  if (localLights?.schema !== expected?.sourceSchema) {
    errors.push("local light source schema");
  }
  if (localLights?.lights?.length !== expected?.sourceCount) {
    errors.push("local light source count");
  }
  return errors;
}

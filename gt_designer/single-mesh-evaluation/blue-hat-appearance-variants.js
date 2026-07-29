const VARIANTS = Object.freeze([
  "delete-brim-role",
  "flatten-panel-system",
  "delete-motif-role",
  "wrong-role-palette",
]);

function rotateRgb(color) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return (green << 16) | (blue << 8) | red;
}

/** Development-only semantic damage controls for Blue Hat appearance v2. */
export function createBlueHatAppearanceVariantRecipe(recipe, variantId) {
  if (!VARIANTS.includes(variantId)) {
    throw new Error(`unknown Blue Hat appearance variant: ${variantId}`);
  }
  const appearance = { ...recipe.appearance };
  if (variantId === "delete-brim-role") {
    appearance.brimColor = appearance.darkPanelColor;
  } else if (variantId === "flatten-panel-system") {
    appearance.lightPanelColor = appearance.darkPanelColor;
  } else if (variantId === "delete-motif-role") {
    // Keep a floating-point GLSL literal while making motif ink visually absent.
    appearance.motifBlend = 0.000001;
  } else {
    appearance.brimColor = rotateRgb(appearance.brimColor);
    appearance.darkPanelColor = rotateRgb(appearance.darkPanelColor);
    appearance.lightPanelColor = rotateRgb(appearance.lightPanelColor);
  }
  return { ...recipe, appearance };
}

export function listBlueHatAppearanceVariants() {
  return [...VARIANTS];
}

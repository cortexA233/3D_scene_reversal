const VARIANTS = Object.freeze([
  "flatten-stone-system",
  "delete-wax-role",
  "delete-wick-role",
  "wrong-role-palette",
]);

function rotateRgb(color) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return (green << 16) | (blue << 8) | red;
}

/** Development-only semantic damage controls for Candle appearance v2. */
export function createCandleAppearanceVariantRecipe(recipe, variantId) {
  if (!VARIANTS.includes(variantId)) {
    throw new Error(`unknown Candle appearance variant: ${variantId}`);
  }
  const appearance = { ...recipe.appearance };
  if (variantId === "flatten-stone-system") {
    appearance.stoneDark = appearance.stoneMid;
    appearance.stoneLight = appearance.stoneMid;
  } else if (variantId === "delete-wax-role") {
    appearance.waxColor = appearance.stoneMid;
  } else if (variantId === "delete-wick-role") {
    appearance.wickColor = appearance.waxColor;
  } else {
    appearance.stoneDark = rotateRgb(appearance.stoneDark);
    appearance.stoneMid = rotateRgb(appearance.stoneMid);
    appearance.stoneLight = rotateRgb(appearance.stoneLight);
    appearance.waxColor = rotateRgb(appearance.waxColor);
    appearance.wickColor = rotateRgb(appearance.wickColor);
  }
  return { ...recipe, appearance };
}

export function listCandleAppearanceVariants() {
  return [...VARIANTS];
}

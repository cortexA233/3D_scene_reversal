const VARIANTS = Object.freeze([
  "delete-cap-role",
  "delete-stem-role",
  "wrong-role-palette",
]);

function rotateRgb(color) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return (green << 16) | (blue << 8) | red;
}

/** Development-only semantic damage controls for Mushroom appearance v2. */
export function createMushroomAppearanceVariantRecipe(recipe, variantId) {
  if (!VARIANTS.includes(variantId)) {
    throw new Error(`unknown Mushroom appearance variant: ${variantId}`);
  }
  const appearance = { ...recipe.appearance };
  if (variantId === "delete-cap-role") {
    appearance.capColor = appearance.stemColor;
  } else if (variantId === "delete-stem-role") {
    appearance.stemColor = appearance.capColor;
  } else {
    appearance.capColor = rotateRgb(appearance.capColor);
    appearance.stemColor = rotateRgb(appearance.stemColor);
  }
  return { ...recipe, appearance };
}

export function listMushroomAppearanceVariants() {
  return [...VARIANTS];
}

const VARIANTS = Object.freeze([
  "delete-sheath-role",
  "wrong-role-palette",
  "flat-single-role",
]);

function rotateRgb(color) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return (green << 16) | (blue << 8) | red;
}

/** Development-only semantic damage controls for Bamboo Shoot appearance v2. */
export function createBambooShootAppearanceVariantRecipe(recipe, variantId) {
  if (!VARIANTS.includes(variantId)) {
    throw new Error(`unknown Bamboo Shoot appearance variant: ${variantId}`);
  }
  const appearance = { ...recipe.appearance };
  if (variantId === "delete-sheath-role") {
    appearance.sheathColor = appearance.coreColor;
  } else if (variantId === "wrong-role-palette") {
    appearance.coreColor = rotateRgb(appearance.coreColor);
    appearance.coreAccent = rotateRgb(appearance.coreAccent);
    appearance.sheathColor = rotateRgb(appearance.sheathColor);
  } else if (variantId === "flat-single-role") {
    appearance.coreAccent = appearance.coreColor;
    appearance.sheathColor = appearance.coreColor;
  }
  return { ...recipe, appearance };
}

export function listBambooShootAppearanceVariants() {
  return [...VARIANTS];
}

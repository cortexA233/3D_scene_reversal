const VARIANTS = Object.freeze([
  "flat-canopy",
  "wrong-role-palette",
  "delete-flower-family",
  "delete-leaf-family",
  "delete-branch-family",
  "half-pattern-coverage",
]);

function rotateRgb(color) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return (green << 16) | (blue << 8) | red;
}

function appearanceCopy(appearance) {
  return {
    ...appearance,
    blossoms: appearance.blossoms.map((entry) => [...entry]),
    leaves: appearance.leaves.map((entry) => [...entry]),
  };
}

/** Development-only semantic damage controls for the human-anchored v3 gate. */
export function createUmbrellaAppearanceVariantRecipe(recipe, variantId) {
  if (!VARIANTS.includes(variantId)) {
    throw new Error(`unknown Umbrella v3 appearance variant: ${variantId}`);
  }
  const appearance = appearanceCopy(recipe.appearance);
  if (variantId === "flat-canopy") {
    appearance.flowerColor = appearance.canopyColor;
    appearance.leafColor = appearance.canopyColor;
    appearance.branchColor = appearance.canopyColor;
    appearance.patternAccentColor = appearance.canopyColor;
    appearance.blossoms = [];
    appearance.leaves = [];
  } else if (variantId === "wrong-role-palette") {
    for (const key of [
      "canopyColor",
      "flowerColor",
      "leafColor",
      "branchColor",
      "patternAccentColor",
    ]) {
      appearance[key] = rotateRgb(appearance[key]);
    }
  } else if (variantId === "delete-flower-family") {
    appearance.blossoms = [];
  } else if (variantId === "delete-leaf-family") {
    appearance.leafColor = appearance.canopyColor;
  } else if (variantId === "delete-branch-family") {
    appearance.branchColor = appearance.canopyColor;
  } else if (variantId === "half-pattern-coverage") {
    appearance.blossoms = appearance.blossoms.filter((_, index) => index % 2 === 0);
    appearance.leaves = appearance.leaves.filter((_, index) => index % 2 === 0);
  }
  return {
    ...recipe,
    appearance,
  };
}

export function listUmbrellaAppearanceVariants() {
  return [...VARIANTS];
}

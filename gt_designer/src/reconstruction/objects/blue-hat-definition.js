import { generateBlueHat } from "./blue-hat-generator.js";
import { BLUE_HAT_RECIPE } from "./blue-hat-recipe.js";

export const BLUE_HAT_DEFINITION = Object.freeze({
  id: "blue-hat",
  label: "Blue Hat",
  recipe: BLUE_HAT_RECIPE,
  generator: generateBlueHat,
  fixture: false,
});

import { generateUmbrella } from "./umbrella-generator.js";
import { UMBRELLA_RECIPE } from "./umbrella-recipe.js";

export const UMBRELLA_DEFINITION = Object.freeze({
  id: "umbrella",
  label: "Umbrella",
  recipe: UMBRELLA_RECIPE,
  generator: generateUmbrella,
  fixture: false,
});

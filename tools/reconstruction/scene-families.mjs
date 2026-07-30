/**
 * Authored family -> scene semantics.
 *
 * The Assembled Authored Scene groups its content into asset families. This
 * development-only table records what each family *is* — which generator kind
 * reproduces it, which semantic group it belongs to, which Material Family it
 * uses, and what its orientation actually means. Only the resulting semantic
 * values reach the Scene Recipe; no family name, node identifier, or asset path
 * is retained.
 *
 * The table is exhaustive by construction: `resolveFamily` throws on an
 * unmapped family, so new reference content becomes a blocking coverage
 * failure instead of silently disappearing.
 */

const FAMILIES = {
  // Vegetation
  PalmTree: { kind: "palm", group: "vegetation", material: "palm-foliage", orientation: "radial" },
  CherryBlossom: { kind: "blossom", group: "vegetation", material: "blossom-foliage", orientation: "radial" },
  bamboo_forest_fbx: { kind: "bamboo", group: "vegetation", material: "bamboo-foliage", orientation: "radial" },
  Willow: { kind: "willow", group: "vegetation", material: "blossom-foliage", orientation: "radial" },
  Grass: { kind: "grass-clump", group: "vegetation", material: "terrain-ground", orientation: "radial" },
  Flower_fbx: { kind: "flower-bed", group: "vegetation", material: "blossom-foliage", orientation: "axis" },
  SM_Env_Mushroom_Giant: { kind: "mushroom", group: "vegetation", material: "blossom-foliage", orientation: "radial" },
  Bamboo_shoot_01_FBX: { kind: "bamboo-shoot", group: "vegetation", material: "bamboo-foliage", orientation: "radial" },
  bamboo_pile_fbx: { kind: "bamboo-pile", group: "decorations", material: "bamboo-foliage", orientation: "axis" },

  // Architecture
  pavilion_fbx: { kind: "pavilion", group: "structures", material: "painted-timber", orientation: "heading" },
  pavilion_single_floor_fbx: { kind: "pavilion-single", group: "structures", material: "painted-timber", orientation: "heading" },
  ring_booth_fbx: { kind: "ring-booth", group: "structures", material: "painted-timber", orientation: "heading" },
  tea_booth_fbx: { kind: "tea-booth", group: "structures", material: "painted-timber", orientation: "heading" },
  dessert_shop_fbx: { kind: "dessert-shop", group: "structures", material: "painted-timber", orientation: "heading" },
  Dumpling_house_02_fbx: { kind: "dumpling-house", group: "structures", material: "painted-timber", orientation: "heading" },
  fruit_shop_fbx: { kind: "fruit-shop", group: "structures", material: "painted-timber", orientation: "heading" },
  Shop_02_fbx: { kind: "shop-stall", group: "structures", material: "painted-timber", orientation: "heading" },
  Swing_and_tree_03_fbx: { kind: "swing-tree", group: "structures", material: "painted-timber", orientation: "heading" },
  Wish_tree_fbx: { kind: "wish-tree", group: "structures", material: "blossom-foliage", orientation: "heading" },

  // Ground surfaces
  BrickPlaza: { kind: "plaza", group: "plazas", material: "paving-stone", orientation: "axis" },
  StonePath: { kind: "path-stone", group: "paths", material: "paving-stone", orientation: "surface-aligned" },
  MeshPart: { kind: "paving-slab", group: "paths", material: "paving-stone", orientation: "surface-aligned" },
  mesh_m16181622188_n: { kind: "paving-slab", group: "paths", material: "paving-stone", orientation: "surface-aligned" },

  // Rock
  Stone: { kind: "rock", group: "rocks", material: "shore-rock", orientation: "axis" },
  RockLarge: { kind: "rock", group: "rocks", material: "shore-rock", orientation: "axis" },
  RockMedium: { kind: "rock", group: "rocks", material: "shore-rock", orientation: "axis" },
  Smooth_Block_Model: { kind: "stone-block", group: "decorations", material: "paving-stone", orientation: "axis" },

  // Distant mountains
  mesh_m14887720468_n: { kind: "mountain", group: "horizon", material: "distant-rock", orientation: "axis" },
  mesh_m15224226592_n: { kind: "mountain", group: "horizon", material: "distant-rock", orientation: "axis" },
  mesh_m15230860430_n: { kind: "mountain", group: "horizon", material: "distant-rock", orientation: "axis" },

  // Bridges and large decks
  Mesh: { kind: "bridge", group: "bridges", material: "painted-timber", orientation: "heading" },

  // Decoration and props
  lattern_03_fbx: { kind: "lantern", group: "decorations", material: "painted-timber", orientation: "radial" },
  Lattern_02_fbx: { kind: "lantern", group: "decorations", material: "painted-timber", orientation: "radial" },
  camping_light_fbx: { kind: "camp-light", group: "decorations", material: "painted-timber", orientation: "radial" },
  CampFire: { kind: "campfire", group: "decorations", material: "shore-rock", orientation: "radial" },
  Umbrella_fbx: { kind: "umbrella", group: "decorations", material: "painted-timber", orientation: "radial" },
  Logs: { kind: "log-pile", group: "decorations", material: "painted-timber", orientation: "axis" },
  Shop_sign_01_fbx: { kind: "shop-sign", group: "decorations", material: "painted-timber", orientation: "heading" },
  shop_sign_02_fbx: { kind: "shop-sign", group: "decorations", material: "painted-timber", orientation: "heading" },
  shop_sign_02_fruit_fbx: { kind: "shop-sign", group: "decorations", material: "painted-timber", orientation: "heading" },
  shop_sign_04_fbx: { kind: "shop-sign", group: "decorations", material: "painted-timber", orientation: "heading" },
  wooden_name_plate_with_text_fbx: { kind: "name-plate", group: "decorations", material: "painted-timber", orientation: "heading" },
  yin_yang_fbx: { kind: "yin-yang", group: "decorations", material: "paving-stone", orientation: "axis" },
  stone_table_fbx: { kind: "stone-table", group: "decorations", material: "paving-stone", orientation: "radial" },
  vase_fbx: { kind: "vase", group: "decorations", material: "painted-timber", orientation: "radial" },
  Potion_fbx: { kind: "potion", group: "decorations", material: "painted-timber", orientation: "radial" },
  Candle_fbx: { kind: "candle", group: "decorations", material: "painted-timber", orientation: "radial" },
  blue_hat_fbx: { kind: "blue-hat", group: "decorations", material: "painted-timber", orientation: "radial" },
  lucky_bag_fbx: { kind: "lucky-bag", group: "decorations", material: "painted-timber", orientation: "radial" },
  Ganlu_fbx: { kind: "ganlu", group: "decorations", material: "painted-timber", orientation: "radial" },

  // Characters
  Yuelao_NPC_fbx: { kind: "npc-statue", group: "decorations", material: "painted-timber", orientation: "heading" },
  Npc_idle: { kind: "npc-statue", group: "decorations", material: "painted-timber", orientation: "heading" },
  Hua_Hua: { kind: "panda-statue", group: "decorations", material: "creature-fur", orientation: "heading" },
};

/**
 * `MeshPart` covers both small path slabs and the large water-garden decks, so
 * the deck variant is separated by measured footprint rather than by name.
 */
const LARGE_DECK_FOOTPRINT = 900;

export function familyKey(path) {
  const leaf = path.split("/").at(-1).split(":").slice(2).join(":");
  return leaf.replace(/__.*$/, "").replace(/[_\d]+$/, "") || "(unnamed)";
}

export function resolveFamily(family, extent) {
  const mapped = FAMILIES[family];
  if (!mapped) {
    throw new Error(
      `unmapped authored family "${family}"; add it to tools/reconstruction/scene-families.mjs`,
    );
  }
  if (mapped.kind === "paving-slab" && extent[0] * extent[2] >= LARGE_DECK_FOOTPRINT) {
    return { kind: "deck", group: "plazas", material: "paving-stone", orientation: "surface-aligned" };
  }
  return mapped;
}

export function listSemanticKinds() {
  return [...new Set(Object.values(FAMILIES).map((entry) => entry.kind)), "deck", "panda"].sort();
}

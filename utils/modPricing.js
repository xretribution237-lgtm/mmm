// src/utils/modPricing.js
// =============================================
// Mod type definitions and emerald costs
// Admins can adjust COSTS here centrally
// =============================================

const MOD_TYPES = {
  simple_item: {
    label: 'Simple Item Mod',
    description: 'New item, texture change, recipe modification',
    cost: 25,
    emoji: '🪨',
  },
  mob: {
    label: 'Custom Mob / Entity',
    description: 'New mob with AI, drops, and animations',
    cost: 75,
    emoji: '👾',
  },
  dimension: {
    label: 'New Dimension',
    description: 'Custom world with biomes and generation',
    cost: 200,
    emoji: '🌍',
  },
  mechanic: {
    label: 'New Game Mechanic',
    description: 'Custom gameplay system or feature',
    cost: 100,
    emoji: '⚙️',
  },
  ui: {
    label: 'UI / HUD Change',
    description: 'Modify menus, HUD elements, GUI screens',
    cost: 40,
    emoji: '🖥️',
  },
  biome: {
    label: 'Custom Biome',
    description: 'New biome with structures and spawns',
    cost: 120,
    emoji: '🌲',
  },
  structure: {
    label: 'Custom Structure',
    description: 'Dungeon, building, or generated structure',
    cost: 60,
    emoji: '🏰',
  },
  datapack: {
    label: 'Datapack / Loot / Advancement',
    description: 'Advancements, loot tables, recipes',
    cost: 15,
    emoji: '📦',
  },
};

/**
 * Returns Discord slash command choices array for mod type select
 */
function getModTypeChoices() {
  return Object.entries(MOD_TYPES).map(([value, { label }]) => ({ name: label, value }));
}

/**
 * Get cost for a mod type
 */
function getCost(type) {
  return MOD_TYPES[type]?.cost ?? 50;
}

/**
 * Get display info for a mod type
 */
function getModType(type) {
  return MOD_TYPES[type] ?? null;
}

module.exports = { MOD_TYPES, getModTypeChoices, getCost, getModType };

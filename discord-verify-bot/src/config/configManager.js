// ============================================================
// CONFIG MANAGER — Per-guild configuration reader
//
// Har server ka apna config file hota hai:
//   guild-configs/{guildId}.json
//
// Phase 1: JSON files se read karta hai
// Phase 2: Yahi interface PostgreSQL DB pe point karega,
//          baki code mein koi change nahi hoga.
// ============================================================

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_DIR = path.join(process.cwd(), 'guild-configs');

// In-memory cache taaki har interaction pe disk read na ho
const configCache = new Map();

/**
 * Ek guild ki config load karta hai.
 * File nahi mili toh null return karta hai.
 */
function getGuildConfig(guildId) {
  if (configCache.has(guildId)) {
    return configCache.get(guildId);
  }

  const filePath = path.join(CONFIG_DIR, `${guildId}.json`);

  if (!fs.existsSync(filePath)) {
    // Silently return null — bot will skip this guild
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(raw);
    configCache.set(guildId, config);
    logger.info(`Config loaded for guild: ${config.guildName} (${guildId})`);
    return config;
  } catch (err) {
    logger.error(`Failed to parse config for guild ${guildId}:`, err);
    return null;
  }
}

/**
 * Config cache invalidate karta hai (manual config edit ke baad use karo)
 * Discord mein /reload-config command se trigger hoga (Phase 2)
 */
function reloadGuildConfig(guildId) {
  configCache.delete(guildId);
  return getGuildConfig(guildId);
}

/**
 * Saare configured guilds ki list return karta hai
 */
function getAllConfiguredGuilds() {
  if (!fs.existsSync(CONFIG_DIR)) return [];

  return fs
    .readdirSync(CONFIG_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('example'))
    .map(f => f.replace('.json', ''));
}

module.exports = { getGuildConfig, reloadGuildConfig, getAllConfiguredGuilds };

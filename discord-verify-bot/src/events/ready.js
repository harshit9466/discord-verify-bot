// ============================================================
// READY EVENT — Bot successfully Discord se connect ho gaya
//
// "once: true" = Yeh event sirf ek baar fire hoga
// Bot start hone ke baad yahan status set hota hai
// ============================================================

const logger = require('../utils/logger');
const { getAllConfiguredGuilds } = require('../config/configManager');

module.exports = {
  name: 'clientReady',
  once: true, // Sirf ek baar

  async execute(client) {
    logger.info(`✅ Bot is ONLINE as: ${client.user.tag}`);
    logger.info(`📡 Connected to ${client.guilds.cache.size} guild(s)`);

    const configuredGuilds = getAllConfiguredGuilds();

    if (configuredGuilds.length === 0) {
      logger.warn(`⚠️  No guild config files found in guild-configs/`);
      logger.warn(`    Create a {guildId}.json file based on example-config.json`);
    } else {
      logger.info(`⚙️  Configured guilds: ${configuredGuilds.join(', ')}`);
    }

    // Bot ka Discord status set karo
    // Type 3 = "Watching"
    client.user.setPresence({
      activities: [{ name: 'Verifying members...', type: 3 }],
      status: 'online',
    });
  },
};

// ============================================================
// READY EVENT — Bot successfully Discord se connect ho gaya
//
// "once: true" = Yeh event sirf ek baar fire hoga
// Bot start hone ke baad yahan status set hota hai
// ============================================================

const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const { getAllConfiguredGuilds } = require('../config/configManager');
const { getTotalVerifiedCount } = require('../db/statsRepository');
const { startCleanupJob } = require('../utils/stateManager');

async function refreshActivity(client) {
  const count = await getTotalVerifiedCount().catch(() => 0);
  client.user.setPresence({
    activities: [{ name: `${count} members verified`, type: ActivityType.Watching }],
    status: 'online',
  });
}

module.exports = {
  name: 'clientReady',
  once: true,

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

    await refreshActivity(client);
    setInterval(() => refreshActivity(client), 10 * 60 * 1000);

    startCleanupJob();
  },
};

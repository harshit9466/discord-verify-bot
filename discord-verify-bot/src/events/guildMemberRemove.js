// ============================================================
// GUILD MEMBER REMOVE — Koi server chodta hai toh yeh fire hota hai
//
// Is event mein:
//   1. Koi bhi in-progress verification state clear karo
//   2. Leave log channel mein note karo
//   3. (Phase 2) DB mein last_left_at update karo
// ============================================================

const logger = require('../utils/logger');
const { getGuildConfig } = require('../config/configManager');
const { clearState, getState } = require('../utils/stateManager');

module.exports = {
  name: 'guildMemberRemove',

  async execute(member) {
    const { guild, user } = member;
    logger.info(`Member left: ${user.tag} (${user.id}) ← Guild: ${guild.name} (${guild.id})`);

    // In-progress verification state clean up
    const existingState = getState(guild.id, user.id);
    if (existingState) {
      logger.info(`Clearing incomplete verification state for ${user.tag} (they left mid-flow)`);
      clearState(guild.id, user.id);
    }

    const config = getGuildConfig(guild.id);
    if (!config) return;

    // Leave log
    try {
      const logChannel = guild.channels.cache.get(config.channels.logChannelId);
      if (logChannel) {
        await logChannel.send({
          content: `📤 **Member Left:** ${user.tag} (<@${user.id}>)`,
        });
      }
    } catch (err) {
      logger.error(`Failed to log leave event:`, { error: err.message });
    }

    // TODO (Phase 2): DB update
    // await db.updateMember(user.id, guild.id, { lastLeftAt: new Date() });
  },
};

// ============================================================
// GUILD MEMBER REMOVE — Koi server chodta hai toh yeh fire hota hai
//
// Is event mein:
//   1. Koi bhi in-progress verification state clear karo
//   2. Leave log channel mein note karo
//   3. (Phase 2) DB mein last_left_at update karo
// ============================================================

const logger      = require('../utils/logger');
const { getGuildConfig } = require('../config/configManager');
const { clearState, getState } = require('../utils/stateManager');
const memberRepo  = require('../db/memberRepository');
const eventRepo   = require('../db/eventRepository');

module.exports = {
  name: 'guildMemberRemove',

  async execute(member) {
    const { guild, user } = member;
    logger.info(`Member left: ${user.tag} (${user.id}) ← Guild: ${guild.name} (${guild.id})`);

    // In-progress verification state clean up
    const existingState = await getState(guild.id, user.id);
    if (existingState) {
      logger.info(`Clearing incomplete verification state for ${user.tag} (they left mid-flow)`);
      await clearState(guild.id, user.id);
    }

    const config = getGuildConfig(guild.id);
    if (!config) return;

    // Snapshot status before leave update to decide on DM
    const dbMember = await memberRepo.findMember(user.id, guild.id).catch(() => null);
    const wasUnverified = dbMember && !['VERIFIED', 'REJECTED'].includes(dbMember.verification_status);

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

    // Update DB: last_left_at + LEFT_UNVERIFIED (if applicable) + LEAVE event
    try {
      await memberRepo.updateMemberOnLeave(user.id, guild.id);
      await eventRepo.logEvent(user.id, guild.id, 'LEAVE');
    } catch (err) {
      logger.error(`DB leave update failed for ${user.tag}:`, { error: err.message });
    }

    // DM unverified leavers with rejoin invite
    if (!wasUnverified) return;

    const inviteLink = config.verificationSettings?.kickInviteLink || null;
    const modsRoleId = config.verificationSettings?.modsRoleId || config.roles?.modsRoleId || null;

    const lines = [
      `Hey **${user.username}**! 👋`,
      ``,
      `It looks like you left **${guild.name}** before completing your verification.`,
      `We'd love to have you back — verification only takes a couple of minutes!`,
    ];
    if (inviteLink) lines.push(``, `🔗 **Rejoin here:** ${inviteLink}`);
    lines.push(
      ``,
      modsRoleId
        ? `If you need any help, ping <@&${modsRoleId}> once you're back in the server.`
        : `If you need any help, reach out to our mods once you're back.`,
    );

    try {
      await user.send({
        embeds: [{
          color:       0xFFA500,
          title:       `You left ${guild.name} before verifying`,
          description: lines.join('\n'),
        }],
      });
      logger.info(`Sent unverified-leave DM to ${user.tag}`);
    } catch (err) {
      logger.debug(`Could not DM ${user.tag} on unverified leave (DMs likely closed): ${err.message}`);
    }
  },
};

const logger      = require('../utils/logger');
const { getGuildConfig } = require('../config/configManager');
const { initState }      = require('../utils/stateManager');
const { buildWelcomeEmbed, buildAutoVerifyEmbed } = require('../utils/embeds');
const { buildBeginButton }                         = require('../utils/components');
const memberRepo  = require('../db/memberRepository');
const eventRepo   = require('../db/eventRepository');

module.exports = {
  name: 'guildMemberAdd',

  async execute(member) {
    const { guild, user } = member;
    logger.info(`New member joined: ${user.tag} (${user.id}) → Guild: ${guild.name} (${guild.id})`);

    const config = getGuildConfig(guild.id);
    if (!config) {
      logger.debug(`No config for guild ${guild.id}, skipping`);
      return;
    }

    // ---- Assign @Unverified ----
    try {
      const unverifiedRole = guild.roles.cache.get(config.roles.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole);
        logger.info(`@Unverified assigned to ${user.tag}`);
      }
    } catch (err) {
      logger.error(`Failed to assign @Unverified to ${user.tag}:`, { error: err.message });
    }

    // ---- Returning member check ----
    let isAutoVerified = false;
    try {
      const existing = await memberRepo.findMember(user.id, guild.id);
      if (existing?.verification_status === 'VERIFIED') {
        isAutoVerified = await autoVerifyReturningMember(member, existing, config, guild);
      }
    } catch (err) {
      logger.error(`DB lookup failed for ${user.tag}:`, { error: err.message });
    }

    // ---- Persist join to DB ----
    try {
      await memberRepo.upsertMemberOnJoin(user.id, guild.id, user.tag, new Date(member.joinedTimestamp));
      await eventRepo.logEvent(user.id, guild.id, isAutoVerified ? 'REJOIN' : 'JOIN');
    } catch (err) {
      logger.error(`DB upsert failed for ${user.tag}:`, { error: err.message });
    }

    if (isAutoVerified) return;

    // ---- Normal verification flow ----
    await initState(guild.id, user.id);

    if (config.settings.verificationMode === 'channel') {
      await logToChannel(guild, config, `📥 **Member Joined:** ${user.tag} (<@${user.id}>) • Account age: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`);
      return;
    }

    if (member.pending) {
      logger.info(`${user.tag} has Discord membership screening pending`);
      await logToChannel(guild, config, `📥 **Member Joined (Screening Pending):** ${user.tag} (<@${user.id}>)`);
      return;
    }

    await sendVerificationMessage(member, config, guild);
    await logToChannel(guild, config, `📥 **Member Joined:** ${user.tag} (<@${user.id}>) • Account age: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`);
  },
};

// ============================================================
// AUTO-VERIFY — Returning verified member ka role restore karo
// ============================================================
async function autoVerifyReturningMember(member, dbRecord, config, guild) {
  const roleMap = {
    'TRAVELER':  config.roles.travelerRoleId,
    'INITIATE':  config.roles.initiateRoleId,
    'NSFW_ONLY': config.roles.nsfwOnlyRoleId,
  };

  const roleId = roleMap[dbRecord.role_assigned];
  if (!roleId) {
    logger.warn(`Auto-verify: unknown role_assigned "${dbRecord.role_assigned}" for ${member.user.tag} — falling back to normal flow`);
    return false;
  }

  const verifiedRole = guild.roles.cache.get(roleId);
  if (!verifiedRole) {
    logger.warn(`Auto-verify: role ${roleId} not found in guild — falling back to normal flow`);
    return false;
  }

  // Compute full final role set in one pass — single roles.set() replaces N sequential add/remove calls
  const toRemoveIds = new Set([
    config.roles.unverifiedRoleId,
  ].filter(Boolean));

  const toAddIds = [
    roleId,
    config.roles.baseRoleId,
    ...(dbRecord.selected_roles ? Object.values(dbRecord.selected_roles).flat() : []),
  ].filter(id => id && guild.roles.cache.has(id));

  const finalRoleIds = [
    ...new Set([
      ...member.roles.cache.filter(r => !toRemoveIds.has(r.id)).map(r => r.id),
      ...toAddIds,
    ]),
  ];

  await member.roles.set(finalRoleIds).catch(err =>
    logger.warn(`Auto-verify: roles.set failed for ${member.user.tag}: ${err.message}`)
  );

  // DM user
  const firstJoinedMs = dbRecord.first_joined_at?.getTime() ?? Date.now();
  await member.user.send({
    embeds: [buildAutoVerifyEmbed(guild.name, verifiedRole.name, firstJoinedMs)],
  }).catch(() => logger.warn(`Could not DM auto-verify to ${member.user.tag}`));

  // Log in #verification-log
  await logToChannel(guild, config,
    `⚡ **Auto-Verified (Returning Member):** ${member.user.tag} (<@${member.id}>) → @${verifiedRole.name} | Rejoins: ${dbRecord.rejoin_count}`
  );

  logger.info(`Auto-verified: ${member.user.tag} → @${verifiedRole.name}`);
  return true;
}

// ============================================================
// SHARED HELPERS
// ============================================================
async function sendVerificationMessage(member, config, guild) {
  const mode = config.settings.verificationMode || 'dm';

  if (mode === 'channel') {
    await sendToVerifyChannel(member, config, guild);
    return;
  }

  try {
    const dm = await member.user.createDM();
    await dm.send({
      embeds:     [buildWelcomeEmbed(config)],
      components: [buildBeginButton(guild.id, member.id)],
    });
    logger.info(`Welcome DM sent to ${member.user.tag}`);
  } catch {
    logger.warn(`Could not DM ${member.user.tag} — falling back to verify channel`);
    await sendToVerifyChannel(member, config, guild, true);
  }
}

async function sendToVerifyChannel(member, config, guild, isDmFallback = false) {
  try {
    const channelId = (config.channels.verifyChannelId && config.channels.verifyChannelId !== 'PASTE_VERIFY_CHANNEL_ID_HERE')
      ? config.channels.verifyChannelId
      : config.channels.welcomeChannelId;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      logger.warn(`Verify channel not found for guild ${guild.id}`);
      return;
    }

    const content = isDmFallback
      ? `<@${member.id}> *(DMs are disabled — verifying here instead)*`
      : `<@${member.id}>`;

    await channel.send({
      content,
      embeds:     [buildWelcomeEmbed(config)],
      components: [buildBeginButton(guild.id, member.id)],
    });

    logger.info(`Verification message sent to channel for ${member.user.tag}`);
  } catch (err) {
    logger.error(`Failed to send verification message to channel:`, { error: err.message });
  }
}

async function logToChannel(guild, config, message) {
  try {
    const logChannel = guild.channels.cache.get(config.channels.logChannelId);
    if (logChannel) await logChannel.send({ content: message });
  } catch (err) {
    logger.error(`Failed to log event:`, { error: err.message });
  }
}

module.exports.sendVerificationMessage = sendVerificationMessage;

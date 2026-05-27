// ============================================================
// GUILD MEMBER ADD — Koi server join karta hai toh yeh fire hota hai
//
// Is event mein:
//   1. @Unverified role assign karo
//   2. (Phase 2) DB check karo — returning verified member toh auto-verify
//   3. member.pending check karo:
//        pending = true  → Discord Membership Screening abhi complete nahi
//                          Button click nahi ho sakta — message mat bhejo
//                          guildMemberUpdate.js handle karega jab screening done ho
//        pending = false → Screening nahi hai ya already done — seedha bhejo
//   4. Verification log channel mein join note karo
//
// Config mein toggle karo:
//   settings.verificationMode = "dm" | "channel"
// ============================================================

const logger = require('../utils/logger');
const { getGuildConfig } = require('../config/configManager');
const { initState, updateState } = require('../utils/stateManager');
const { buildWelcomeEmbed } = require('../utils/embeds');
const { buildBeginButton } = require('../utils/components');

// sendVerificationMessage export karo — guildMemberUpdate.js bhi use karta hai
module.exports = {
  name: 'guildMemberAdd',

  async execute(member) {
    const { guild, user } = member;
    logger.info(`New member joined: ${user.tag} (${user.id}) → Guild: ${guild.name} (${guild.id})`);

    // Load this guild's config
    const config = getGuildConfig(guild.id);
    if (!config) {
      // Is guild ke liye config file nahi bani — ignore karo
      logger.debug(`No config for guild ${guild.id}, skipping verification setup`);
      return;
    }

    // ---- Step 1: @Unverified role assign karo ----
    try {
      const unverifiedRole = guild.roles.cache.get(config.roles.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole);
        logger.info(`@Unverified role assigned to ${user.tag}`);
      } else {
        logger.warn(`@Unverified role ID "${config.roles.unverifiedRoleId}" not found in guild ${guild.id}`);
      }
    } catch (err) {
      logger.error(`Failed to assign @Unverified role to ${user.tag}:`, { error: err.message });
    }

    // ---- TODO (Phase 2): Returning member check ----
    // Yahan DB mein check hoga:
    //   const existing = await db.findMember(user.id, guild.id);
    //   if (existing?.verificationStatus === 'VERIFIED') {
    //     return autoVerifyReturningMember(member, existing, config);
    //   }

    // ---- Step 2: Verification state initialize karo ----
    initState(guild.id, user.id);

    // ---- Step 3: Channel mode mein persistent panel handle karta hai ----
    // Ek baar /setup-verify se panel post ho jaata hai verify channel mein
    // Ab har member ke liye alag message nahi bhejna — woh khud button click karega
    if (config.settings.verificationMode === 'channel') {
      await logEvent(guild, config, `📥 **Member Joined:** ${user.tag} (<@${user.id}>) • Account age: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`);
      return;
    }

    // ---- DM mode: Discord Membership Screening check ----
    // member.pending = true  → User ne Discord ka native "Accept Rules" screen abhi complete nahi kiya
    //                          guildMemberUpdate event fire hoga jab woh complete kare
    // member.pending = false → Screening disabled ya already done — seedha DM bhejo
    if (member.pending) {
      logger.info(`${user.tag} has Discord membership screening pending — DM will be sent after screening`);
      await logEvent(guild, config, `📥 **Member Joined (Screening Pending):** ${user.tag} (<@${user.id}>)`);
      return;
    }

    // DM mode, no pending: per-user verification DM bhejo
    await sendVerificationMessage(member, config, guild);

    // ---- Step 4: Join log karo ----
    await logEvent(guild, config, `📥 **Member Joined:** ${user.tag} (<@${user.id}>) • Account age: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`);
  },
};

// ============================================================
// SHARED HELPER — Verification message bhejo (DM ya channel)
// Yeh function guildMemberAdd aur guildMemberUpdate dono use karte hain
// ============================================================
async function sendVerificationMessage(member, config, guild) {
  const mode = config.settings.verificationMode || 'dm';

  if (mode === 'channel') {
    await sendToVerifyChannel(member, config, guild);
  } else {
    // DM mode
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
}

// verifyChannelId mein welcome message bhejo
// isDmFallback = true → extra note add karo ki DMs enable karo
async function sendToVerifyChannel(member, config, guild, isDmFallback = false) {
  try {
    // verifyChannelId prefer karo, fallback welcomeChannelId
    const channelId = (config.channels.verifyChannelId && config.channels.verifyChannelId !== 'PASTE_VERIFY_CHANNEL_ID_HERE')
      ? config.channels.verifyChannelId
      : config.channels.welcomeChannelId;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      logger.warn(`Verify channel not found for guild ${guild.id} — check verifyChannelId in config`);
      return;
    }

    let content = `<@${member.id}>`;
    if (isDmFallback) {
      content = `<@${member.id}> *(DMs are disabled — verifying here instead)*`;
    }

    await channel.send({
      content,
      embeds:     [buildWelcomeEmbed(config)],
      components: [buildBeginButton(guild.id, member.id)],
    });

    logger.info(`Verification message sent to channel for ${member.user.tag} (${isDmFallback ? 'DM fallback' : 'channel mode'})`);
  } catch (err) {
    logger.error(`Failed to send verification message to channel:`, { error: err.message });
  }
}

// ---- Helper: Log channel mein event log karo ----
async function logEvent(guild, config, message) {
  try {
    const logChannel = guild.channels.cache.get(config.channels.logChannelId);
    if (logChannel) {
      await logChannel.send({ content: message });
    }
  } catch (err) {
    logger.error(`Failed to log event:`, { error: err.message });
  }
}

// Export karo taaki guildMemberUpdate.js bhi use kar sake
module.exports.sendVerificationMessage = sendVerificationMessage;

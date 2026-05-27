// ============================================================
// INTERACTION CREATE — Central router for ALL interactions
// ============================================================

const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const { getGuildConfig } = require('../config/configManager');
const { getState, initState, updateState, clearState, STEPS } = require('../utils/stateManager');
const embeds     = require('../utils/embeds');
const components = require('../utils/components');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction).catch(err => {
        logger.error(`Slash command error [/${interaction.commandName}]:`, { error: err.message });
      });
      return;
    }

    if (!interaction.customId?.startsWith('verif:')) return;

    try {
      const parts = interaction.customId.split(':');

      if      (interaction.isButton())            await handleButton(interaction, parts);
      else if (interaction.isStringSelectMenu())  await handleSelectMenu(interaction, parts);
      else if (interaction.isModalSubmit())       await handleModalSubmit(interaction, parts);

    } catch (err) {
      logger.error(`Error in interactionCreate for ${interaction.customId}:`, { error: err.message, stack: err.stack });

      const errEmbed = embeds.buildErrorEmbed('Kuch galat hua. Please ek mod ko ping karo.');
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
        }
      } catch (_) {}
    }
  },
};

async function handleButton(interaction, parts) {
  const action = parts[1];
  if      (action === 'begin')   await step_begin(interaction, parts);
  else if (action === 'restart') await step_restart(interaction, parts);
  else if (action === 'rules')   await step_rules(interaction, parts);
  else if (action === 'content') await step_content(interaction, parts);
  else if (action === 'intro')   await step_openIntroModal(interaction, parts);
  else if (action === 'kinks')   await step_kinks(interaction, parts);
  else if (action === 'mod')     await mod_action(interaction, parts);
}

async function handleSelectMenu(interaction, parts) {
  if (parts[1] === 'select') await step_roleSelect(interaction, parts);
}

async function handleModalSubmit(interaction, parts) {
  if      (parts[1] === 'modal' && parts[2] === 'intro')         await step_introSubmit(interaction, parts);
  else if (parts[1] === 'modal' && parts[2] === 'kinks')         await step_kinksSubmit(interaction, parts);
  else if (parts[1] === 'mod'   && parts[2] === 'rejectReason')  await mod_rejectReason(interaction, parts);
}

// ============================================================
// STEP 0: Begin Verification
// ============================================================
async function step_begin(interaction, parts) {
  const guildId = parts[2];
  const userId  = interaction.user.id;

  if (parts.length >= 4 && parts[3] && parts[3] !== userId) {
    return interaction.reply({ content: 'This button is not for you.', flags: MessageFlags.Ephemeral });
  }

  const config = getGuildConfig(guildId);
  if (!config) {
    return interaction.reply({ content: 'Server config not found. Please contact a moderator.', flags: MessageFlags.Ephemeral });
  }

  const state = getState(guildId, userId);

  if (state?.step === STEPS.PENDING) {
    return interaction.reply({
      embeds: [{
        color: 0xFEE75C,
        title: 'Verification Pending',
        description: 'Your introduction is awaiting mod review. Click Edit & Resubmit to make changes.',
      }],
      components: [components.buildRestartVerifyButton(guildId, userId)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.inGuild() && interaction.member) {
    const contentRoleIds = [
      config.roles.travelerRoleId,
      config.roles.initiateRoleId,
      config.roles.nsfwOnlyRoleId,
    ].filter(Boolean);
    const isVerified = contentRoleIds.some(id => interaction.member.roles.cache.has(id));
    if (isVerified) {
      return interaction.reply({ content: 'You are already verified! Welcome.', flags: MessageFlags.Ephemeral });
    }
  }

  initState(guildId, userId);
  updateState(guildId, userId, { step: STEPS.RULES });

  const payload = {
    embeds:     [embeds.buildRulesEmbed(config)],
    components: [components.buildRulesButtons(guildId, userId)],
  };

  if (interaction.inGuild()) {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.update(payload);
  }
}

// ============================================================
// STEP 0b: Restart / Edit & Resubmit
// ============================================================
async function step_restart(interaction, parts) {
  const guildId = parts[2];
  const userId  = parts[3];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  const config = getGuildConfig(guildId);
  const state  = getState(guildId, userId);

  if (state?.modMessageId && config?.channels?.modQueueChannelId) {
    try {
      const guild = interaction.client.guilds.cache.get(guildId);
      const modQueueChannel = guild?.channels.cache.get(config.channels.modQueueChannelId);
      if (modQueueChannel) {
        const modMsg = await modQueueChannel.messages.fetch(state.modMessageId).catch(() => null);
        if (modMsg) {
          await modMsg.edit({
            embeds: [modMsg.embeds[0], { color: 0xFEE75C, description: 'Withdrawn by user — resubmitting.' }],
            components: [],
          }).catch(() => {});
        }
      }
    } catch (err) {
      logger.warn('Could not update mod queue message for restart: ' + err.message);
    }
  }

  initState(guildId, userId);
  updateState(guildId, userId, { step: STEPS.RULES });

  await interaction.update({
    embeds:     [embeds.buildRulesEmbed(config)],
    components: [components.buildRulesButtons(guildId, userId)],
  });
}

// ============================================================
// STEP 1: Rules
// ============================================================
async function step_rules(interaction, parts) {
  const subAction = parts[2];
  const guildId   = parts[3];
  const userId    = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  let state = getState(guildId, userId);
  if (!state) state = initState(guildId, userId);

  const config = getGuildConfig(guildId);

  if (subAction === 'disagree') {
    return interaction.update({
      embeds: [
        embeds.buildRulesEmbed(config),
        embeds.buildErrorEmbed('You must agree to the rules to access this server.'),
      ],
      components: [components.buildRulesButtons(guildId, userId)],
    });
  }

  updateState(guildId, userId, { step: STEPS.ROLES, rulesAgreed: true });

  if (config.settings.requireRoleSelection && config.roleCategories?.length > 0) {
    return interaction.update({
      embeds:     [embeds.buildRoleSelectionEmbed(config, 0)],
      components: [components.buildRoleSelectMenu(config, 0, guildId, userId)],
    });
  }

  await showContentPreference(interaction, guildId, userId, config);
}

// ============================================================
// STEP 2: Role Selection
// ============================================================
async function step_roleSelect(interaction, parts) {
  const categoryIndex = parseInt(parts[2]);
  const guildId       = parts[3];
  const userId        = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  let state = getState(guildId, userId);
  if (!state) state = initState(guildId, userId);

  const config           = getGuildConfig(guildId);
  const updatedSelections = { ...state.selectedRoles, [categoryIndex]: interaction.values };
  updateState(guildId, userId, { selectedRoles: updatedSelections });

  const isLastCategory = categoryIndex >= config.roleCategories.length - 1;

  if (!isLastCategory) {
    const nextIndex = categoryIndex + 1;
    return interaction.update({
      embeds:     [embeds.buildRoleSelectionEmbed(config, nextIndex)],
      components: [components.buildRoleSelectMenu(config, nextIndex, guildId, userId)],
    });
  }

  await showContentPreference(interaction, guildId, userId, config);
}

// ============================================================
// STEP 3: Content Preference
// ============================================================
async function step_content(interaction, parts) {
  const pref    = parts[2].toUpperCase().replace('-', '_');
  const guildId = parts[3];
  const userId  = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  let state = getState(guildId, userId);
  if (!state) state = initState(guildId, userId);

  updateState(guildId, userId, { step: STEPS.INTRO, contentPreference: pref });

  await interaction.update({
    embeds:     [embeds.buildIntroPromptEmbed()],
    components: [components.buildOpenIntroButton(guildId, userId)],
  });
}

// ============================================================
// STEP 4a: Intro Modal Open
// ============================================================
async function step_openIntroModal(interaction, parts) {
  const guildId = parts[3];
  const userId  = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  let state = getState(guildId, userId);
  if (!state) state = initState(guildId, userId);

  await interaction.showModal(components.buildIntroModal(guildId, userId));
}

// ============================================================
// STEP 4a Submit: Intro Modal
// ============================================================
async function step_introSubmit(interaction, parts) {
  const guildId = parts[3];
  const userId  = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  const state = getState(guildId, userId);
  if (!state) {
    return interaction.reply({ content: 'Session expired. Please click the verification button again.', flags: MessageFlags.Ephemeral });
  }

  const intro = {
    displayName: interaction.fields.getTextInputValue('displayName').trim(),
    age:         interaction.fields.getTextInputValue('age').trim(),
    location:    interaction.fields.getTextInputValue('location')?.trim() || null,
    howFound:    interaction.fields.getTextInputValue('howFound').trim(),
    aboutYou:    interaction.fields.getTextInputValue('aboutYou').trim(),
    kinks:       null,
    hardLimits:  null,
  };

  const ageNum = parseInt(intro.age);
  if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
    return interaction.reply({ content: 'Please enter a valid age between 13 and 100.', flags: MessageFlags.Ephemeral });
  }

  updateState(guildId, userId, { intro });

  await interaction.reply({
    embeds:     [embeds.buildKinksStepEmbed()],
    components: [components.buildKinksStepButtons(guildId, userId)],
    flags:      interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
  });
}

// ============================================================
// STEP 4b: Kinks Step
// ============================================================
async function step_kinks(interaction, parts) {
  const sub     = parts[2];
  const guildId = parts[3];
  const userId  = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  if (sub === 'open') {
    await interaction.showModal(components.buildKinksModal(guildId, userId));
  } else if (sub === 'skip') {
    const state = getState(guildId, userId);
    if (!state) {
      return interaction.reply({ content: 'Session expired. Please restart verification.', flags: MessageFlags.Ephemeral });
    }

    updateState(guildId, userId, { step: STEPS.PENDING });

    await interaction.update({ embeds: [embeds.buildPendingEmbed()], components: [] });
    await postToModQueue(interaction, guildId, userId, getState(guildId, userId));
  }
}

// ============================================================
// STEP 4b Submit: Kinks Modal
// ============================================================
async function step_kinksSubmit(interaction, parts) {
  const guildId = parts[3];
  const userId  = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  const state = getState(guildId, userId);
  if (!state) {
    return interaction.reply({ content: 'Session expired. Please restart verification.', flags: MessageFlags.Ephemeral });
  }

  const kinks      = interaction.fields.getTextInputValue('kinks')?.trim()      || null;
  const hardLimits = interaction.fields.getTextInputValue('hardLimits')?.trim() || null;
  const updatedIntro = { ...state.intro, kinks, hardLimits };

  updateState(guildId, userId, { step: STEPS.PENDING, intro: updatedIntro });

  await interaction.reply({
    embeds:     [embeds.buildPendingEmbed()],
    components: [],
    flags:      interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
  });

  await postToModQueue(interaction, guildId, userId, getState(guildId, userId));
}

// ============================================================
// MOD ACTIONS
// ============================================================
async function mod_action(interaction, parts) {
  const subAction = parts[2];
  const guildId   = parts[3];
  const userId    = parts[4];

  if (!interaction.member?.permissions.has('ManageRoles') &&
      !interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({
      content: 'You need Manage Roles permission to approve/reject verifications.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const config = getGuildConfig(guildId);
  if (!config) {
    return interaction.reply({ content: 'Config not found.', flags: MessageFlags.Ephemeral });
  }

  if (subAction === 'approve') {
    await interaction.deferUpdate();
    await mod_approve(interaction, guildId, userId, config);
  } else if (subAction === 'reject') {
    await interaction.showModal(components.buildRejectReasonModal(guildId, userId));
  }
}

async function mod_approve(interaction, guildId, userId, config) {
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.editReply({ content: 'Guild not found.' });

  try {
    const member = await guild.members.fetch(userId);
    const state  = getState(guildId, userId);
    const pref   = state?.contentPreference ?? 'SFW';

    let roleId, roleName;
    if (pref === 'NSFW_ONLY') {
      roleId = config.roles.nsfwOnlyRoleId;
      roleName = 'NSFW Only';
    } else if (pref === 'NSFW') {
      roleId = config.roles.initiateRoleId;
      roleName = 'Initiate';
    } else {
      roleId = config.roles.travelerRoleId;
      roleName = 'Traveler';
    }

    const allContentRoleIds = [
      config.roles.travelerRoleId,
      config.roles.initiateRoleId,
      config.roles.nsfwOnlyRoleId,
    ].filter(Boolean);

    for (const rId of allContentRoleIds) {
      if (member.roles.cache.has(rId)) await member.roles.remove(rId).catch(() => {});
    }

    if (roleId) {
      const verifiedRole = guild.roles.cache.get(roleId);
      if (verifiedRole) {
        await member.roles.add(verifiedRole);
      } else {
        logger.warn('Role ID ' + roleId + ' not found in guild ' + guildId);
      }
    }

    if (config.roles.baseRoleId) {
      const baseRole = guild.roles.cache.get(config.roles.baseRoleId);
      if (baseRole) await member.roles.add(baseRole).catch(() => {});
    }

    const unverifiedRole = guild.roles.cache.get(config.roles.unverifiedRoleId);
    const pendingRole    = guild.roles.cache.get(config.roles.verificationPendingRoleId);
    if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(() => {});
    if (pendingRole)    await member.roles.remove(pendingRole).catch(() => {});

    if (state?.selectedRoles) {
      for (const [, roleIds] of Object.entries(state.selectedRoles)) {
        for (const id of roleIds) {
          const role = guild.roles.cache.get(id);
          if (role) await member.roles.add(role).catch(() => {});
        }
      }
    }

    await member.user.send({
      embeds: [embeds.buildApprovedEmbed(guild.name, roleName)],
    }).catch(() => logger.warn('Could not DM approval to ' + member.user.tag));

    if (state?.intro && config.channels.introChannelId) {
      const introChannel = guild.channels.cache.get(config.channels.introChannelId);
      if (introChannel) {
        await introChannel.send({
          embeds: [embeds.buildPublicIntroEmbed(member, state, config)],
        }).catch(() => {});
      }
    }

    await interaction.editReply({
      embeds: [
        interaction.message.embeds[0],
        { color: 0x57F287, description: 'Approved by ' + interaction.user.tag + ' at <t:' + Math.floor(Date.now() / 1000) + ':T>' },
      ],
      components: [],
    });

    const logChannel = guild.channels.cache.get(config.channels.logChannelId);
    if (logChannel) {
      await logChannel.send({ content: 'Verified: ' + member.user.tag + ' -> @' + roleName + ' | By: ' + interaction.user.tag });
    }

    clearState(guildId, userId);
    logger.info(member.user.tag + ' approved by ' + interaction.user.tag + ' in ' + guild.name);

  } catch (err) {
    logger.error('Failed to approve member ' + userId + ':', { error: err.message });
    await interaction.editReply({ content: 'Approval failed: ' + err.message });
  }
}

async function mod_rejectReason(interaction, parts) {
  const guildId = parts[3];
  const userId  = parts[4];
  const reason  = interaction.fields.getTextInputValue('reason').trim();

  const config = getGuildConfig(guildId);
  if (!config) return interaction.reply({ content: 'Config not found.', flags: MessageFlags.Ephemeral });

  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Guild not found.', flags: MessageFlags.Ephemeral });

  await interaction.deferUpdate();

  try {
    const member = await guild.members.fetch(userId);

    await member.user.send({ embeds: [embeds.buildRejectedEmbed(reason)] }).catch(() => {});

    await interaction.editReply({
      embeds: [
        interaction.message.embeds[0],
        { color: 0xED4245, description: 'Rejected by ' + interaction.user.tag + '\nReason: ' + reason },
      ],
      components: [],
    });

    const pendingRole = guild.roles.cache.get(config.roles.verificationPendingRoleId);
    if (pendingRole) await member.roles.remove(pendingRole).catch(() => {});

    const logChannel = guild.channels.cache.get(config.channels.logChannelId);
    if (logChannel) {
      await logChannel.send({ content: 'Rejected: ' + member.user.tag + ' | By: ' + interaction.user.tag + ' | Reason: ' + reason });
    }

    clearState(guildId, userId);
    logger.info(member.user.tag + ' rejected by ' + interaction.user.tag);

  } catch (err) {
    logger.error('Failed to reject member ' + userId + ':', { error: err.message });
    await interaction.editReply({ content: 'Rejection failed: ' + err.message });
  }
}

// ============================================================
// SHARED HELPERS
// ============================================================

async function showContentPreference(interaction, guildId, userId, config) {
  updateState(guildId, userId, { step: STEPS.CONTENT });
  await interaction.update({
    embeds:     [embeds.buildContentPrefEmbed(config)],
    components: [components.buildContentPrefButtons(guildId, userId, config.settings.nsfwEnabled)],
  });
}

async function postToModQueue(interaction, guildId, userId, state) {
  const guild  = interaction.client.guilds.cache.get(guildId);
  const config = getGuildConfig(guildId);
  if (!guild || !config) return;

  try {
    const member          = await guild.members.fetch(userId);
    const modQueueChannel = guild.channels.cache.get(config.channels.modQueueChannelId);

    if (!modQueueChannel) {
      logger.warn('Mod queue channel not found in guild ' + guildId);
      return;
    }

    const pendingRole = guild.roles.cache.get(config.roles.verificationPendingRoleId);
    if (pendingRole) await member.roles.add(pendingRole).catch(() => {});

    const modMsg = await modQueueChannel.send({
      embeds:     [embeds.buildModQueueEmbed(member, state, config)],
      components: [components.buildModQueueButtons(guildId, userId)],
    });

    updateState(guildId, userId, { modMessageId: modMsg.id });

    const logChannel = guild.channels.cache.get(config.channels.logChannelId);
    if (logChannel) {
      await logChannel.send({ content: 'Intro Submitted: ' + interaction.user.tag + ' — awaiting mod review' });
    }

    logger.info('Mod queue entry created for ' + interaction.user.tag + ' in ' + guild.name);

  } catch (err) {
    logger.error('Failed to create mod queue entry for ' + userId + ':', { error: err.message });
  }
}

// ============================================================
// SLASH COMMAND HANDLERS
// ============================================================

async function handleSlashCommand(interaction) {
  const cmd = interaction.commandName;
  if      (cmd === 'ping')          await cmd_ping(interaction);
  else if (cmd === 'setup-verify')  await cmd_setupVerify(interaction);
  else if (cmd === 'reload-config') await cmd_reloadConfig(interaction);
  else if (cmd === 'verify-me')     await cmd_verifyMe(interaction);
  else await interaction.reply({ content: 'Unknown command: /' + cmd, flags: MessageFlags.Ephemeral });
}

async function cmd_ping(interaction) {
  const latency = Date.now() - interaction.createdTimestamp;
  await interaction.reply({
    content: 'Pong! Latency: ' + latency + 'ms | API: ' + interaction.client.ws.ping + 'ms',
    flags: MessageFlags.Ephemeral,
  });
}

async function cmd_setupVerify(interaction) {
  if (!interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({ content: 'Administrator permission required.', flags: MessageFlags.Ephemeral });
  }

  const config = getGuildConfig(interaction.guildId);
  if (!config) {
    return interaction.reply({ content: 'Guild config not found. Check guild-configs/ folder.', flags: MessageFlags.Ephemeral });
  }

  const channelId = config.channels.verifyChannelId || config.channels.welcomeChannelId;
  const channel   = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.reply({ content: 'Verify channel not found. Check verifyChannelId in guild config.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const panelMsg = await channel.send({
    embeds:     [embeds.buildVerifyPanelEmbed(config)],
    components: [components.buildPersistentVerifyButton(interaction.guildId)],
  });

  await panelMsg.pin().catch(() => logger.warn('Could not auto-pin verification panel — pin it manually'));

  await interaction.editReply({
    content: 'Verification panel posted in <#' + channelId + '>! Pinned automatically (or pin manually if needed).',
  });

  logger.info('/setup-verify run by ' + interaction.user.tag + ' in guild ' + interaction.guildId);
}

async function cmd_reloadConfig(interaction) {
  if (!interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({ content: 'Administrator permission required.', flags: MessageFlags.Ephemeral });
  }

  const { reloadGuildConfig } = require('../config/configManager');
  const result = reloadGuildConfig(interaction.guildId);

  await interaction.reply({
    content: result
      ? 'Config reloaded for ' + interaction.guildId + '. New settings are now active.'
      : 'No config file found for this guild.',
    flags: MessageFlags.Ephemeral,
  });
}

async function cmd_verifyMe(interaction) {
  const guildId = interaction.guildId;
  const userId  = interaction.user.id;
  const config  = getGuildConfig(guildId);

  if (!config) {
    return interaction.reply({ content: 'Server config not found.', flags: MessageFlags.Ephemeral });
  }

  clearState(guildId, userId);
  initState(guildId, userId);
  updateState(guildId, userId, { step: STEPS.RULES });

  await interaction.reply({
    content:    'Verification restarted! Let\'s go from the top:',
    embeds:     [embeds.buildRulesEmbed(config)],
    components: [components.buildRulesButtons(guildId, userId)],
    flags:      MessageFlags.Ephemeral,
  });
}

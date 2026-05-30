// ============================================================
// INTERACTION CREATE — Central router for ALL interactions
// ============================================================

const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const { getGuildConfig, saveGuildConfig, applyConfigOverrides } = require('../config/configManager');
const { getState, initState, updateState, clearState, STEPS } = require('../utils/stateManager');
const embeds      = require('../utils/embeds');
const components  = require('../utils/components');
const memberRepo  = require('../db/memberRepository');
const eventRepo   = require('../db/eventRepository');
const modSubRepo    = require('../db/modSubscriberRepository');
const statsRepo     = require('../db/statsRepository');
const settingsRepo  = require('../db/settingsRepository');

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
  else if (action === 'edit')    await step_edit(interaction, parts);
  else if (action === 'mod')     await mod_action(interaction, parts);
  else if (action === 'panel')   await panel_action(interaction, parts);
}

async function handleSelectMenu(interaction, parts) {
  if      (parts[1] === 'select') await step_roleSelect(interaction, parts);
  else if (parts[1] === 'panel')  await panel_action(interaction, parts);
}

async function handleModalSubmit(interaction, parts) {
  if      (parts[1] === 'modal' && parts[2] === 'intro')         await step_introSubmit(interaction, parts);
  else if (parts[1] === 'modal' && parts[2] === 'kinks')         await step_kinksSubmit(interaction, parts);
  else if (parts[1] === 'mod'   && parts[2] === 'rejectReason')  await mod_rejectReason(interaction, parts);
  else if (parts[1] === 'modal' && parts[2] === 'verifSettings') await modal_saveVerifSettings(interaction, parts);
  else if (parts[1] === 'modal' && parts[2] === 'editConfig')    await modal_saveConfig(interaction, parts);
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

  const state = await getState(guildId, userId);

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

  await initState(guildId, userId);
  await updateState(guildId, userId, { step: STEPS.RULES });

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
  const state  = await getState(guildId, userId);

  if (state?.modMessageId && config?.channels?.modQueueChannelId) {
    try {
      const guild = interaction.client.guilds.cache.get(guildId);
      const modQueueChannel = guild?.channels.cache.get(config.channels.modQueueChannelId);
      if (modQueueChannel) {
        const modMsg = await modQueueChannel.messages.fetch(state.modMessageId).catch(() => null);
        if (modMsg) await modMsg.delete().catch(() => {});
      }
    } catch (err) {
      logger.warn('Could not delete mod queue message for restart: ' + err.message);
    }
  }

  const previousIntro = state?.intro ?? null;

  // Don't wipe state — preserve intro/roles/contentPref so user only edits what they want
  await updateState(guildId, userId, {
    step: STEPS.EDIT_MENU,
    ...(previousIntro ? { previousIntro } : {}),
  });

  await interaction.update({
    embeds:     [embeds.buildEditMenuEmbed(state, config)],
    components: components.buildEditMenuButtons(guildId, userId, config),
  });
}

// ============================================================
// EDIT MENU: Selective field editing for pending submissions
// ============================================================
async function step_edit(interaction, parts) {
  const sub     = parts[2];
  const guildId = parts[3];
  const userId  = parts[4];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'This is not your verification.', flags: MessageFlags.Ephemeral });
  }

  const config = getGuildConfig(guildId);
  const state  = await getState(guildId, userId);
  if (!state) {
    return interaction.reply({ content: 'Session expired. Please click the verification button again.', flags: MessageFlags.Ephemeral });
  }

  if (sub === 'profile') {
    await interaction.showModal(components.buildIntroModal(guildId, userId, state.intro ?? {}));

  } else if (sub === 'kinks') {
    await interaction.showModal(components.buildKinksModal(guildId, userId, {
      kinks:      state.intro?.kinks      ?? '',
      hardLimits: state.intro?.hardLimits ?? '',
    }));

  } else if (sub === 'content') {
    await interaction.update({
      embeds: [embeds.buildContentPrefEmbed(config)],
      components: [
        components.buildContentPrefButtons(guildId, userId, config.settings.nsfwEnabled),
        components.buildEditBackButton(guildId, userId),
      ],
    });

  } else if (sub === 'roles') {
    const currentSelections = state.selectedRoles?.[0] ?? [];
    await interaction.update({
      embeds: [embeds.buildRoleSelectionEmbed(config, 0)],
      components: [
        components.buildRoleSelectMenu(config, 0, guildId, userId, currentSelections),
        components.buildEditBackButton(guildId, userId),
      ],
    });

  } else if (sub === 'back') {
    await interaction.update({
      embeds:     [embeds.buildEditMenuEmbed(state, config)],
      components: components.buildEditMenuButtons(guildId, userId, config),
    });

  } else if (sub === 'submit') {
    await updateState(guildId, userId, { step: STEPS.PENDING });
    await interaction.update({ embeds: [embeds.buildPendingEmbed()], components: [] });
    await postToModQueue(interaction, guildId, userId, await getState(guildId, userId));
  }
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

  let state = await getState(guildId, userId);
  if (!state) state = await initState(guildId, userId);

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

  await updateState(guildId, userId, { step: STEPS.ROLES, rulesAgreed: true });

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

  let state = await getState(guildId, userId);
  if (!state) state = await initState(guildId, userId);

  const config           = getGuildConfig(guildId);
  const updatedSelections = { ...state.selectedRoles, [categoryIndex]: interaction.values };
  await updateState(guildId, userId, { selectedRoles: updatedSelections });

  const isLastCategory = categoryIndex >= config.roleCategories.length - 1;

  if (!isLastCategory) {
    const nextIndex = categoryIndex + 1;
    const nextSelections = state.selectedRoles?.[nextIndex] ?? [];
    const comps = [components.buildRoleSelectMenu(config, nextIndex, guildId, userId, nextSelections)];
    if (state.step === STEPS.EDIT_MENU) comps.push(components.buildEditBackButton(guildId, userId));
    return interaction.update({
      embeds:     [embeds.buildRoleSelectionEmbed(config, nextIndex)],
      components: comps,
    });
  }

  if (state.step === STEPS.EDIT_MENU) {
    const updatedState = await getState(guildId, userId);
    return interaction.update({
      embeds:     [embeds.buildEditMenuEmbed(updatedState, config)],
      components: components.buildEditMenuButtons(guildId, userId, config),
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

  let state = await getState(guildId, userId);
  if (!state) state = await initState(guildId, userId);

  const config = getGuildConfig(guildId);

  if (state.step === STEPS.EDIT_MENU) {
    await updateState(guildId, userId, { contentPreference: pref });
    const updatedState = await getState(guildId, userId);
    return interaction.update({
      embeds:     [embeds.buildEditMenuEmbed(updatedState, config)],
      components: components.buildEditMenuButtons(guildId, userId, config),
    });
  }

  await updateState(guildId, userId, { step: STEPS.INTRO, contentPreference: pref });

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

  let state = await getState(guildId, userId);
  if (!state) state = await initState(guildId, userId);

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

  const state = await getState(guildId, userId);
  if (!state) {
    return interaction.reply({ content: 'Session expired. Please click the verification button again.', flags: MessageFlags.Ephemeral });
  }

  const isEditMode = state.step === STEPS.EDIT_MENU;

  const intro = {
    displayName: interaction.fields.getTextInputValue('displayName').trim(),
    age:         interaction.fields.getTextInputValue('age').trim(),
    location:    interaction.fields.getTextInputValue('location')?.trim() || null,
    howFound:    interaction.fields.getTextInputValue('howFound').trim(),
    aboutYou:    interaction.fields.getTextInputValue('aboutYou').trim(),
    // Edit mode: preserve existing kinks — user only edited profile section
    kinks:      isEditMode ? (state.intro?.kinks      ?? null) : null,
    hardLimits: isEditMode ? (state.intro?.hardLimits ?? null) : null,
  };

  const ageNum = parseInt(intro.age);
  if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
    return interaction.reply({ content: 'Please enter a valid age between 13 and 100.', flags: MessageFlags.Ephemeral });
  }

  await updateState(guildId, userId, { intro });

  if (isEditMode) {
    const updatedState = await getState(guildId, userId);
    const config = getGuildConfig(guildId);
    return interaction.update({
      embeds:     [embeds.buildEditMenuEmbed(updatedState, config)],
      components: components.buildEditMenuButtons(guildId, userId, config),
    });
  }

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
    const state = await getState(guildId, userId);
    if (!state) {
      return interaction.reply({ content: 'Session expired. Please restart verification.', flags: MessageFlags.Ephemeral });
    }

    await updateState(guildId, userId, { step: STEPS.PENDING });

    await interaction.update({ embeds: [embeds.buildPendingEmbed()], components: [] });
    await postToModQueue(interaction, guildId, userId, await getState(guildId, userId));
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

  const state = await getState(guildId, userId);
  if (!state) {
    return interaction.reply({ content: 'Session expired. Please restart verification.', flags: MessageFlags.Ephemeral });
  }

  const kinks      = interaction.fields.getTextInputValue('kinks')?.trim()      || null;
  const hardLimits = interaction.fields.getTextInputValue('hardLimits')?.trim() || null;
  const updatedIntro = { ...state.intro, kinks, hardLimits };

  const isEditMode = state.step === STEPS.EDIT_MENU;

  if (isEditMode) {
    await updateState(guildId, userId, { intro: updatedIntro });
    const updatedState = await getState(guildId, userId);
    const config = getGuildConfig(guildId);
    return interaction.update({
      embeds:     [embeds.buildEditMenuEmbed(updatedState, config)],
      components: components.buildEditMenuButtons(guildId, userId, config),
    });
  }

  await updateState(guildId, userId, { step: STEPS.PENDING, intro: updatedIntro });

  await interaction.reply({
    embeds:     [embeds.buildPendingEmbed()],
    components: [],
    flags:      interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
  });

  await postToModQueue(interaction, guildId, userId, await getState(guildId, userId));
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
  if (!guild) return interaction.followUp({ content: 'Guild not found.', flags: MessageFlags.Ephemeral });

  try {
    // Fetch member and state in parallel — two independent network calls
    const [member, state] = await Promise.all([
      guild.members.fetch(userId),
      getState(guildId, userId),
    ]);

    const pref = state?.contentPreference ?? 'SFW';

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

    // Compute final role set in memory — single roles.set() replaces 8-15 sequential add/remove calls
    const toRemoveIds = new Set([
      config.roles.travelerRoleId,
      config.roles.initiateRoleId,
      config.roles.nsfwOnlyRoleId,
      config.roles.unverifiedRoleId,
      config.roles.verificationPendingRoleId,
    ].filter(Boolean));

    const toAddIds = [
      roleId,
      config.roles.baseRoleId,
      ...(state?.selectedRoles ? Object.values(state.selectedRoles).flat() : []),
    ].filter(Boolean);

    const finalRoleIds = [
      ...new Set([
        ...member.roles.cache.filter(r => !toRemoveIds.has(r.id)).map(r => r.id),
        ...toAddIds,
      ]),
    ];

    await member.roles.set(finalRoleIds);

    // All remaining ops are independent — run in parallel
    await Promise.all([
      member.user.send({
        embeds: [embeds.buildApprovedEmbed(guild.name, roleName)],
      }).catch(() => logger.warn('Could not DM approval to ' + member.user.tag)),

      (async () => {
        if (state?.intro && config.channels.introChannelId) {
          const introChannel = guild.channels.cache.get(config.channels.introChannelId);
          if (introChannel) {
            await introChannel.send({
              embeds:     [embeds.buildPublicIntroEmbed(member, state, config)],
              components: [components.buildIntroChannelButtons(userId)],
            }).catch(() => {});
          }
        }
      })(),

      // interaction.message IS the mod queue message — no need to re-fetch
      interaction.message.delete().catch(err =>
        logger.warn('Could not delete mod queue message: ' + err.message)
      ),

      (async () => {
        const verifiedLogChannel = guild.channels.cache.get(config.channels.verifiedLogChannelId);
        if (verifiedLogChannel) {
          await verifiedLogChannel.send({
            embeds: [embeds.buildVerifiedLogEmbed(member, interaction.user, roleName)],
          }).catch(() => {});
        }
      })(),

      (async () => {
        const logChannel = guild.channels.cache.get(config.channels.logChannelId);
        if (logChannel) {
          await logChannel.send({
            content: `✅ Verified: ${member.user.tag} → @${roleName} | By: ${interaction.user.tag}`,
          }).catch(() => {});
        }
      })(),
    ]);

    // Fire-and-forget DB ops — don't block the interaction response
    const roleAssigned = pref === 'NSFW_ONLY' ? 'NSFW_ONLY' : pref === 'NSFW' ? 'INITIATE' : 'TRAVELER';
    memberRepo.saveMemberOnVerify(userId, guildId, {
      contentPreference: pref,
      roleAssigned,
      selectedRoles: state?.selectedRoles,
      intro:         state?.intro,
    }).catch(err => logger.error('DB save failed on verify:', { error: err.message }));

    eventRepo.logEvent(userId, guildId, 'VERIFIED', {
      triggeredBy: interaction.user.id,
      notes:       `Approved by ${interaction.user.tag}`,
    }).catch(() => {});

    await clearState(guildId, userId);
    logger.info(member.user.tag + ' approved by ' + interaction.user.tag + ' in ' + guild.name);

  } catch (err) {
    logger.error('Failed to approve member ' + userId + ':', { error: err.message });
    await interaction.followUp({ content: 'Approval failed: ' + err.message, flags: MessageFlags.Ephemeral }).catch(() => {});
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

    // Remove pending role from cache — no sequential dependency on DM/delete
    const pendingRole = guild.roles.cache.get(config.roles.verificationPendingRoleId);
    if (pendingRole) await member.roles.remove(pendingRole).catch(() => {});

    // All remaining ops are independent — run in parallel
    await Promise.all([
      member.user.send({ embeds: [embeds.buildRejectedEmbed(reason)] }).catch(() => {}),

      interaction.message.delete().catch(err =>
        logger.warn('Could not delete mod queue message: ' + err.message)
      ),

      (async () => {
        const rejectedLogChannel = guild.channels.cache.get(config.channels.rejectedLogChannelId);
        if (rejectedLogChannel) {
          await rejectedLogChannel.send({
            embeds: [embeds.buildRejectedLogEmbed(member, interaction.user, reason)],
          }).catch(() => {});
        }
      })(),

      (async () => {
        const logChannel = guild.channels.cache.get(config.channels.logChannelId);
        if (logChannel) {
          await logChannel.send({
            content: `❌ Rejected: ${member.user.tag} | By: ${interaction.user.tag} | Reason: ${reason}`,
          }).catch(() => {});
        }
      })(),
    ]);

    memberRepo.updateMemberStatus(userId, guildId, 'REJECTED').catch(() => {});

    eventRepo.logEvent(userId, guildId, 'REJECTED', {
      triggeredBy: interaction.user.id,
      notes:       `Reason: ${reason}`,
    }).catch(() => {});

    await clearState(guildId, userId);
    logger.info(member.user.tag + ' rejected by ' + interaction.user.tag);

  } catch (err) {
    logger.error('Failed to reject member ' + userId + ':', { error: err.message });
    await interaction.followUp({ content: 'Rejection failed: ' + err.message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

// ============================================================
// SHARED HELPERS
// ============================================================

async function showContentPreference(interaction, guildId, userId, config) {
  await updateState(guildId, userId, { step: STEPS.CONTENT });
  await interaction.update({
    embeds:     [embeds.buildContentPrefEmbed(config)],
    components: [components.buildContentPrefButtons(guildId, userId, config.settings.nsfwEnabled)],
  });
}

async function postToModQueue(interaction, guildId, userId, state) {
  if (state?.modMessageId) {
    logger.warn(`Duplicate mod queue blocked for ${userId} — already queued`);
    return;
  }

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

    // Ping subscribed mods
    const subscribers = await modSubRepo.getEnabledSubscribers(guildId).catch(() => []);
    const mentions = subscribers.map(s => `<@${s.discord_user_id}>`).join(' ');

    const modMsg = await modQueueChannel.send({
      content:    mentions || undefined,
      embeds:     [embeds.buildModQueueEmbed(member, state, config)],
      components: [components.buildModQueueButtons(guildId, userId)],
    });

    await updateState(guildId, userId, { modMessageId: modMsg.id });

    memberRepo.updateMemberStatus(userId, guildId, 'AWAITING_MOD').catch(() => {});

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

// ============================================================
// PANEL ACTIONS
// ============================================================

async function panel_action(interaction, parts) {
  const sub     = parts[2];
  const guildId = parts[3];

  if (!interaction.member?.permissions.has('ManageRoles') &&
      !interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({ content: 'Mod panel is for moderators only.', flags: MessageFlags.Ephemeral });
  }

  if      (sub === 'refresh')       await panel_refresh(interaction, guildId);
  else if (sub === 'notify')        await panel_showNotifyPrefs(interaction, guildId);
  else if (sub === 'notify-toggle') await panel_toggleNotify(interaction, guildId);
  else if (sub === 'settings')      await panel_showSettings(interaction, guildId);
  else if (sub === 'stg-reminder')  await panel_toggleSetting(interaction, guildId, 'reminderEnabled');
  else if (sub === 'stg-kick')      await panel_toggleSetting(interaction, guildId, 'autoKickEnabled');
  else if (sub === 'stg-invite')    await panel_toggleSetting(interaction, guildId, 'kickInviteEnabled');
  else if (sub === 'stg-edit')      await panel_editSettings(interaction, guildId);
  else if (sub === 'timerange')     await panel_timeRange(interaction, guildId);
  else if (sub === 'rejections')    await panel_showRejections(interaction, guildId);
}

async function panel_refresh(interaction, guildId) {
  await interaction.deferUpdate();
  try {
    const config = getGuildConfig(guildId);
    const days   = config?.panelTimeRange ?? 7;
    const [stats, subscriberCount] = await Promise.all([
      statsRepo.getStats(guildId, days),
      modSubRepo.getEnabledCount(guildId),
    ]);
    await interaction.editReply({
      embeds:     [embeds.buildModPanelEmbed(stats, subscriberCount, days)],
      components: components.buildModPanelComponents(guildId),
    });
  } catch (err) {
    logger.error('Panel refresh failed:', { error: err.message });
    await interaction.followUp({ content: 'Failed to refresh stats.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function panel_timeRange(interaction, guildId) {
  await interaction.deferUpdate();
  try {
    const days   = parseInt(interaction.values[0]);
    const config = getGuildConfig(guildId);
    if (config) config.panelTimeRange = days;
    const [stats, subscriberCount] = await Promise.all([
      statsRepo.getStats(guildId, days),
      modSubRepo.getEnabledCount(guildId),
    ]);
    await interaction.editReply({
      embeds:     [embeds.buildModPanelEmbed(stats, subscriberCount, days)],
      components: components.buildModPanelComponents(guildId),
    });
  } catch (err) {
    logger.error('Panel time range failed:', { error: err.message });
    await interaction.followUp({ content: 'Failed to update stats.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function panel_showRejections(interaction, guildId) {
  const config  = getGuildConfig(guildId);
  const days    = config?.panelTimeRange ?? 7;
  const reasons = await statsRepo.getTopRejectionReasons(guildId, days).catch(() => []);
  await interaction.reply({
    embeds: [embeds.buildRejectionStatsEmbed(reasons, days)],
    flags:  MessageFlags.Ephemeral,
  });
}

async function panel_showNotifyPrefs(interaction, guildId) {
  const subscribed = await modSubRepo.isSubscribed(interaction.user.id, guildId).catch(() => false);
  await interaction.reply({
    embeds: [{
      color:       subscribed ? 0x57F287 : 0xED4245,
      title:       '🔔 Your Notification Preference',
      description: subscribed
        ? "You're **subscribed** — you'll be pinged when a new verification arrives."
        : "You're **unsubscribed** — you won't receive pings for new verifications.",
    }],
    components: [components.buildNotifyToggleButton(guildId, subscribed)],
    flags:      MessageFlags.Ephemeral,
  });
}

async function panel_toggleNotify(interaction, guildId) {
  const newState = await modSubRepo.toggleSubscription(interaction.user.id, guildId).catch(() => null);
  if (newState === null) {
    return interaction.update({ content: 'Failed to update preference.', components: [] });
  }
  await interaction.update({
    embeds: [{
      color:       newState ? 0x57F287 : 0xED4245,
      title:       '🔔 Notifications Updated',
      description: newState
        ? "✅ Notifications **enabled** — you'll be pinged on new verifications."
        : "🔕 Notifications **disabled** — no more pings.",
    }],
    components: [components.buildNotifyToggleButton(guildId, newState)],
  });
}

async function panel_showSettings(interaction, guildId) {
  const config     = getGuildConfig(guildId);
  // DB is source of truth — falls back to JSON defaults if no DB row yet
  const dbSettings = await settingsRepo.getVerifSettings(guildId).catch(() => null);
  const settings   = dbSettings ?? config?.verificationSettings ?? {};
  await interaction.reply({
    embeds:     [embeds.buildVerifSettingsEmbed(settings)],
    components: [components.buildVerifSettingsComponents(guildId, settings)],
    flags:      MessageFlags.Ephemeral,
  });
}

async function panel_toggleSetting(interaction, guildId, key) {
  const config     = getGuildConfig(guildId);
  const dbSettings = await settingsRepo.getVerifSettings(guildId).catch(() => null);
  const current    = dbSettings ?? config?.verificationSettings ?? {};
  const updated    = { ...current, [key]: !current[key] };
  await settingsRepo.saveVerifSettings(guildId, updated);
  // Keep in-memory cache in sync so scheduled job picks up changes immediately
  if (config) config.verificationSettings = updated;
  await interaction.update({
    embeds:     [embeds.buildVerifSettingsEmbed(updated)],
    components: [components.buildVerifSettingsComponents(guildId, updated)],
  });
}

async function panel_editSettings(interaction, guildId) {
  const config     = getGuildConfig(guildId);
  const dbSettings = await settingsRepo.getVerifSettings(guildId).catch(() => null);
  const settings   = dbSettings ?? config?.verificationSettings;
  await interaction.showModal(components.buildVerifSettingsModal(guildId, settings));
}

async function modal_saveVerifSettings(interaction, parts) {
  const guildId = parts[3];

  if (!interaction.member?.permissions.has('ManageRoles') &&
      !interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({ content: 'Mod panel is for moderators only.', flags: MessageFlags.Ephemeral });
  }

  const reminderHoursRaw = parseInt(interaction.fields.getTextInputValue('reminderHours').trim());
  const autoKickHoursRaw = parseInt(interaction.fields.getTextInputValue('autoKickHours').trim());
  const inviteLink       = interaction.fields.getTextInputValue('inviteLink').trim() || '';

  if (isNaN(reminderHoursRaw) || reminderHoursRaw < 1 || isNaN(autoKickHoursRaw) || autoKickHoursRaw < 1) {
    return interaction.reply({ content: '❌ Invalid hours — enter a positive number (minimum 1).', flags: MessageFlags.Ephemeral });
  }

  const config     = getGuildConfig(guildId);
  const dbSettings = await settingsRepo.getVerifSettings(guildId).catch(() => null);
  const current    = dbSettings ?? config?.verificationSettings ?? {};
  const updated    = {
    ...current,
    reminderHours:  reminderHoursRaw,
    autoKickHours:  autoKickHoursRaw,
    kickInviteLink: inviteLink,
  };
  await settingsRepo.saveVerifSettings(guildId, updated);
  if (config) config.verificationSettings = updated;

  await interaction.reply({
    embeds:     [embeds.buildVerifSettingsEmbed(updated)],
    components: [components.buildVerifSettingsComponents(guildId, updated)],
    flags:      MessageFlags.Ephemeral,
  });
}

// ============================================================
// SLASH COMMAND HANDLERS
// ============================================================

async function handleSlashCommand(interaction) {
  const cmd = interaction.commandName;
  if      (cmd === 'ping')            await cmd_ping(interaction);
  else if (cmd === 'setup-verify')    await cmd_setupVerify(interaction);
  else if (cmd === 'setup-mod-panel') await cmd_setupModPanel(interaction);
  else if (cmd === 'edit-config')     await cmd_editConfig(interaction);
  else if (cmd === 'reload-config')   await cmd_reloadConfig(interaction);
  else if (cmd === 'verify-me')       await cmd_verifyMe(interaction);
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

async function cmd_setupModPanel(interaction) {
  if (!interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({ content: 'Administrator permission required.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guildId = interaction.guildId;
    const [stats, subscriberCount] = await Promise.all([
      statsRepo.getStats(guildId, 7),
      modSubRepo.getEnabledCount(guildId),
    ]);

    const panelMsg = await interaction.channel.send({
      embeds:     [embeds.buildModPanelEmbed(stats, subscriberCount, 7)],
      components: components.buildModPanelComponents(guildId),
    });

    await panelMsg.pin().catch(() => logger.warn('Could not pin mod panel — pin it manually'));

    saveGuildConfig(interaction.guildId, {
      panelMessageId: panelMsg.id,
      panelChannelId: interaction.channelId,
    });

    await interaction.editReply({ content: '✅ Mod panel posted and pinned in this channel!' });
    logger.info('/setup-mod-panel run by ' + interaction.user.tag);
  } catch (err) {
    logger.error('/setup-mod-panel failed:', { error: err.message });
    await interaction.editReply({ content: 'Failed: ' + err.message });
  }
}

async function cmd_editConfig(interaction) {
  if (!interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({ content: 'Administrator permission required.', flags: MessageFlags.Ephemeral });
  }
  const config = getGuildConfig(interaction.guildId);
  if (!config) {
    return interaction.reply({ content: 'Guild config not found.', flags: MessageFlags.Ephemeral });
  }
  await interaction.showModal(components.buildEditConfigModal(interaction.guildId, config));
}

async function modal_saveConfig(interaction, parts) {
  const guildId = parts[3];

  if (!interaction.member?.permissions.has('Administrator')) {
    return interaction.reply({ content: 'Administrator permission required.', flags: MessageFlags.Ephemeral });
  }

  const overrides = {
    welcomeTitle:       interaction.fields.getTextInputValue('welcomeTitle').trim(),
    welcomeDescription: interaction.fields.getTextInputValue('welcomeDescription').trim(),
    rulesTitle:         interaction.fields.getTextInputValue('rulesTitle').trim(),
    rulesText:          interaction.fields.getTextInputValue('rulesText').trim(),
  };

  await settingsRepo.saveConfigOverrides(guildId, overrides);
  applyConfigOverrides(guildId, overrides);

  await interaction.reply({
    embeds: [{
      color:       0x57F287,
      title:       '✅ Config Updated',
      description: 'Welcome message and rules text updated successfully. Changes are live immediately.',
      fields: [
        { name: 'Welcome Title',    value: overrides.welcomeTitle,   inline: false },
        { name: 'Rules Title',      value: overrides.rulesTitle,     inline: false },
      ],
    }],
    flags: MessageFlags.Ephemeral,
  });

  logger.info(`/edit-config used by ${interaction.user.tag} in guild ${guildId}`);
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

  await clearState(guildId, userId);
  await initState(guildId, userId);
  await updateState(guildId, userId, { step: STEPS.RULES });

  await interaction.reply({
    content:    'Verification restarted! Let\'s go from the top:',
    embeds:     [embeds.buildRulesEmbed(config)],
    components: [components.buildRulesButtons(guildId, userId)],
    flags:      MessageFlags.Ephemeral,
  });
}

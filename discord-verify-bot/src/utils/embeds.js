// ============================================================
// EMBEDS — Discord ke fancy colored boxes banata hai
//
// Discord mein jab bhi ek formatted box message aata hai
// usse "Embed" kehte hain. EmbedBuilder use karke yeh bante hain.
//
// Saare embeds yahan centralize hain taaki consistent look rahe
// aur future mein ek jagah se change ho sake.
// ============================================================

const { EmbedBuilder } = require('discord.js');

// ---- Color constants (hex codes) ----
const COLORS = {
  BLURPLE:  0x5865F2, // Discord blue-purple
  GREEN:    0x57F287, // Success
  YELLOW:   0xFEE75C, // Pending/warning
  RED:      0xED4245, // Error/danger
  CYAN:     0x00B0F4, // Auto-verify / info
  PINK:     0xEB459E, // Content preference
};

/**
 * Welcome embed — pehla message jo new member ko milta hai
 */
function buildWelcomeEmbed(config) {
  const title = (config.messages.welcomeTitle || 'Welcome! 👋')
    .replace('{serverName}', config.guildName);

  return new EmbedBuilder()
    .setColor(COLORS.BLURPLE)
    .setTitle(title)
    .setDescription(config.messages.welcomeDescription || 'Complete verification to access the server.')
    .addFields(
      { name: '⏱️ Time Required', value: 'About 2 minutes', inline: true },
      { name: '📋 Total Steps',   value: '4 quick steps',   inline: true },
    )
    .setFooter({ text: `${config.guildName} Verification System` })
    .setTimestamp();
}

/**
 * Rules embed — Step 1
 */
function buildRulesEmbed(config) {
  return new EmbedBuilder()
    .setColor(COLORS.YELLOW)
    .setTitle(config.messages.rulesTitle || '📜 Server Rules')
    .setDescription(config.messages.rulesText || 'Please follow the server rules.')
    .setFooter({ text: 'Step 1 of 4 — Read and agree to continue' });
}

/**
 * Role selection embed — Step 2, ek per category
 */
function buildRoleSelectionEmbed(config, categoryIndex) {
  const category = config.roleCategories[categoryIndex];
  const total    = config.roleCategories.length;

  return new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle(`🏷️ Pick Your Roles — ${category.name}`)
    .setDescription(category.description || `Select your ${category.name.toLowerCase()} below.`)
    .addFields(
      { name: 'Minimum',  value: `${category.minSelect || 1} required`, inline: true },
      { name: 'Maximum',  value: `${category.maxSelect || 5} allowed`,  inline: true },
    )
    .setFooter({ text: `Step 2 of 4 — Category ${categoryIndex + 1} of ${total}` });
}

/**
 * Content preference embed — Step 3 (SFW / SFW+NSFW / NSFW Only)
 */
function buildContentPrefEmbed(config) {
  let desc = `Choose which content you'd like access to:\n\n`;
  desc += `🌞 **SFW Only** → **@Traveler** role\n`;
  desc += `Access to all regular (non-adult) channels\n\n`;

  if (config.settings.nsfwEnabled) {
    desc += `🌗 **SFW + NSFW** → **@Initiate** role\n`;
    desc += `Access to ALL channels including adult content\n\n`;
    desc += `🔞 **NSFW Only** → NSFW-only role\n`;
    desc += `Access to adult-only channels only\n\n`;
    desc += `*You must be **18+** to select any NSFW option.*`;
  }

  return new EmbedBuilder()
    .setColor(COLORS.PINK)
    .setTitle('🔒 Content Preference')
    .setDescription(desc)
    .setFooter({ text: 'Step 3 of 4 — This can be changed later by a moderator' });
}

/**
 * Introduction prompt embed — Step 4 (button se modal open hoga)
 */
function buildIntroPromptEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.BLURPLE)
    .setTitle('📝 Write Your Introduction')
    .setDescription(
      `Almost done! Click the button below to fill out your intro.\n\n` +
      `**You'll be asked for:**\n` +
      `• Your name or nickname\n` +
      `• Your age\n` +
      `• Where you're from *(optional)*\n` +
      `• How you found the server\n` +
      `• A brief intro about yourself\n\n` +
      `After that, there's a **skippable** form for:\n` +
      `• Kinks *(optional)*\n` +
      `• Hard limits *(optional)*`
    )
    .setFooter({ text: 'Step 4 of 4 — A moderator will review your intro' });
}

/**
 * Pending embed — user ko submission ke baad milta hai
 */
function buildPendingEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.YELLOW)
    .setTitle('⏳ Verification Submitted!')
    .setDescription(
      `Your introduction has been sent to the mod team for review.\n\n` +
      `✅ A moderator will check it within **24 hours**.\n` +
      `📩 You'll receive a DM here once you're approved.`
    )
    .setTimestamp();
}

/**
 * Approval DM — user ko verify hone pe milta hai
 */
function buildApprovedEmbed(guildName, roleName) {
  return new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle('✅ You\'ve Been Verified!')
    .setDescription(
      `Welcome to **${guildName}**! 🎉\n\n` +
      `You've been given the **@${roleName}** role.\n` +
      `Head back to the server and enjoy!`
    )
    .setTimestamp();
}

/**
 * Rejection DM — user ko rejection ke saath reason milta hai
 */
function buildRejectedEmbed(reason) {
  return new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle('❌ Verification Needs Attention')
    .setDescription(
      `A moderator reviewed your introduction and needs more information.\n\n` +
      `**Reason:** ${reason}\n\n` +
      `Please go back to the server and restart the verification process, keeping the above in mind.`
    )
    .setTimestamp();
}

/**
 * Mod queue card — mods ko dikhai deta hai (formatted info + Approve/Reject buttons)
 */
function buildModQueueEmbed(member, state, config) {
  const { intro, contentPreference, selectedRoles } = state;

  // Har category ke selected roles ko readable string mein convert karo
  const roleLines = config.roleCategories.map((cat, i) => {
    const ids = selectedRoles?.[i] || [];
    const labels = ids.map(id => {
      const r = cat.roles.find(role => role.id === id);
      return r ? `${r.emoji || ''} ${r.label}` : id;
    });
    return `**${cat.name}:** ${labels.join(', ') || '_None_'}`;
  }).join('\n');

  const prefLabel = contentPreference === 'NSFW_ONLY'
    ? '🔞 NSFW Only'
    : contentPreference === 'NSFW'
    ? '🌗 SFW + NSFW → @Initiate'
    : '🌞 SFW Only → @Traveler';

  // Account age check — fresh accounts are suspicious
  const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  const ageWarning = accountAgeDays < 30 ? '\n⚠️ **Account less than 30 days old**' : '';

  // Personal profile block — Name, Age, Location, Content Pref in one scannable field
  const profileLines = [
    `**Name:** ${intro?.displayName || '_Not provided_'}`,
    `**Age:** ${intro?.age || '_Not provided_'}`,
    intro?.location ? `**Location:** ${intro.location}` : null,
    `**Content:** ${prefLabel}`,
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(COLORS.YELLOW)
    .setTitle('📋 New Verification Request')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 User',            value: `${member.user.tag}\n<@${member.id}>\nID: \`${member.id}\`${ageWarning}`, inline: true },
      { name: '📅 Joined Server',   value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
      { name: '🎂 Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R> (${accountAgeDays}d ago)`, inline: true },
      { name: '👤 Profile',         value: profileLines },
    );

  embed.addFields(
    { name: '🔍 How They Found Us', value: intro?.howFound || '_Not provided_' },
    { name: '📝 Introduction',       value: intro?.aboutYou || '_Not provided_' },
  );

  if (intro?.kinks) {
    embed.addFields({ name: '🔗 Kinks', value: intro.kinks });
  }
  if (intro?.hardLimits) {
    embed.addFields({ name: '🚫 Hard Limits', value: intro.hardLimits });
  }

  embed.addFields({ name: '🏷️ Selected Roles', value: roleLines || '_None_' });

  if (state.previousIntro) {
    const prev = state.previousIntro;
    const DIFF_FIELDS = [
      { key: 'displayName', label: 'Name' },
      { key: 'age',         label: 'Age' },
      { key: 'location',    label: 'Location' },
      { key: 'howFound',    label: 'How Found' },
      { key: 'aboutYou',   label: 'Introduction' },
      { key: 'kinks',      label: 'Kinks' },
      { key: 'hardLimits', label: 'Hard Limits' },
    ];
    const trunc = (val, n = 60) => val ? (val.length > n ? val.slice(0, n) + '…' : val) : null;

    const changes = DIFF_FIELDS
      .filter(f => (prev[f.key] ?? null) !== (intro[f.key] ?? null))
      .map(f => {
        const oldVal = trunc(prev[f.key]) ?? '_empty_';
        const newVal = trunc(intro[f.key]) ?? '_empty_';
        return `**${f.label}:** ~~${oldVal}~~ → **${newVal}**`;
      });

    embed.addFields({
      name:  '✏️ Changes from Previous Submission',
      value: changes.length > 0 ? changes.join('\n') : '_No text changes detected_',
    });
  }

  embed
    .setFooter({ text: 'Use buttons below to approve or reject' })
    .setTimestamp();

  return embed;
}

/**
 * Auto-verify embed — returning verified member ke liye
 */
function buildAutoVerifyEmbed(guildName, roleName, firstJoinedTimestamp) {
  return new EmbedBuilder()
    .setColor(COLORS.CYAN)
    .setTitle('⚡ Welcome Back! Auto-Verified')
    .setDescription(
      `Hey! You were previously a verified member of **${guildName}**.\n\n` +
      `You've been automatically re-assigned the **@${roleName}** role.\n` +
      `No need to verify again. Welcome back! 🎉`
    )
    .addFields(
      { name: '📅 First Joined', value: `<t:${Math.floor(firstJoinedTimestamp / 1000)}:D>`, inline: true },
    )
    .setTimestamp();
}

/**
 * Public intro embed — approval ke baad intro channel mein post hota hai
 *
 * Sab fields DYNAMIC hain — sirf wahi show hoga jo user ne fill kiya.
 * Gender + Pronouns config ke roleCategories se extract hote hain.
 * Title = "{displayName} joined!" (not generic "New Member Introduction")
 */
function buildPublicIntroEmbed(member, state, config) {
  const { intro, contentPreference, selectedRoles } = state;

  // ---- Content access badge ----
  const badge = contentPreference === 'NSFW_ONLY'
    ? '🔞 NSFW Only'
    : contentPreference === 'NSFW'
    ? '🌗 SFW + NSFW'
    : '🌞 SFW Only';

  // ---- All role categories → one compact block (bold category name + values per line) ----
  const roleLines = config.roleCategories
    .map((cat, i) => {
      const ids = selectedRoles?.[i] || [];
      if (!ids.length) return null;
      const labels = ids
        .map(id => {
          const r = cat.roles.find(role => role.id === id);
          return r ? `${r.emoji || ''} ${r.label}`.trim() : null;
        })
        .filter(Boolean)
        .join(', ');
      return labels ? `**${cat.name}:** ${labels}` : null;
    })
    .filter(Boolean)
    .join('\n');

  // ---- Build embed ----
  const displayName = intro?.displayName || member.user.displayName;

  const embed = new EmbedBuilder()
    .setColor(COLORS.BLURPLE)
    .setTitle(`👋 ${displayName} joined!`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setDescription(`Say hello to our newest member! 🎉`);

  // About Me — always shown (required field)
  if (intro?.aboutYou) {
    embed.addFields({ name: '💬 About Me', value: intro.aboutYou });
  }

  // Inline trio: Location | Age | Access
  if (intro?.location) {
    embed.addFields({ name: '📍 Location', value: intro.location, inline: true });
  }
  if (intro?.age) {
    embed.addFields({ name: '🎂 Age', value: intro.age, inline: true });
  }
  embed.addFields({ name: '🔒 Access', value: badge, inline: true });

  // Role categories block — full width, easy to scan
  if (roleLines) {
    embed.addFields({ name: '🏷️ Roles', value: roleLines });
  }

  // How they found us
  if (intro?.howFound) {
    embed.addFields({ name: '🔍 How I Found Here', value: intro.howFound });
  }

  // Kinks & Hard Limits — only show if user provided them (optional step)
  if (intro?.kinks) {
    embed.addFields({ name: '🔗 Kinks', value: intro.kinks });
  }
  if (intro?.hardLimits) {
    embed.addFields({ name: '🚫 Hard Limits', value: intro.hardLimits });
  }

  embed
    .setFooter({ text: `Discord: ${member.user.tag}` })
    .setTimestamp();

  return embed;
}

/**
 * Verify panel embed — persistent message jo verify channel mein ek baar post hota hai
 * Saare unverified users isko dekhte hain aur button click karte hain
 */
function buildVerifyPanelEmbed(config) {
  const title = (config.messages.welcomeTitle || 'Welcome! 👋 Let\'s Get You Verified')
    .replace('{serverName}', config.guildName);

  return new EmbedBuilder()
    .setColor(COLORS.BLURPLE)
    .setTitle(title)
    .setDescription(config.messages.welcomeDescription || 'Click the button below to start verification and unlock the server.')
    .addFields(
      { name: '⏱️ Time Required',    value: 'About 3 minutes',                                     inline: true },
      { name: '📋 Steps',            value: '4 quick steps + optional kinks form',                  inline: true },
      { name: '🔄 Already started?', value: 'Click the button — it will continue or show your status.', inline: false },
    )
    .setFooter({ text: `${config.guildName} • Verification System` });
}

/**
 * Part 2 prompt embed — location + hard limits (optional)
 * Intro modal submit ke baad dikhta hai
 */
function buildKinksStepEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.PINK)
    .setTitle('🔗 Kinks & Hard Limits (Optional)')
    .setDescription(
      `This step is **completely optional** — both fields can be left blank.\n\n` +
      `• 🔗 **Kinks** — your interests and turn-ons\n` +
      `• 🚫 **Hard limits** — things you absolutely won't engage with\n\n` +
      `Hit **Add Kinks & Limits** to open the form, or **Skip & Submit** to go straight to submission.`
    )
    .setFooter({ text: 'Optional — you can skip this' });
}

/**
 * Verified log embed — verifiedLogChannel mein post hota hai jab mod approve kare
 */
function buildVerifiedLogEmbed(member, modUser, roleName) {
  const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  return new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle('✅ Member Verified')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 User',         value: `${member.user.tag}\n<@${member.id}>`, inline: true },
      { name: '🎭 Role Assigned', value: `@${roleName}`,                        inline: true },
      { name: '👮 Approved By',   value: modUser.tag,                            inline: true },
    )
    .setFooter({ text: `Account age: ${accountAgeDays}d` })
    .setTimestamp();
}

/**
 * Rejected log embed — rejectedLogChannel mein post hota hai jab mod reject kare
 */
function buildRejectedLogEmbed(member, modUser, reason) {
  const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  return new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle('❌ Verification Rejected')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 User',       value: `${member.user.tag}\n<@${member.id}>`, inline: true },
      { name: '👮 Rejected By', value: modUser.tag,                           inline: true },
      { name: '📝 Reason',      value: reason },
    )
    .setFooter({ text: `Account age: ${accountAgeDays}d` })
    .setTimestamp();
}

/**
 * Mod panel embed — #mod-panel mein pinned rehta hai, stats + subscriber count dikhata hai
 */
function buildModPanelEmbed(stats, subscriberCount, days = 7) {
  const avgTime    = stats.avgVerifyHours > 0 ? `${stats.avgVerifyHours}h` : 'N/A';
  const rangeLabel = days === 0 ? 'All Time' : `Last ${days} Days`;
  return new EmbedBuilder()
    .setColor(COLORS.BLURPLE)
    .setTitle('🤖 VerifyBot — Mod Panel')
    .setDescription(`📅 Showing: **${rangeLabel}**`)
    .addFields(
      // Row 1 — activity (last 7 days)
      { name: '📥 Joins (7d)',      value: `**${stats.joins}**`,        inline: true },
      { name: '✅ Verified',        value: `**${stats.verified}**`,     inline: true },
      { name: '❌ Rejected',        value: `**${stats.rejected}**`,     inline: true },
      // Row 2 — timing (blank fills 3rd slot to keep grid even)
      { name: '⚡ Auto-Verified',   value: `**${stats.autoVerified}**`, inline: true },
      { name: '⏱️ Avg Verify Time', value: `**${avgTime}**`,            inline: true },
      { name: '​',             value: '​',                    inline: true },
      // Divider
      { name: '​',             value: '──────────────────────',    inline: false },
      // Row 3 — current queue status
      { name: '👥 Not Started',     value: `**${stats.totalUnverified}**`,    inline: true },
      { name: '⏳ Pending Review',  value: `**${stats.totalPendingReview}**`, inline: true },
      { name: '🔔 Subscribed Mods', value: `**${subscriberCount}**`,          inline: true },
    )
    .setFooter({ text: 'Last refreshed' })
    .setTimestamp();
}

/**
 * Rejection reasons breakdown — ephemeral, shown from mod panel
 */
function buildRejectionStatsEmbed(reasons, days) {
  const rangeLabel = days === 0 ? 'All Time' : `Last ${days} Days`;
  const desc = reasons.length === 0
    ? '_No rejections recorded in this period._'
    : reasons.map((r, i) => `**${i + 1}.** ${r.reason} — \`${r.count}×\``).join('\n');
  return new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle(`📊 Top Rejection Reasons — ${rangeLabel}`)
    .setDescription(desc)
    .setTimestamp();
}

/**
 * Reminder DM — unverified member ko milta hai after reminderHours
 */
function buildReminderDMEmbed(guildName, autoKickEnabled, autoKickHours) {
  let desc = `Hey! You haven't completed your verification in **${guildName}** yet.\n\n`;
  desc += `Head back to the server and click the **🔐 Start Verification** button in the verify channel.\n\n`;
  if (autoKickEnabled && autoKickHours > 0) {
    desc += `⚠️ You have **${autoKickHours} hours from joining** to complete verification — after that you'll be removed from the server.`;
  } else {
    desc += `Take your time — just don't forget to complete it! 😊`;
  }
  return new EmbedBuilder()
    .setColor(COLORS.YELLOW)
    .setTitle('⏰ Reminder — Complete Your Verification!')
    .setDescription(desc)
    .setTimestamp();
}

/**
 * Kick DM — auto-kicked member ko milta hai with optional invite link
 */
function buildKickDMEmbed(guildName, inviteLink) {
  let desc = `You've been removed from **${guildName}** because you didn't complete the verification process in time.\n\n`;
  desc += inviteLink
    ? `You're welcome to rejoin and try again:\n${inviteLink}`
    : `If you'd like to rejoin, please ask a server member for an invite link.`;
  return new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle('🚪 Removed — Verification Timeout')
    .setDescription(desc)
    .setTimestamp();
}

/**
 * Verification settings embed — mod panel settings page
 */
function buildVerifSettingsEmbed(settings) {
  const s = settings || {};
  const reminderStatus = s.reminderEnabled
    ? `✅ ON — reminder after **${s.reminderHours ?? 12}h**`
    : '❌ OFF';
  const kickStatus = s.autoKickEnabled
    ? `✅ ON — kick after **${s.autoKickHours ?? 24}h**`
    : '❌ OFF';
  const inviteStatus = s.kickInviteEnabled
    ? (s.kickInviteLink ? `✅ ON — \`${s.kickInviteLink}\`` : '✅ ON — *(no link set — edit to add)*')
    : '❌ OFF';

  return new EmbedBuilder()
    .setColor(COLORS.BLURPLE)
    .setTitle('⚙️ Verification Settings')
    .setDescription('Configure auto-reminder and auto-kick for unverified members.')
    .addFields(
      { name: '⏰ Reminder DM',     value: reminderStatus },
      { name: '🚪 Auto-Kick',       value: kickStatus },
      { name: '🔗 Invite on Kick',  value: `${inviteStatus}\n*(only applies when auto-kick is ON)*` },
    )
    .setFooter({ text: 'Toggle buttons to turn on/off · Edit Hours & Link to change values' });
}

/**
 * Generic error embed
 */
function buildErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle('❌ Something Went Wrong')
    .setDescription(message || 'An unexpected error occurred. Please try again or contact a moderator.')
    .setTimestamp();
}

/**
 * Edit menu embed — user apne pending submission ke specific parts edit kar sake
 */
function buildEditMenuEmbed(state, config) {
  const intro = state?.intro ?? {};
  const pref  = state?.contentPreference;

  const prefLabels = { SFW: '🌞 SFW Only', NSFW: '🌗 SFW + NSFW', NSFW_ONLY: '🔞 NSFW Only' };

  const fields = [
    { name: '📛 Name',    value: intro.displayName || '_not set_', inline: true },
    { name: '🎂 Age',     value: String(intro.age  || '_not set_'), inline: true },
    { name: '📍 Location', value: intro.location   || '_not set_', inline: true },
    { name: '🎭 Content Preference', value: prefLabels[pref] || '_not set_', inline: true },
    { name: '🔞 Kinks',       value: intro.kinks      ? '✅ Provided' : '_not provided_', inline: true },
    { name: '🚫 Hard Limits', value: intro.hardLimits ? '✅ Provided' : '_not provided_', inline: true },
    {
      name:  '📝 About You',
      value: intro.aboutYou
        ? (intro.aboutYou.length > 120 ? intro.aboutYou.slice(0, 120) + '…' : intro.aboutYou)
        : '_not set_',
      inline: false,
    },
  ];

  if (config?.settings?.requireRoleSelection && state?.selectedRoles) {
    const allIds = Object.values(state.selectedRoles).flat();
    fields.push({
      name:  '🏷️ Selected Roles',
      value: allIds.length > 0 ? allIds.map(id => `<@&${id}>`).join(', ') : '_none_',
      inline: false,
    });
  }

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('✏️ Edit Your Submission')
    .setDescription('Select what you\'d like to change. Click **Submit** when you\'re ready to resubmit.')
    .addFields(fields)
    .setFooter({ text: 'Only the sections you edit will change — the rest stays as-is.' });
}

module.exports = {
  buildWelcomeEmbed,
  buildVerifyPanelEmbed,
  buildRulesEmbed,
  buildRoleSelectionEmbed,
  buildContentPrefEmbed,
  buildIntroPromptEmbed,
  buildKinksStepEmbed,
  buildPendingEmbed,
  buildApprovedEmbed,
  buildRejectedEmbed,
  buildPublicIntroEmbed,
  buildModQueueEmbed,
  buildAutoVerifyEmbed,
  buildVerifiedLogEmbed,
  buildRejectedLogEmbed,
  buildModPanelEmbed,
  buildRejectionStatsEmbed,
  buildReminderDMEmbed,
  buildKickDMEmbed,
  buildVerifSettingsEmbed,
  buildEditMenuEmbed,
  buildErrorEmbed,
};

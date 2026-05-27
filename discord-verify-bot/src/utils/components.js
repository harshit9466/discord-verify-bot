// ============================================================
// COMPONENTS — Discord UI elements (Buttons, Dropdowns, Modals)
//
// Discord ke 3 main interactive elements:
//   1. Button — click karo
//   2. StringSelectMenu — dropdown se choose karo
//   3. Modal — popup form (like a dialog box)
//
// CustomId Format (IMPORTANT):
//   "verif:{action}:{sub}:{guildId}:{userId}"
//
//   Har button/menu ke customId mein guildId aur userId encode hote hain
//   taaki DMs mein bhi pata chale kaunse guild ke liye hai.
//   Discord customId max length = 100 characters.
// ============================================================

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

// ============================================================
// BUTTONS
// ============================================================

/**
 * "Begin Verification" button — DM mode mein per-user message ke saath aata hai
 * customId: verif:begin:{guildId}:{userId}
 */
function buildBeginButton(guildId, userId) {
  const btn = new ButtonBuilder()
    .setCustomId(`verif:begin:${guildId}:${userId}`)
    .setLabel('Begin Verification →')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🔐');

  return new ActionRowBuilder().addComponents(btn);
}

/**
 * Persistent "Start Verification" button — verify channel mein EK baar post hoga
 * Koi bhi unverified user click kar sakta hai — no userId in customId
 * customId: verif:begin:{guildId}
 */
function buildPersistentVerifyButton(guildId) {
  const btn = new ButtonBuilder()
    .setCustomId(`verif:begin:${guildId}`)
    .setLabel('🔐 Start Verification')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(btn);
}

/**
 * "Edit & Resubmit" button — jab user pehle se PENDING state mein ho
 * Ephemeral "pending" message ke saath dikhta hai — restart ka option deta hai
 * customId: verif:restart:{guildId}:{userId}
 */
function buildRestartVerifyButton(guildId, userId) {
  const restart = new ButtonBuilder()
    .setCustomId(`verif:restart:${guildId}:${userId}`)
    .setLabel('✏️ Edit & Resubmit')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(restart);
}

/**
 * Rules agree/disagree buttons — Step 1
 */
function buildRulesButtons(guildId, userId) {
  const agree = new ButtonBuilder()
    .setCustomId(`verif:rules:agree:${guildId}:${userId}`)
    .setLabel('✅ I Agree to the Rules')
    .setStyle(ButtonStyle.Success);

  const disagree = new ButtonBuilder()
    .setCustomId(`verif:rules:disagree:${guildId}:${userId}`)
    .setLabel('❌ I Do Not Agree')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(agree, disagree);
}

/**
 * Role selection dropdown — Step 2, ek per category
 * currentSelections = already selected role IDs (for editing later)
 *
 * BUG FIX: setDefault(false) unconditionally call karne se discord.js internally
 * kuch versions mein maxValues reset kar deta tha. Fix: sirf setDefault(true) call karo
 * jab role actually pre-selected ho.
 * Also: addOptions() PEHLE call karo, phir setMinValues/setMaxValues — ordering matters.
 */
function buildRoleSelectMenu(config, categoryIndex, guildId, userId, currentSelections = []) {
  const category = config.roleCategories[categoryIndex];

  const options = category.roles.map(role => {
    const option = new StringSelectMenuOptionBuilder()
      .setValue(role.id)
      .setLabel(role.label)
      .setEmoji(role.emoji || '🔹');

    // ONLY call setDefault(true) when this role is actually pre-selected.
    // Calling setDefault(false) unconditionally interferes with maxValues in discord.js.
    if (currentSelections.includes(role.id)) {
      option.setDefault(true);
    }

    // setDescription sirf tab call karo jab value ho — empty string Discord reject karta hai
    if (role.description && role.description.trim().length > 0) {
      option.setDescription(role.description.trim());
    }

    return option;
  });

  // Explicit Number() conversion — JSON se aaye values kabhi kabhi string hote hain
  const minValues = Math.max(1, Number(category.minSelect) || 1);
  const maxValues = Math.min(
    Math.max(1, Number(category.maxSelect) || 1),
    options.length,
  );

  // addOptions() PEHLE — phir constraints set karo
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`verif:select:${categoryIndex}:${guildId}:${userId}`)
    .setPlaceholder(`Select ${category.name} (min ${minValues}, max ${maxValues})...`)
    .addOptions(options)
    .setMinValues(minValues)
    .setMaxValues(maxValues);

  return new ActionRowBuilder().addComponents(menu);
}

/**
 * Content preference buttons — Step 3
 * Teen options (jab nsfwEnabled = true):
 *   SFW Only   → @Traveler
 *   SFW + NSFW → @Initiate
 *   NSFW Only  → @nsfwOnly role
 */
function buildContentPrefButtons(guildId, userId, nsfwEnabled) {
  const sfwBtn = new ButtonBuilder()
    .setCustomId(`verif:content:sfw:${guildId}:${userId}`)
    .setLabel('🌞 SFW Only')
    .setStyle(ButtonStyle.Success);

  const buttons = [sfwBtn];

  if (nsfwEnabled) {
    const bothBtn = new ButtonBuilder()
      .setCustomId(`verif:content:nsfw:${guildId}:${userId}`)
      .setLabel('🌗 SFW + NSFW')
      .setStyle(ButtonStyle.Primary);

    const nsfwOnlyBtn = new ButtonBuilder()
      .setCustomId(`verif:content:nsfw_only:${guildId}:${userId}`)
      .setLabel('🔞 NSFW Only')
      .setStyle(ButtonStyle.Danger);

    buttons.push(bothBtn, nsfwOnlyBtn);
  }

  return new ActionRowBuilder().addComponents(...buttons);
}

/**
 * "Fill Out Introduction" button — Step 4 (modal trigger)
 */
function buildOpenIntroButton(guildId, userId) {
  const btn = new ButtonBuilder()
    .setCustomId(`verif:intro:open:${guildId}:${userId}`)
    .setLabel('📝 Fill Out Introduction')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(btn);
}

/**
 * Mod queue action buttons — Approve / Reject / View Profile
 */
function buildModQueueButtons(guildId, userId) {
  const approve = new ButtonBuilder()
    .setCustomId(`verif:mod:approve:${guildId}:${userId}`)
    .setLabel('✅ Approve')
    .setStyle(ButtonStyle.Success);

  const reject = new ButtonBuilder()
    .setCustomId(`verif:mod:reject:${guildId}:${userId}`)
    .setLabel('❌ Reject')
    .setStyle(ButtonStyle.Danger);

  const viewProfile = new ButtonBuilder()
    .setURL(`https://discord.com/users/${userId}`)
    .setLabel('🔎 View Profile')
    .setStyle(ButtonStyle.Link);

  return new ActionRowBuilder().addComponents(approve, reject, viewProfile);
}

// ============================================================
// MODALS (Popup Forms)
// ============================================================

/**
 * Introduction modal — Part 1 of 2
 * Fields: displayName, age, howFound, aboutYou
 * Kinks + hard limits → separate skippable Part 2 (buildKinksModal)
 */
function buildIntroModal(guildId, userId) {
  const modal = new ModalBuilder()
    .setCustomId(`verif:modal:intro:${guildId}:${userId}`)
    .setTitle('Your Introduction');

  const displayName = new TextInputBuilder()
    .setCustomId('displayName')
    .setLabel('What should we call you?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Your name or nickname (e.g. Alex, Luna)')
    .setMinLength(2)
    .setMaxLength(32)
    .setRequired(true);

  const age = new TextInputBuilder()
    .setCustomId('age')
    .setLabel('How old are you?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Just a number, e.g. 22')
    .setMinLength(1)
    .setMaxLength(3)
    .setRequired(true);

  const howFound = new TextInputBuilder()
    .setCustomId('howFound')
    .setLabel('How did you find our server?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Friend, Reddit, Google, Twitter, etc.')
    .setMinLength(2)
    .setMaxLength(200)
    .setRequired(true);

  const aboutYou = new TextInputBuilder()
    .setCustomId('aboutYou')
    .setLabel('Tell us about yourself')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Your interests, hobbies, what brings you here...')
    .setMinLength(10)
    .setMaxLength(1000)
    .setRequired(true);

  const location = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Where are you from? (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('City, Country — e.g. Mumbai, India or just "India"')
    .setMaxLength(100)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(displayName),
    new ActionRowBuilder().addComponents(age),
    new ActionRowBuilder().addComponents(location),
    new ActionRowBuilder().addComponents(howFound),
    new ActionRowBuilder().addComponents(aboutYou),
  );

  return modal;
}

/**
 * Kinks & Hard Limits modal — skippable Part 2
 * Both fields optional — user can submit blank
 */
function buildKinksModal(guildId, userId) {
  const modal = new ModalBuilder()
    .setCustomId(`verif:modal:kinks:${guildId}:${userId}`)
    .setTitle('Kinks & Hard Limits (Optional)');

  const kinks = new TextInputBuilder()
    .setCustomId('kinks')
    .setLabel('Your kinks (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('List any kinks you have... leave blank to skip')
    .setMaxLength(500)
    .setRequired(false);

  const hardLimits = new TextInputBuilder()
    .setCustomId('hardLimits')
    .setLabel('Your hard limits (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Things you absolutely do not engage with... leave blank to skip')
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(kinks),
    new ActionRowBuilder().addComponents(hardLimits),
  );

  return modal;
}

/**
 * Kinks step buttons — skippable optional form after intro submission
 */
function buildKinksStepButtons(guildId, userId) {
  const add = new ButtonBuilder()
    .setCustomId(`verif:kinks:open:${guildId}:${userId}`)
    .setLabel('➕ Add Kinks & Limits')
    .setStyle(ButtonStyle.Secondary);

  const skip = new ButtonBuilder()
    .setCustomId(`verif:kinks:skip:${guildId}:${userId}`)
    .setLabel('⏩ Skip & Submit')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(add, skip);
}

/**
 * Rejection reason modal — mod "Reject" click karne ke baad reason type karta hai
 */
function buildRejectReasonModal(guildId, userId) {
  const modal = new ModalBuilder()
    .setCustomId(`verif:mod:rejectReason:${guildId}:${userId}`)
    .setTitle('Rejection Reason');

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Why is this intro being rejected?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('This message will be sent to the user so they know what to fix...')
    .setMinLength(10)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  return modal;
}

module.exports = {
  buildBeginButton,
  buildPersistentVerifyButton,
  buildRestartVerifyButton,
  buildRulesButtons,
  buildRoleSelectMenu,
  buildContentPrefButtons,
  buildOpenIntroButton,
  buildModQueueButtons,
  buildIntroModal,
  buildKinksModal,
  buildKinksStepButtons,
  buildRejectReasonModal,
};

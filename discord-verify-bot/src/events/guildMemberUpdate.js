// ============================================================
// GUILD MEMBER UPDATE — Member ka kuch update hua
//
// Hum sirf ek specific case handle karte hain:
//   member.pending: true → false
//   Matlab: User ne Discord ka native "Membership Screening" complete kar liya
//   (woh popup jisme Discord khud rules dikhata hai aur Accept button hota hai)
//
// Jab tak pending = true, user buttons click nahi kar sakta.
// Isliye guildMemberAdd mein message nahi bheja — yahan bhejte hain.
//
// Agar server mein Membership Screening disabled hai toh yeh event
// is purpose ke liye kabhi relevant nahi hoga.
// ============================================================

const logger = require('../utils/logger');
const { getGuildConfig } = require('../config/configManager');
const { initState } = require('../utils/stateManager');
const { sendVerificationMessage } = require('./guildMemberAdd');

module.exports = {
  name: 'guildMemberUpdate',

  async execute(oldMember, newMember) {
    // Sirf tab care karo jab pending true → false ho
    // Yeh = user ne Discord's Membership Screening accept kar liya
    if (!oldMember.pending || newMember.pending) return;

    const { guild, user } = newMember;
    logger.info(`${user.tag} completed Discord membership screening in ${guild.name}`);

    const config = getGuildConfig(guild.id);
    if (!config) return;

    // Channel mode mein persistent panel handle karta hai — koi message nahi bhejna
    // User ab buttons click kar sakta hai (screening done) → woh khud panel pe jaayega
    if (config.settings.verificationMode === 'channel') {
      logger.info(`${user.tag} screening done — channel mode, persistent panel will handle it`);
      return;
    }

    // DM mode: State initialize karo aur verification DM bhejo
    await initState(guild.id, user.id);
    await sendVerificationMessage(newMember, config, guild);
  },
};

// ============================================================
// DEPLOY COMMANDS — Slash commands Discord pe register karta hai
//
// Yeh script SIRF EK BAAR chalao jab:
//   - Pehli baar bot setup karo
//   - Koi nayi slash command add/edit karo
//
// Run karo: node src/deploy-commands.js
//
// NOTE: Discord mein slash commands registered hone mein
//       upto 1 hour lag sakti hai (usually instant hota hai)
// ============================================================

require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const logger = require('./utils/logger');

// ---- Define all slash commands ----
// Phase 1 mein sirf basic commands hain
// Phase 2 mein /config, /stats, /verify-check etc. add honge
const commands = [

  // /ping — bot online hai check karne ke liye
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is online and responding'),

  // /verify-me — Manually verification restart karne ke liye (user command)
  new SlashCommandBuilder()
    .setName('verify-me')
    .setDescription('Restart your verification process (if it got stuck)'),

  // /setup-verify — Verify channel mein persistent verification panel post karo
  // Run once as admin — pin the message afterward
  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Post the persistent verification panel to the verify channel (Admin only)')
    .setDefaultMemberPermissions('8'), // ADMINISTRATOR permission flag

  // /reload-config — Config file reload karo bina bot restart ke
  new SlashCommandBuilder()
    .setName('reload-config')
    .setDescription('Reload guild config from file (Admin only)')
    .setDefaultMemberPermissions('8'),

  // /setup-mod-panel — Mod panel embed post karo (stats + notification toggle)
  new SlashCommandBuilder()
    .setName('setup-mod-panel')
    .setDescription('Post the mod panel (stats + notifications) in this channel (Admin only)')
    .setDefaultMemberPermissions('8'),

  // /edit-config — Welcome/rules messages edit karo (DB mein store hota hai)
  new SlashCommandBuilder()
    .setName('edit-config')
    .setDescription('Edit welcome and rules messages shown to new members (Admin only)')
    .setDefaultMemberPermissions('8'),

].map(cmd => cmd.toJSON());

// ---- Register commands with Discord API ----
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    logger.info(`Registering ${commands.length} slash commands globally...`);
    logger.info(`(Global commands take up to 1 hour to appear. For testing, use guild-specific deployment.)`);

    // Global deployment (works on all servers)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    logger.info(`✅ Successfully registered ${commands.length} commands!`);
    logger.info(`Commands: ${commands.map(c => '/' + c.name).join(', ')}`);

  } catch (err) {
    logger.error('Failed to register commands:', { error: err.message });
    process.exit(1);
  }
})();

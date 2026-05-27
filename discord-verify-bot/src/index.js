// ============================================================
// ENTRY POINT — Yahan se bot start hota hai
//
// Yeh file:
//   1. .env file se environment variables load karti hai
//   2. Discord client banati hai (bot ka "connection" object)
//   3. events/ folder se saare event handlers load karti hai
//   4. Bot token se Discord se connect karti hai
//   5. Graceful shutdown handle karti hai (CTRL+C ya Railway stop pe)
// ============================================================

require('dotenv').config(); // .env file padhta hai

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// ---- Validate required environment variables ----
if (!process.env.DISCORD_TOKEN) {
  logger.error('DISCORD_TOKEN is missing in .env file. Bot cannot start.');
  process.exit(1);
}
if (!process.env.CLIENT_ID) {
  logger.error('CLIENT_ID is missing in .env file. Bot cannot start.');
  process.exit(1);
}

// ---- Create Discord Client ----
// "Intents" = Discord ko batao ki kaunse events receive karne hain
// GUILD_MEMBERS is "privileged" — Discord Developer Portal mein manually enable karna hoga
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,        // Basic guild info (channels, roles)
    GatewayIntentBits.GuildMembers,  // Member join/leave events (PRIVILEGED)
    GatewayIntentBits.DirectMessages, // Bot DM bhej sake aur receive kar sake
  ],
  partials: [
    // Partials = incomplete Discord objects handle karne ke liye
    // DMs ke liye zaruri hain
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
  ],
});

// ---- Auto-load all event files ----
// events/ folder mein har .js file ek event handler hai
// Manually import karne ki zarurat nahi — sab automatically load ho jaate hain
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));

  // once: true = event sirf ek baar fire hoga (like "ready")
  // once: false = har baar fire hoga (like "guildMemberAdd")
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }

  logger.debug(`Event handler loaded: ${event.name}`);
}

// ---- Login ----
logger.info('Connecting to Discord...');
client.login(process.env.DISCORD_TOKEN).catch(err => {
  logger.error('Login failed. Check your DISCORD_TOKEN in .env:', err.message);
  process.exit(1);
});

// ---- Graceful Shutdown ----
// Jab Railway ya tu CTRL+C kare, Discord se cleanly disconnect hoga
function shutdown(signal) {
  logger.info(`Received ${signal} — shutting down gracefully...`);
  client.destroy();
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---- Unhandled error catcher ----
// Koi unexpected error aaye toh crash nahi karega, sirf log karega
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { reason: reason?.message || reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception (bot will restart):', err);
  process.exit(1); // Let Railway auto-restart
});

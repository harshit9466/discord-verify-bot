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
if (!process.env.DATABASE_URL) {
  logger.error('DATABASE_URL is missing in .env file. Bot cannot start.');
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

// ---- Scheduled jobs (panel refresh + verif reminder/kick) ----
const { getAllConfiguredGuilds, getGuildConfig, applyConfigOverrides } = require('./config/configManager');
const statsRepo  = require('./db/statsRepository');
const modSubRepo = require('./db/modSubscriberRepository');
const memberRepo   = require('./db/memberRepository');
const eventRepo    = require('./db/eventRepository');
const settingsRepo = require('./db/settingsRepository');
const embeds       = require('./utils/embeds');
const components   = require('./utils/components');

client.once('clientReady', async () => {
  // Load persisted settings from DB into in-memory config cache
  // so the scheduled job always has up-to-date settings after a redeploy
  for (const guildId of getAllConfiguredGuilds()) {
    try {
      const [dbSettings, configOverrides] = await Promise.all([
        settingsRepo.getVerifSettings(guildId),
        settingsRepo.getConfigOverrides(guildId),
      ]);
      const config = getGuildConfig(guildId);
      if (config && dbSettings) {
        config.verificationSettings = dbSettings;
        logger.info(`Loaded persisted verif settings for guild ${guildId}`);
      }
      if (configOverrides && Object.keys(configOverrides).length > 0) {
        applyConfigOverrides(guildId, configOverrides);
        logger.info(`Loaded config overrides for guild ${guildId}`);
      }
    } catch (err) {
      logger.warn(`Could not load DB settings for guild ${guildId}: ${err.message}`);
    }
  }

  // --- Job 1: Mod panel auto-refresh (every 1 hour) ---
  setInterval(async () => {
    for (const guildId of getAllConfiguredGuilds()) {
      const config = getGuildConfig(guildId);
      if (!config?.panelMessageId || !config?.panelChannelId) continue;
      try {
        const guild   = client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(config.panelChannelId);
        if (!channel) continue;
        const msg = await channel.messages.fetch(config.panelMessageId).catch(() => null);
        if (!msg) continue;
        const [stats, subscriberCount] = await Promise.all([
          statsRepo.getStats(guildId, 7),
          modSubRepo.getEnabledCount(guildId),
        ]);
        const days = config.panelTimeRange ?? 7;
        await msg.edit({
          embeds:     [embeds.buildModPanelEmbed(stats, subscriberCount, days)],
          components: components.buildModPanelComponents(guildId),
        });
        logger.info(`Mod panel auto-refreshed for guild ${guildId}`);
      } catch (err) {
        logger.error(`Auto-refresh failed for guild ${guildId}:`, { error: err.message });
      }
    }
  }, 60 * 60 * 1000);

  // --- Job 2: Verification reminder + auto-kick (every 30 min) ---
  const runVerifJob = async () => {
    for (const guildId of getAllConfiguredGuilds()) {
      const config = getGuildConfig(guildId);
      const vs     = config?.verificationSettings;
      if (!vs) continue;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const pendingRoleId = config.roles?.verificationPendingRoleId;

      // Reminder pass
      if (vs.reminderEnabled && vs.reminderHours > 0) {
        const rows = await memberRepo.getMembersNeedingReminder(guildId, vs.reminderHours).catch(() => []);
        for (const row of rows) {
          try {
            const member = await guild.members.fetch(row.discord_user_id).catch(() => null);
            if (!member) continue;
            // Skip members who have already submitted intro (they have @Verification Pending)
            if (pendingRoleId && member.roles.cache.has(pendingRoleId)) continue;
            await member.user.send({
              embeds: [embeds.buildReminderDMEmbed(guild.name, vs.autoKickEnabled, vs.autoKickHours)],
            }).catch(() => {});
            await memberRepo.markReminderSent(row.discord_user_id, guildId);
            logger.info(`Verification reminder sent to ${row.discord_user_id} in ${guildId}`);
          } catch (err) {
            logger.error(`Reminder failed for ${row.discord_user_id}:`, { error: err.message });
          }
        }
      }

      // Auto-kick pass
      if (vs.autoKickEnabled && vs.autoKickHours > 0) {
        const rows = await memberRepo.getMembersNeedingKick(guildId, vs.autoKickHours).catch(() => []);
        for (const row of rows) {
          try {
            const member = await guild.members.fetch(row.discord_user_id).catch(() => null);
            if (!member) continue;
            // Skip members who have submitted intro (waiting for mod review)
            if (pendingRoleId && member.roles.cache.has(pendingRoleId)) continue;
            const inviteLink = vs.kickInviteEnabled && vs.kickInviteLink ? vs.kickInviteLink : null;
            await member.user.send({
              embeds: [embeds.buildKickDMEmbed(guild.name, inviteLink)],
            }).catch(() => {});
            await member.kick(`Verification timeout — ${vs.autoKickHours}h exceeded`).catch(() => {});
            await memberRepo.updateMemberStatus(row.discord_user_id, guildId, 'TIMED_OUT');
            await eventRepo.logEvent(row.discord_user_id, guildId, 'KICKED', {
              notes: `Auto-kicked after ${vs.autoKickHours}h verification timeout`,
            });
            logger.info(`Auto-kicked ${row.discord_user_id} from ${guildId} (timeout)`);
          } catch (err) {
            logger.error(`Auto-kick failed for ${row.discord_user_id}:`, { error: err.message });
          }
        }
      }
    }
  };

  setInterval(runVerifJob, 30 * 60 * 1000);
  // Run once on startup so recently overdue members aren't missed after a restart
  runVerifJob().catch(err => logger.error('Initial verif job failed:', { error: err.message }));
});

// ---- Init DB, then login ----
const { initDb } = require('./db/connection');

(async () => {
  try {
    await initDb();
  } catch (err) {
    logger.error('Database initialization failed — bot cannot start:', { error: err.message });
    process.exit(1);
  }

  logger.info('Connecting to Discord...');
  client.login(process.env.DISCORD_TOKEN).catch(err => {
    logger.error('Login failed. Check your DISCORD_TOKEN in .env:', err.message);
    process.exit(1);
  });
})();

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

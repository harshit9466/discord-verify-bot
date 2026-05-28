const { pool } = require('./connection');

async function logEvent(discordUserId, guildId, eventType, { triggeredBy = null, notes = null } = {}) {
  await pool.query(
    `INSERT INTO events (discord_user_id, guild_id, event_type, triggered_by, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [discordUserId, guildId, eventType, triggeredBy, notes]
  );
}

module.exports = { logEvent };

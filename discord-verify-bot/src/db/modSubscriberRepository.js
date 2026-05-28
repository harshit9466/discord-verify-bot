const { pool } = require('./connection');

async function toggleSubscription(discordUserId, guildId) {
  const { rows } = await pool.query(`
    INSERT INTO mod_subscribers (discord_user_id, guild_id, notifications_enabled)
    VALUES ($1, $2, true)
    ON CONFLICT (discord_user_id, guild_id) DO UPDATE SET
      notifications_enabled = NOT mod_subscribers.notifications_enabled
    RETURNING notifications_enabled
  `, [discordUserId, guildId]);
  return rows[0].notifications_enabled;
}

async function getEnabledSubscribers(guildId) {
  const { rows } = await pool.query(
    'SELECT discord_user_id FROM mod_subscribers WHERE guild_id = $1 AND notifications_enabled = true',
    [guildId]
  );
  return rows;
}

async function getEnabledCount(guildId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) FROM mod_subscribers WHERE guild_id = $1 AND notifications_enabled = true',
    [guildId]
  );
  return parseInt(rows[0].count);
}

async function isSubscribed(discordUserId, guildId) {
  const { rows } = await pool.query(
    'SELECT notifications_enabled FROM mod_subscribers WHERE discord_user_id = $1 AND guild_id = $2',
    [discordUserId, guildId]
  );
  return rows[0]?.notifications_enabled ?? false;
}

module.exports = { toggleSubscription, getEnabledSubscribers, getEnabledCount, isSubscribed };

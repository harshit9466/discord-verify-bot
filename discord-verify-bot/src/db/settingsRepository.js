const { pool } = require('./connection');

async function getVerifSettings(guildId) {
  const { rows } = await pool.query(
    'SELECT settings FROM guild_settings WHERE guild_id = $1',
    [guildId]
  );
  return rows[0]?.settings ?? null;
}

async function saveVerifSettings(guildId, verifSettings) {
  await pool.query(`
    INSERT INTO guild_settings (guild_id, settings)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (guild_id) DO UPDATE SET settings = EXCLUDED.settings
  `, [guildId, JSON.stringify(verifSettings)]);
}

async function getConfigOverrides(guildId) {
  const { rows } = await pool.query(
    'SELECT config_overrides FROM guild_settings WHERE guild_id = $1',
    [guildId]
  );
  return rows[0]?.config_overrides ?? null;
}

async function saveConfigOverrides(guildId, overrides) {
  await pool.query(`
    INSERT INTO guild_settings (guild_id, config_overrides)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (guild_id) DO UPDATE SET config_overrides = EXCLUDED.config_overrides
  `, [guildId, JSON.stringify(overrides)]);
}

module.exports = { getVerifSettings, saveVerifSettings, getConfigOverrides, saveConfigOverrides };

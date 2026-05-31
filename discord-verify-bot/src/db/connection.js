const { Pool } = require('pg');
const logger   = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway internal URL (.railway.internal) needs no SSL; external/local URLs do
  ssl: process.env.DATABASE_URL?.includes('.railway.internal') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error:', { error: err.message });
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        id                  SERIAL PRIMARY KEY,
        discord_user_id     VARCHAR(20)  NOT NULL,
        guild_id            VARCHAR(20)  NOT NULL,
        username_history    JSONB        NOT NULL DEFAULT '[]',
        first_joined_at     TIMESTAMPTZ,
        last_joined_at      TIMESTAMPTZ,
        last_left_at        TIMESTAMPTZ,
        verified_at         TIMESTAMPTZ,
        verification_status VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
        content_preference  VARCHAR(20),
        role_assigned       VARCHAR(20),
        selected_roles      JSONB        NOT NULL DEFAULT '{}',
        intro               JSONB        NOT NULL DEFAULT '{}',
        rejoin_count        INTEGER      NOT NULL DEFAULT 0,
        notes               TEXT,
        UNIQUE(discord_user_id, guild_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id               SERIAL PRIMARY KEY,
        discord_user_id  VARCHAR(20)  NOT NULL,
        guild_id         VARCHAR(20)  NOT NULL,
        event_type       VARCHAR(30)  NOT NULL,
        event_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        triggered_by     VARCHAR(20),
        notes            TEXT
      );

      CREATE TABLE IF NOT EXISTS mod_subscribers (
        id                    SERIAL PRIMARY KEY,
        discord_user_id       VARCHAR(20)  NOT NULL,
        guild_id              VARCHAR(20)  NOT NULL,
        notifications_enabled BOOLEAN      NOT NULL DEFAULT true,
        UNIQUE(discord_user_id, guild_id)
      );

      CREATE INDEX IF NOT EXISTS idx_members_lookup ON members(discord_user_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_events_user    ON events(discord_user_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_events_type    ON events(event_type);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id VARCHAR(20) PRIMARY KEY,
        settings JSONB       NOT NULL DEFAULT '{}'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_states (
        guild_id           VARCHAR(20)  NOT NULL,
        user_id            VARCHAR(20)  NOT NULL,
        step               VARCHAR(20)  NOT NULL DEFAULT 'NOT_STARTED',
        rules_agreed       BOOLEAN      NOT NULL DEFAULT false,
        selected_roles     JSONB        NOT NULL DEFAULT '{}',
        content_preference VARCHAR(20),
        intro              JSONB,
        previous_intro     JSONB,
        mod_message_id     VARCHAR(20),
        started_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        last_activity_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id)
      );
    `);

    // Additive column migrations — safe to run every time
    await client.query(`
      ALTER TABLE members             ADD COLUMN IF NOT EXISTS reminder_sent_at        TIMESTAMPTZ;
      ALTER TABLE guild_settings      ADD COLUMN IF NOT EXISTS config_overrides        JSONB NOT NULL DEFAULT '{}';
      ALTER TABLE guild_settings      ADD COLUMN IF NOT EXISTS panel                   JSONB NOT NULL DEFAULT '{}';
      ALTER TABLE verification_states ADD COLUMN IF NOT EXISTS edit_category_queue     JSONB;
      ALTER TABLE verification_states ADD COLUMN IF NOT EXISTS previous_selected_roles JSONB;
    `);
    logger.info('Database tables initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };

const { pool } = require('./connection');

async function getStats(guildId, days = 7) {
  const [joins, verified, rejected, autoVerified, avgTime, totalUnverified] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'JOIN' AND event_at > NOW() - ($2 * INTERVAL '1 day')`,
      [guildId, days]
    ),
    pool.query(
      `SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'VERIFIED' AND event_at > NOW() - ($2 * INTERVAL '1 day')`,
      [guildId, days]
    ),
    pool.query(
      `SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'REJECTED' AND event_at > NOW() - ($2 * INTERVAL '1 day')`,
      [guildId, days]
    ),
    pool.query(
      `SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'REJOIN' AND event_at > NOW() - ($2 * INTERVAL '1 day')`,
      [guildId, days]
    ),
    pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (verified_at - first_joined_at)) / 3600)::numeric, 1) AS avg_hours
       FROM members WHERE guild_id = $1 AND verified_at > NOW() - ($2 * INTERVAL '1 day')`,
      [guildId, days]
    ),
    pool.query(
      `SELECT COUNT(*) FROM members WHERE guild_id = $1 AND verification_status = 'PENDING'`,
      [guildId]
    ),
  ]);

  return {
    joins:           parseInt(joins.rows[0].count),
    verified:        parseInt(verified.rows[0].count),
    rejected:        parseInt(rejected.rows[0].count),
    autoVerified:    parseInt(autoVerified.rows[0].count),
    avgVerifyHours:  parseFloat(avgTime.rows[0].avg_hours) || 0,
    totalUnverified: parseInt(totalUnverified.rows[0].count),
  };
}

module.exports = { getStats };

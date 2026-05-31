const { pool } = require('./connection');

async function getStats(guildId, days = 7) {
  // days = 0 means all-time — use a large number to avoid restructuring queries
  const d = days === 0 ? 36500 : days;

  const [joins, verified, rejected, autoVerified, avgTime, totalUnverified, totalPendingReview] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'JOIN'    AND event_at > NOW() - ($2 * INTERVAL '1 day')`, [guildId, d]),
    pool.query(`SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'VERIFIED' AND event_at > NOW() - ($2 * INTERVAL '1 day')`, [guildId, d]),
    pool.query(`SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'REJECTED' AND event_at > NOW() - ($2 * INTERVAL '1 day')`, [guildId, d]),
    pool.query(`SELECT COUNT(*) FROM events WHERE guild_id = $1 AND event_type = 'REJOIN'   AND event_at > NOW() - ($2 * INTERVAL '1 day')`, [guildId, d]),
    pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (verified_at - first_joined_at)) / 3600)::numeric, 1) AS avg_hours
       FROM members WHERE guild_id = $1 AND verified_at > NOW() - ($2 * INTERVAL '1 day')`,
      [guildId, d]
    ),
    pool.query(`SELECT COUNT(*) FROM members WHERE guild_id = $1 AND verification_status = 'PENDING'`,     [guildId]),
    pool.query(`SELECT COUNT(*) FROM members WHERE guild_id = $1 AND verification_status = 'AWAITING_MOD'`, [guildId]),
  ]);

  return {
    joins:              parseInt(joins.rows[0].count),
    verified:           parseInt(verified.rows[0].count),
    rejected:           parseInt(rejected.rows[0].count),
    autoVerified:       parseInt(autoVerified.rows[0].count),
    avgVerifyHours:     parseFloat(avgTime.rows[0].avg_hours) || 0,
    totalUnverified:    parseInt(totalUnverified.rows[0].count),
    totalPendingReview: parseInt(totalPendingReview.rows[0].count),
  };
}

async function getTopRejectionReasons(guildId, days = 30, limit = 5) {
  const d = days === 0 ? 36500 : days;
  const { rows } = await pool.query(`
    SELECT notes, COUNT(*)::int AS count
    FROM events
    WHERE guild_id = $1
      AND event_type = 'REJECTED'
      AND notes IS NOT NULL
      AND notes <> ''
      AND event_at > NOW() - ($2 * INTERVAL '1 day')
    GROUP BY notes
    ORDER BY count DESC
    LIMIT $3
  `, [guildId, d, limit]);
  return rows.map(r => ({
    reason: r.notes.replace(/^Reason:\s*/i, '').trim(),
    count:  r.count,
  }));
}

async function getTotalVerifiedCount() {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM members WHERE verification_status = 'VERIFIED'`
  );
  return parseInt(rows[0].count);
}

module.exports = { getStats, getTopRejectionReasons, getTotalVerifiedCount };

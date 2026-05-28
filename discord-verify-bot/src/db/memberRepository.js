const { pool } = require('./connection');

async function findMember(discordUserId, guildId) {
  const { rows } = await pool.query(
    'SELECT * FROM members WHERE discord_user_id = $1 AND guild_id = $2',
    [discordUserId, guildId]
  );
  return rows[0] ?? null;
}

async function upsertMemberOnJoin(discordUserId, guildId, username, joinedAt = new Date()) {
  await pool.query(`
    INSERT INTO members (discord_user_id, guild_id, username_history, first_joined_at, last_joined_at)
    VALUES ($1, $2, $3::jsonb, $4, $4)
    ON CONFLICT (discord_user_id, guild_id) DO UPDATE SET
      last_joined_at      = $4,
      rejoin_count        = members.rejoin_count + 1,
      reminder_sent_at    = NULL,
      verification_status = CASE
        WHEN members.verification_status = 'TIMED_OUT' THEN 'PENDING'
        ELSE members.verification_status
      END,
      username_history    = CASE
        WHEN members.username_history @> $3::jsonb THEN members.username_history
        ELSE members.username_history || $3::jsonb
      END
  `, [discordUserId, guildId, JSON.stringify([username]), joinedAt]);
}

async function saveMemberOnVerify(discordUserId, guildId, { contentPreference, roleAssigned, selectedRoles, intro }) {
  await pool.query(`
    UPDATE members
    SET verification_status = 'VERIFIED',
        verified_at         = NOW(),
        content_preference  = $3,
        role_assigned       = $4,
        selected_roles      = $5::jsonb,
        intro               = $6::jsonb
    WHERE discord_user_id = $1 AND guild_id = $2
  `, [
    discordUserId,
    guildId,
    contentPreference,
    roleAssigned,
    JSON.stringify(selectedRoles ?? {}),
    JSON.stringify(intro ?? {}),
  ]);
}

async function updateMemberOnLeave(discordUserId, guildId) {
  await pool.query(
    'UPDATE members SET last_left_at = NOW() WHERE discord_user_id = $1 AND guild_id = $2',
    [discordUserId, guildId]
  );
}

async function updateMemberStatus(discordUserId, guildId, status) {
  await pool.query(
    'UPDATE members SET verification_status = $3 WHERE discord_user_id = $1 AND guild_id = $2',
    [discordUserId, guildId, status]
  );
}

async function getMembersNeedingReminder(guildId, reminderHours) {
  const { rows } = await pool.query(`
    SELECT discord_user_id FROM members
    WHERE guild_id = $1
      AND verification_status NOT IN ('VERIFIED', 'TIMED_OUT', 'REJECTED')
      AND first_joined_at < NOW() - ($2 * INTERVAL '1 hour')
      AND reminder_sent_at IS NULL
  `, [guildId, reminderHours]);
  return rows;
}

async function getMembersNeedingKick(guildId, autoKickHours) {
  const { rows } = await pool.query(`
    SELECT discord_user_id FROM members
    WHERE guild_id = $1
      AND verification_status NOT IN ('VERIFIED', 'TIMED_OUT', 'REJECTED')
      AND first_joined_at < NOW() - ($2 * INTERVAL '1 hour')
  `, [guildId, autoKickHours]);
  return rows;
}

async function markReminderSent(discordUserId, guildId) {
  await pool.query(
    'UPDATE members SET reminder_sent_at = NOW() WHERE discord_user_id = $1 AND guild_id = $2',
    [discordUserId, guildId]
  );
}

module.exports = {
  findMember,
  upsertMemberOnJoin,
  saveMemberOnVerify,
  updateMemberOnLeave,
  updateMemberStatus,
  getMembersNeedingReminder,
  getMembersNeedingKick,
  markReminderSent,
};

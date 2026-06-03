const { pool } = require('./connection');

const FIELD_MAP = {
  step:                { col: 'step',                 jsonb: false },
  rulesAgreed:         { col: 'rules_agreed',          jsonb: false },
  selectedRoles:       { col: 'selected_roles',        jsonb: true  },
  contentPreference:   { col: 'content_preference',    jsonb: false },
  intro:               { col: 'intro',                 jsonb: true  },
  previousIntro:       { col: 'previous_intro',        jsonb: true  },
  modMessageId:        { col: 'mod_message_id',        jsonb: false },
  editCategoryQueue:       { col: 'edit_category_queue',       jsonb: true  },
  previousSelectedRoles:  { col: 'previous_selected_roles',   jsonb: true  },
};

function rowToState(row) {
  return {
    guildId:           row.guild_id,
    userId:            row.user_id,
    step:              row.step,
    rulesAgreed:       row.rules_agreed,
    selectedRoles:     row.selected_roles   ?? {},
    contentPreference: row.content_preference,
    intro:             row.intro,
    previousIntro:     row.previous_intro,
    modMessageId:      row.mod_message_id,
    editCategoryQueue:      row.edit_category_queue      ?? null,
    previousSelectedRoles:  row.previous_selected_roles  ?? null,
    startedAt:         new Date(row.started_at).getTime(),
    lastActivityAt:    new Date(row.last_activity_at).getTime(),
  };
}

async function setStatus(guildId, userId, status) {
  await pool.query(
    `UPDATE verification_states SET status = $3, last_activity_at = NOW()
     WHERE guild_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [guildId, userId, status],
  );
}

async function getState(guildId, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM verification_states
     WHERE guild_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [guildId, userId],
  );
  if (!rows[0]) return null;
  return rowToState(rows[0]);
}

async function initState(guildId, userId) {
  const { rows } = await pool.query(`
    INSERT INTO verification_states (guild_id, user_id, status)
    VALUES ($1, $2, 'ACTIVE')
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      status             = 'ACTIVE',
      step               = 'NOT_STARTED',
      rules_agreed       = false,
      selected_roles     = '{}',
      content_preference = NULL,
      intro              = NULL,
      previous_intro     = NULL,
      mod_message_id          = NULL,
      edit_category_queue     = NULL,
      previous_selected_roles = NULL,
      started_at         = NOW(),
      last_activity_at   = NOW()
    RETURNING *
  `, [guildId, userId]);
  return rowToState(rows[0]);
}

async function updateState(guildId, userId, updates) {
  const setClauses = [];
  const values     = [];
  let   i          = 1;

  for (const [jsKey, { col, jsonb }] of Object.entries(FIELD_MAP)) {
    if (!(jsKey in updates)) continue;
    const val = updates[jsKey];
    setClauses.push(`${col} = $${i}${jsonb ? '::jsonb' : ''}`);
    values.push(jsonb && val !== null ? JSON.stringify(val) : val);
    i++;
  }

  if (setClauses.length === 0) return null;

  setClauses.push('last_activity_at = NOW()');
  values.push(guildId, userId);

  const { rows } = await pool.query(
    `UPDATE verification_states SET ${setClauses.join(', ')}
     WHERE guild_id = $${i} AND user_id = $${i + 1} AND status = 'ACTIVE'
     RETURNING *`,
    values,
  );
  return rows[0] ? rowToState(rows[0]) : null;
}

async function markApproved(guildId, userId) { return setStatus(guildId, userId, 'APPROVED'); }
async function markRejected(guildId, userId) { return setStatus(guildId, userId, 'REJECTED'); }
async function markLeft(guildId, userId)     { return setStatus(guildId, userId, 'LEFT');     }

async function findStateByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM verification_states
     WHERE user_id = $1 AND status = 'ACTIVE'
     ORDER BY last_activity_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ? rowToState(rows[0]) : null;
}

module.exports = { getState, initState, updateState, markApproved, markRejected, markLeft, findStateByUserId };

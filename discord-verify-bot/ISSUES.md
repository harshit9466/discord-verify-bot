# Known Issues & Fix Queue

Verified via GitNexus call graph + direct code analysis.  
Fix order: top to bottom. One commit per fix so each can be reverted independently.

---

## 🔴 #1 — `panel_showMembers` puts submitted members in wrong bucket

**File:** `src/events/interactionCreate.js:957–964` + `src/db/memberRepository.js:75`

**Problem:**  
`getUnverifiedMembers` SELECT only returns `discord_user_id, first_joined_at, reminder_sent_at` — no `verification_status`.  
`panel_showMembers` categorizes by checking Discord role cache:
```js
const discordMember = guild?.members.cache.get(row.discord_user_id); // cache miss after restart
if (pendingRoleId && discordMember?.roles.cache.has(pendingRoleId)) {
  pendingReview.push(row);
} else {
  notStarted.push(row); // ← AWAITING_MOD member lands here if not in cache
}
```
After any bot restart, `guild.members.cache` is not fully populated. Members who already submitted their intro (`AWAITING_MOD` in DB) show up in "Not Started" instead of "Pending Review".

**Fix:**  
Add `verification_status` to `getUnverifiedMembers` SELECT.  
In `panel_showMembers`, use `row.verification_status === 'AWAITING_MOD'` as primary check, Discord role cache as fallback.

**Status:** [ ] Pending

---

## 🔴 #2 — `panelMessageId` / `panelChannelId` lost on every Railway deploy

**File:** `src/events/interactionCreate.js:1199` + `src/config/configManager.js:74` + `src/index.js:109`

**Problem:**  
`/setup-mod-panel` saves `panelMessageId` and `panelChannelId` to the JSON config file on disk via `saveGuildConfig()`.  
Railway uses an ephemeral filesystem — every deploy starts from the git-checked-in files, wiping any disk writes.  
`index.js:109` reads these from in-memory config (loaded from the now-reset JSON), finds them missing, and silently skips auto-refresh:
```js
if (!config?.panelMessageId || !config?.panelChannelId) continue; // silently skipped after deploy
```
Result: mod panel auto-refresh stops working after every deploy until `/setup-mod-panel` is run again.

**Fix:**  
Add `panel_message_id` and `panel_channel_id` columns to the `guild_settings` table (or store in the existing `settings` JSONB column).  
Save them via `settingsRepo` in `cmd_setupModPanel`.  
Load them back into in-memory config in the `clientReady` boot loop (same place verif settings are loaded).

**Status:** [ ] Pending

---

## 🟡 #3 — N+1 Discord API calls in `autoVerifyReturningMember`

**File:** `src/events/guildMemberAdd.js:96–111`

**Problem:**  
Selected roles are restored one-by-one with sequential `member.roles.add()` calls:
```js
for (const roleIds of Object.values(dbRecord.selected_roles)) {
  for (const id of roleIds) {
    const r = guild.roles.cache.get(id);
    if (r) await member.roles.add(r).catch(() => {}); // separate Discord PATCH per role
  }
}
```
Plus separate `add` calls for the verified role and base role = 12–22 sequential API requests per rejoin.  
`mod_approve` already solves this with a single `member.roles.set(finalRoleIds)`.

**Fix:**  
Collect all role IDs to add (verified + base + selected), remove IDs that don't exist in guild cache, then call `member.roles.set(finalRoleIds)` once — same pattern as `mod_approve`.

**Status:** [ ] Pending

---

## 🟡 #4 — Missing DB indexes on hot query paths

**File:** `src/db/connection.js` (inside `initDb`)

**Problem:**  
`getStats` fires 7 parallel queries every panel refresh and every hourly auto-refresh. Without composite indexes these do sequential scans:

| Missing Index | Queries Affected |
|---|---|
| `members(guild_id, verification_status)` | `getStats` ×2, `getUnverifiedMembers`, `getMembersNeedingReminder`, `getMembersNeedingKick` |
| `events(guild_id, event_type, event_at)` | `getStats` ×4, `getTopRejectionReasons` |
| `members(guild_id, first_joined_at)` | `getMembersNeedingReminder`, `getMembersNeedingKick` |

Fine at current scale (2 guilds, hundreds of members). Will degrade noticeably beyond ~5k rows in events table.

**Fix:**  
Add 3 `CREATE INDEX IF NOT EXISTS` lines to `initDb` in `connection.js`. Safe to add at any time — `IF NOT EXISTS` is idempotent.

**Status:** [ ] Pending

---

## 🟡 #5 — 4× wasted `getState()` after `updateState()` already returned the data

**File:** `src/events/interactionCreate.js` — lines 383–384, 391–393, 238+240, 579+587

**Problem:**  
`stateRepository.updateState` does `RETURNING *` and returns the full updated state. But the return value is discarded and `getState()` is called again immediately after — an extra `SELECT` round-trip on every role selection and every submission:

```js
// Example — step_roleSelect edit mode (lines 391-393)
await updateState(guildId, userId, { editCategoryQueue: queue }); // returns updated state — ignored
const updatedState = await getState(guildId, userId);             // redundant SELECT

// Example — step_edit submit (lines 238+240)
await updateState(guildId, userId, { step: STEPS.PENDING });      // returns updated state — ignored
await postToModQueue(..., await getState(guildId, userId));        // redundant SELECT
```

4 locations total.

**Fix:**  
Capture the return value of `updateState()` and use it directly. Remove the subsequent `getState()` call in each location.

**Status:** [ ] Pending

---

## 🟡 #6 — Module-level `setInterval` side-effect in `stateManager.js`

**File:** `src/utils/stateManager.js:48`

**Problem:**  
The cleanup interval starts the moment any file does `require('./stateManager')` — it is a module-level side effect, not triggered by an explicit start call:
```js
// Runs immediately on require() — not inside any function
setInterval(async () => {
  await stateRepo.cleanupExpired();
}, 10 * 60 * 1000);
```
Currently safe because only `interactionCreate.js` imports it and the bot is always long-running. But any CLI script, test file, or tool that imports `stateManager` will start the timer and prevent clean process exit.

**Fix:**  
Move the `setInterval` into an exported `startCleanupJob()` function. Call it once from `ready.js` after bot is connected.

**Status:** [ ] Pending

---

## 🟢 #7 — SQL string interpolation in `cleanupExpired` (cosmetic)

**File:** `src/db/stateRepository.js:117`

**Problem:**  
```js
`DELETE FROM verification_states WHERE last_activity_at < NOW() - INTERVAL '${TIMEOUT_MINUTES} minutes'`
```
`TIMEOUT_MINUTES = 60` is a module-level constant, not user input — **no actual security risk**.  
Still bad practice: mixing template literals into SQL makes it a habit.

**Fix:**  
Use parameterized query: `WHERE last_activity_at < NOW() - ($1 * INTERVAL '1 minute')` with `[TIMEOUT_MINUTES]`.

**Status:** [ ] Pending

---

## 🟢 #8 — `findStateByUserId` has no guild isolation

**File:** `src/db/stateRepository.js:107`

**Problem:**  
```js
SELECT * FROM verification_states WHERE user_id = $1 LIMIT 1
// no guild_id filter
```
If a user is simultaneously verifying in two guilds, this returns whichever guild's state comes first from the DB. Used only in DM mode where `guildId` is unknown — so the intent is correct, but the behaviour is undefined when multiple rows exist.

**Risk:** Near-zero with current 2-guild setup. Edge case only.

**Fix:**  
For DM mode: no change needed — by design.  
Optional: add `ORDER BY last_activity_at DESC LIMIT 1` so the most-recently-active guild's state wins, which is more predictable than random row order.

**Status:** [ ] Pending

---

## Fix Order

```
#1 → #2 → #3 → #4 → #5 → #6 → #7 → #8
```
Each fix = one commit. Revert any single commit with `git revert <sha>` without touching others.

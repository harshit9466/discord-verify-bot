# INC-001 — Verification State Expiry Causing Role/Data Loss

**Date Discovered:** 2026-06-02
**Severity:** High
**Status:** Resolved
**Affected Component:** `src/db/stateRepository.js`, `src/utils/stateManager.js`

---

## How It Was Discovered

User `dickscord1949` (Discord ID: `755691070968299523`) was found to have the **Initiate** role in the Desi Sisters server, but the database recorded `role_assigned = TRAVELER` and `content_preference = SFW`. This mismatch triggered an investigation into how the user's roles were assigned.

---

## Root Cause

### Primary Bug — 60-Minute State Expiry in `getState()`

`stateRepository.js` had a hardcoded 60-minute timeout that **hard-deleted** a user's verification state if `last_activity_at` was older than 60 minutes:

```js
// BEFORE (buggy)
const TIMEOUT_MINUTES = 60;

async function getState(guildId, userId) {
  // ...
  const ageMinutes = (Date.now() - new Date(rows[0].last_activity_at).getTime()) / 60000;
  if (ageMinutes > TIMEOUT_MINUTES) {
    await pool.query('DELETE FROM verification_states WHERE guild_id = $1 AND user_id = $2', ...);
    return null;
  }
  return rowToState(rows[0]);
}
```

**The problem:** The state was stored in PostgreSQL and fully persisted. There was no memory pressure or technical reason for this timeout — it was an oversight. If a mod took longer than 60 minutes to approve a pending user, `getState()` would silently delete the row and return `null`.

### What Happened for This User

```
21:07 UTC  →  User joined, began verification
             User selected: NSFW content pref, category roles, wrote intro
             → All saved to verification_states table ✓

~21:20 UTC  →  User submitted intro → mod queue message sent
              last_activity_at frozen here

22:23 UTC  →  Mod (quan_tox_head) clicked Approve
              Time since last_activity_at ≈ 63 minutes > 60 min limit
              → getState() DELETED the row, returned null

              mod_approve() received null state:
              pref = null?.contentPreference ?? 'SFW'  →  'SFW'  (wrong — user chose NSFW)
              selectedRoles = null?.selectedRoles       →  {}     (wrong — user had selected roles)

              Bot assigned:  travelerRoleId (Traveller role)
              DB saved:      content_preference = SFW, role_assigned = TRAVELER, selected_roles = {}
```

### Why Discord Showed Initiate (Not Traveller)

After the bot incorrectly assigned Traveller, a mod manually changed the role to Initiate in Discord. The bot has no mechanism to track manual role changes, so the DB remained out of sync.

### Secondary Bug — Hard Deletes Everywhere

`clearState()`, `cleanupExpired()` all used `DELETE FROM verification_states` — permanently destroying audit data with no recovery path.

---

## Impact

- User received the wrong role (Traveller instead of the Initiate they qualified for based on their NSFW preference)
- User received **no category roles** (Gender, Pronouns, Age, etc.) because `selectedRoles` was lost
- DB permanently recorded wrong `content_preference` and `role_assigned` values
- Any user whose mod approval took >60 minutes silently hit this bug

---

## Fix Applied

### 1. Removed expiry check from `getState()`
State now persists until an explicit business event changes it. No silent mid-flow deletion.

### 2. Replaced hard deletes with soft deletes + meaningful status transitions

| Event | Before | After |
|---|---|---|
| Mod approves | `DELETE FROM verification_states` | `SET status = 'APPROVED'` |
| Mod rejects | `DELETE FROM verification_states` | `SET status = 'REJECTED'` |
| User leaves mid-flow | `DELETE FROM verification_states` | `SET status = 'LEFT'` |
| Verification restart | `DELETE` + `INSERT` | `initState()` ON CONFLICT resets to `ACTIVE` |
| Background cleanup | `DELETE` rows older than N minutes | **Removed entirely** |

### 3. Removed `cleanupExpired()` and `startCleanupJob()` entirely
No automated deletion of any kind. Data persists permanently.

### 4. `status` column added to `verification_states`

```sql
ALTER TABLE verification_states ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
UPDATE verification_states SET status = 'ACTIVE';
```

Possible values: `ACTIVE`, `APPROVED`, `REJECTED`, `LEFT`

### 5. All queries now filter by `status = 'ACTIVE'`
Historical rows are invisible to the bot's active flows but remain in DB for audit.

---

## Files Changed

| File | Change |
|---|---|
| `src/db/stateRepository.js` | Removed expiry check, hard deletes, `cleanupExpired`. Added `status` column support, `markApproved`, `markRejected`, `markLeft` |
| `src/utils/stateManager.js` | Removed `clearState`, `startCleanupJob`. Exposed `markApproved`, `markRejected`, `markLeft` |
| `src/events/interactionCreate.js` | `clearState()` → `markApproved()` / `markRejected()`. Removed redundant `clearState()` before restart |
| `src/events/guildMemberRemove.js` | `clearState()` → `markLeft()` |
| `src/events/ready.js` | Removed `startCleanupJob()` import and call |

---

## DB Migration Required

```sql
ALTER TABLE verification_states ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
UPDATE verification_states SET status = 'ACTIVE';
```

---

## Affected User — Manual Correction Needed

User `dickscord1949` (`755691070968299523`) in Desi Sisters:
- DB currently shows: `content_preference = SFW`, `role_assigned = TRAVELER`, `selected_roles = {}`
- Actual preference was NSFW (SFW+NSFW) — confirmed by their Initiate role in Discord
- Their category roles (Gender, Pronouns, Age, etc.) were never assigned by the bot

A mod manually corrected the role to Initiate. Category roles still missing — user may need to be re-verified or roles assigned manually.

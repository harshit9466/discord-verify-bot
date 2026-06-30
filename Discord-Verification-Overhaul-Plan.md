# Discord Server Verification Overhaul — Complete Plan
**Server ID:** 964889268046692414  
**Last Updated:** 2026-05-29  
**Goal:** Reduce joining friction, automate mod workload, track member lifecycle, support SFW/NSFW preference, and handle account switches gracefully.

---

## Implementation Status

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | Bot setup + button verification flow | ✅ Done |
| Phase 2 | Introduction modal + mod queue | ✅ Done |
| Phase 3 | PostgreSQL + returning member auto-verify | ✅ Done |
| Phase 4 | Account switch system | ⏳ Backlog |
| Phase 5 | Mod panel + notifications + reminder/auto-kick | ✅ Done |
| Phase 6 | Admin config via Discord | 🔲 Planned |
| Phase 7 | Member self-service (role update + intro edit) | 🔲 Planned |
| Phase 8 | Enhanced mod tools (lookup, notes, weekly summary) | 🔲 Planned |
| Phase 9 | Analytics enhancement (time range, rejection reasons) | 🔲 Planned |

---

## What's Live (as of 2026-05-29)

### Verification Flow
- New member joins → `@Unverified` role
- Persistent "Start Verification" button in verify channel
- Step 1: Rules agreement
- Step 2: Role selection (10 categories via dropdowns)
- Step 3: Content preference (SFW / SFW+NSFW / NSFW Only)
- Step 4: Introduction modal (name, age, location, how found, about you)
- Optional: Kinks & hard limits modal (skippable)
- Submit → `@Verification Pending` role + mod queue entry

### Mod Queue
- Formatted embed per submission (profile, roles, intro)
- Approve → verified role assigned, `@Unverified` removed, DM sent, public intro posted, deleted from queue
- Reject → reason modal, DM with reason, deleted from queue
- Subscribed mods pinged on new entry

### Logs
- `#verified-logs` — green embed per approved member
- `#rejected-logs` — red embed per rejected member
- `#verification-log` — general activity log

### Returning Members
- Auto-verify on rejoin if previously VERIFIED
- Roles re-assigned from DB, DM sent, no mod action needed

### Mod Panel (pinned in `#mod-panel`)
- Stats grid: Joins / Verified / Rejected / Auto-Verified / Avg Time
- Queue status: Not Started / Pending Review / Subscribed Mods
- Auto-refreshes every 1 hour
- Buttons: Refresh Stats | Notifications | Settings

### Settings (via mod panel ⚙️ Settings button)
- Reminder DM toggle + configurable hours
- Auto-kick toggle + configurable hours
- Invite link on kick toggle + configurable link
- All settings persist in PostgreSQL (survive redeploys)

### Scheduled Jobs
- Every 30 min: reminder DMs + auto-kick for overdue unverified members
- Every 1 hour: mod panel stats auto-refresh

---

## Database Schema (Current)

### `members`
| Column | Type | Notes |
|--------|------|-------|
| discord_user_id | VARCHAR(20) | Unique per guild |
| guild_id | VARCHAR(20) | |
| username_history | JSONB | Array of past usernames |
| first_joined_at | TIMESTAMPTZ | |
| last_joined_at | TIMESTAMPTZ | |
| last_left_at | TIMESTAMPTZ | |
| verified_at | TIMESTAMPTZ | |
| verification_status | VARCHAR(20) | PENDING / AWAITING_MOD / VERIFIED / REJECTED / TIMED_OUT |
| content_preference | VARCHAR(20) | SFW / NSFW / NSFW_ONLY |
| role_assigned | VARCHAR(20) | TRAVELER / INITIATE / NSFW_ONLY |
| selected_roles | JSONB | { categoryIndex: [roleId, ...] } |
| intro | JSONB | { displayName, age, location, howFound, aboutYou, kinks, hardLimits } |
| rejoin_count | INTEGER | |
| notes | TEXT | Mod notes |
| reminder_sent_at | TIMESTAMPTZ | For reminder job dedup |

### `events`
| Column | Type | Notes |
|--------|------|-------|
| event_type | VARCHAR(30) | JOIN / LEAVE / VERIFIED / REJECTED / KICKED / REJOIN |
| triggered_by | VARCHAR(20) | Mod Discord ID |
| notes | TEXT | |

### `mod_subscribers`
Mods who opted in for ping on new verification submissions.

### `guild_settings`
| Column | Type | Notes |
|--------|------|-------|
| guild_id | VARCHAR(20) | PK |
| settings | JSONB | verificationSettings (reminder, kick, invite) |

---

## Phase 6 — Admin Config via Discord
**Goal:** Admin can change welcome message + rules text from Discord without touching JSON files or redeploying.

### New slash command: `/edit-config`
- Admin only (Administrator permission)
- Opens a modal with 4 fields (max 5 Discord allows):
  - Welcome Title
  - Welcome Description (paragraph)
  - Rules Title
  - Rules Text (paragraph)
- On save → stored in `guild_settings` DB as `configOverrides`
- Bot startup: loads overrides from DB and applies to in-memory config cache

### DB change
- `guild_settings` table: add `config_overrides JSONB DEFAULT '{}'` column

### Files to change
- `src/db/connection.js` — add column migration
- `src/db/settingsRepository.js` — add getConfigOverrides / saveConfigOverrides
- `src/config/configManager.js` — apply DB overrides at startup
- `src/events/interactionCreate.js` — cmd_editConfig + modal_saveConfig
- `src/deploy-commands.js` — register /edit-config
- `src/index.js` — load config overrides in ready event

---

## Phase 7 — Member Self-Service

### 7a. Role Update Request (`/update-roles`)
Verified members can request to change their selected roles without going through full reverification.

**Flow:**
1. Verified member runs `/update-roles`
2. Bot shows current role selections pre-filled in dropdowns
3. Member changes selections and submits
4. Bot posts to mod queue with cyan "🔄 Role Update Request" embed
5. Mod approves → old roles removed, new roles assigned, DB updated, DM sent
6. Mod rejects → DM sent with reason

**State:** Uses existing stateManager with new flow type `ROLE_UPDATE`

### 7b. Introduction Edit (`/edit-intro`)
Verified members can request to update their public intro post.

**Flow:**
1. Verified member runs `/edit-intro`
2. Bot opens intro modal pre-filled with their current DB values
3. Member edits and submits
4. Bot posts to mod queue with purple "✏️ Intro Edit Request" embed
5. Mod approves → DB intro updated, old public intro post deleted + new one posted, DM sent
6. Mod rejects → DM with reason

**Note:** Requires storing public intro message ID in DB to edit/delete it.

### DB changes
- `members` table: add `public_intro_message_id VARCHAR(20)` column
- On verification approve: save message ID after posting to intro channel

### Files to change
- `src/db/connection.js` — add column
- `src/db/memberRepository.js` — updateSelectedRoles, updateIntro, savePublicIntroMsgId
- `src/utils/stateManager.js` — new flow types
- `src/utils/embeds.js` — role update queue embed, intro edit queue embed, approved DM embeds
- `src/utils/components.js` — role update queue buttons, intro edit modal
- `src/events/interactionCreate.js` — cmd handlers + mod queue action handlers
- `src/deploy-commands.js` — register /update-roles and /edit-intro

---

## Phase 8 — Enhanced Mod Tools

### 8a. Member Lookup (`/lookup @user`)
Admin/mod command to view a member's full DB record.

**Output embed:**
- Discord tag + avatar
- Verification status, role assigned, content preference
- First joined, last joined, rejoin count, verified date
- Intro summary (name, age, location)
- Notes field (mod notes)
- Recent events (last 5 from events table)

**New slash command:** `/lookup` with required `user` option (User type)

### 8b. Mod Notes
When approving or rejecting, mods can add an optional note that gets saved to `members.notes`.

**UI change:** Approval flow (after deferUpdate) → ask for optional note via ephemeral followUp button:
- "📝 Add Note" button → opens modal with note field
- "Skip" button → proceeds without note
- Note saved in DB, visible via /lookup

Alternatively: add optional note field directly to reject reason modal.

### 8c. Weekly Summary DM
Every Sunday at midnight (server timezone), subscribed mods receive a DM:
- Last 7 days stats
- Pending review count
- Members auto-kicked this week
- Top rejection reason (if any)

**Scheduled job:** In `index.js` ready event, `setInterval` every 24h checks if it's Sunday.

### Files to change
- `src/db/memberRepository.js` — getMemberForLookup, updateMemberNotes
- `src/utils/embeds.js` — buildLookupEmbed, buildWeeklySummaryEmbed
- `src/events/interactionCreate.js` — cmd_lookup, mod notes flow
- `src/deploy-commands.js` — register /lookup
- `src/index.js` — weekly summary job

---

## Phase 9 — Analytics Enhancement

### 9a. Time Range Selector on Mod Panel
Add a StringSelectMenu below the mod panel buttons:
- Options: Last 7 Days / Last 30 Days / All Time
- On select → refresh stats with chosen range
- `getStats(guildId, days)` already supports variable days; `days = 0` = all time

### 9b. Rejection Reasons Breakdown
New query on `events` table: extract rejection reasons from notes field, group by frequency.

Show in mod panel or via `/rejection-stats` command:
```
Top Rejection Reasons (Last 30 Days)
1. "Intro too short" — 4 times
2. "Age not provided" — 2 times
3. "No location given" — 1 time
```

### Files to change
- `src/db/statsRepository.js` — update getStats for all-time, add getTopRejectionReasons
- `src/utils/embeds.js` — update buildModPanelEmbed for time range, add buildRejectionStatsEmbed
- `src/utils/components.js` — time range select menu
- `src/events/interactionCreate.js` — time range panel handler, rejection stats handler
- `src/deploy-commands.js` — register /rejection-stats (optional, could be panel-only)

---

## Phase 4 (Backlog) — Account Switch System

Low priority. Full flow:
1. `/claim-old-account` command opens modal (old username, old user ID, reason)
2. Bot creates private thread in mod channel with DB history of old account
3. Mod verifies and approves/denies in thread
4. Approve: new account gets old role, old account gets `@Jailed`
5. `account_links` table records the link

**DB:** Add `account_links` table when implementing.

---

## Current Config Files

**`guild-configs/964889268046692414.json`** — static server config (channels, roles, role categories, messages)  
**PostgreSQL `guild_settings`** — dynamic settings (verificationSettings, future: config overrides)  
**Railway environment:** `DISCORD_TOKEN`, `CLIENT_ID`, `DATABASE_URL`

---

## Known Limitations / Tech Debt

- stateManager is in-memory — bot restart clears all in-progress verifications
- guild config JSON is static — editable only via git push (Phase 6 fixes this)
- No test suite yet
- Single guild support only (multi-guild works but config files are per-guild manually)

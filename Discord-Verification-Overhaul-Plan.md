# Discord Server Verification Overhaul — Complete Plan
**Server ID:** 964889268046692414  
**Date:** 2026-05-25  
**Goal:** Reduce joining friction, automate mod workload, track member lifecycle, support SFW/NSFW preference, and handle account switches gracefully.

---

## Problem Summary

Current flow requires members to:
1. Manually go to #rules and click a check mark
2. Manually go to #roles and pick roles
3. Write a freeform intro in #introductions
4. Wait up to 24 hours for a mod to manually verify them

This is high-friction for users and highly manual for mods. There's also no tracking, no returning member detection, and no account switch mechanism.

---

## Proposed Solution: Custom Discord Bot

The core of the overhaul is a **dedicated verification bot** built with **discord.js v14** (Node.js). This bot handles every step of the verification pipeline using Discord's native UI components — buttons, select menus, and modals — so the experience feels native and smooth.

Alongside this custom bot, you can keep **Carl-bot or YAGPDB** for general utility (reaction roles for interests, moderation, etc.). The custom bot handles only the verification pipeline.

---

## Flow 1: New Member Verification (Redesigned)

### What Changes
- No more visiting #rules, #roles, and #introductions separately
- Everything happens in a single guided DM/channel flow
- Intro is a structured form (modal), not a freeform message
- Mods get a formatted card with one-click Approve/Reject instead of reading a paragraph

### Step-by-Step Flow

**Step 0 — Join Event**  
Member joins → Bot instantly assigns `@Unverified` role. This role has zero channel access except #welcome and #account-claim.

**Step 1 — Welcome + Start**  
Bot sends a DM (or posts in #welcome) with a branded embed:
- Server intro, what to expect
- Single button: **[Begin Verification →]**

**Step 2 — Rules Agreement**  
Bot posts rules directly in the DM as an embed. User clicks **[✅ I Agree to the Rules]** button. No navigating to a channel. Agreement is logged with a timestamp in the database.

**Step 3 — Role Selection**  
Bot posts Discord Select Menus (dropdowns), one per interest category. User must select at least one from each. Bot validates before allowing next step. This replaces manually going to #roles.

**Step 4 — Content Preference (SFW/NSFW)**  
Bot posts a prompt:
> "Which content would you like access to?"

Two buttons:
- **[🌞 SFW Only]** → Will assign `@Traveller` on verification
- **[🔞 SFW + NSFW]** → Will assign `@Initiate` on verification

Choice is stored in DB. Not assigned yet — assigned only after mod approval.

**Step 5 — Introduction Modal**  
Clicking "Next" triggers a native Discord modal popup (no navigating anywhere) with structured fields:
- **Display Name / What to call you** (required, 2–32 chars)
- **Age** (required, number — bot validates it's reasonable)
- **How did you find our server?** (required, 10–200 chars)
- **Tell us about yourself** (required, 30–500 chars)

This replaces freeform #introductions posts entirely. Structured data = faster mod review.

**Step 6 — Mod Review Queue**  
Bot posts a formatted embed in `#mod-verify-queue` (private, mods only):

```
📋 New Verification Request
━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Username: example#1234 (ID: 123456789)
📅 Joined: 2026-05-25 at 14:32 UTC
🎭 Name: Alex
🎂 Age: 22
🔍 Found us via: A friend's recommendation
📝 About: [their intro text here]
🏷️ Roles selected: Gaming, Anime, Music
🔞 Content Preference: SFW + NSFW (will get @Initiate)
━━━━━━━━━━━━━━━━━━━━━━━━━━
[✅ Approve]   [❌ Reject]   [🔎 View Profile]
```

**Approve** → Bot assigns the correct role, removes @Unverified, DMs the user with a welcome message.  
**Reject** → Bot DMs user with the reason (mod types a quick reason in a text input that appears after clicking Reject). User can redo Step 5 only — no full restart.

### Mod Time Saved
Old flow: Read freeform intro → find #roles to see what they picked → manually assign role in member list → DM user.  
New flow: One click on Approve/Reject in a pre-formatted card.

---

## Flow 2: Returning Member — Auto-Verify

### Problem
Currently, a member who leaves and rejoins has to go through the full verification again, wasting both their time and mod time.

### Solution
The bot maintains a database of all verified members indexed by **Discord User ID**. When `guildMemberAdd` fires:

1. Bot looks up the user ID in the `members` table
2. **If found with `verification_status = VERIFIED`:**
   - Bot immediately assigns their previous role (Initiate or Traveller)
   - Removes @Unverified
   - Sends a personalized "Welcome back, {name}! You've been auto-verified 🎉" DM
   - Logs the rejoin event in #verification-log for mod visibility
   - Updates `last_joined_at` and increments `rejoin_count` in DB
3. **If found but NOT verified (left mid-flow):**
   - Restarts verification flow
   - DB context shown to mods so they know this person had a previous attempt

### Key Note on Discord User IDs
Discord User IDs are permanent and unique even if someone changes their username. So `discord_user_id` is the reliable key for lookup — not username or display name.

---

## Flow 3: Account Switch

### Problem
A member's old Discord account gets hacked, disabled, or lost. They join on a new account but deserve to skip full verification since they were already a community member.

### Solution

**Channel:** `#account-claim`  
This channel is visible to @Unverified users only for the purpose of using one slash command.

**Slash Command:** `/claim-old-account`  
This opens a modal:
- **Old account username** (e.g., `example#0001` or just `example`)
- **Old account User ID** (optional but helps mods; user can get this from Discord's copy ID feature)
- **Reason for account switch** (text, 20–300 chars)

**Bot Action:**  
Bot creates a **private thread** in `#mod-support` (or a dedicated `#account-claims-review` channel). The thread includes:
- The user's claim
- DB history of the old account (when they joined, verified date, roles, any notes)
- Two buttons: **[✅ Approve Claim]** and **[❌ Deny Claim]**

**Mod Verification (in thread):**  
Mods can ask for proof inside the thread. Suggested proof methods:
- Have the old account send a specific message in a restricted channel (if it still has access)
- Screenshot of the old account's DM history with the server bot
- Any other social proof the mods are comfortable with

**If Approved:**  
- New account → gets the role the old account had (Initiate or Traveller)
- Old account → gets `@Jailed` role (all channel access removed, can only see `#jailed-accounts` which explains "this account has been locked — contact mods if this is a mistake")
- DB: `account_links` table records the old → new link

**If Denied:**  
- New account goes through normal verification flow
- Thread archived, note added to DB

---

## Database Design

### Table: `members`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key, auto-increment |
| discord_user_id | VARCHAR(20) | Unique, permanent Discord ID |
| username_history | JSON | Array of past usernames (Discord allows changes) |
| first_joined_at | TIMESTAMP | Very first join to server |
| last_joined_at | TIMESTAMP | Most recent join |
| last_left_at | TIMESTAMP | Most recent leave (null if still in server) |
| verified_at | TIMESTAMP | When verification was approved |
| verification_status | ENUM | `PENDING`, `VERIFIED`, `REJECTED`, `JAILED` |
| content_preference | ENUM | `SFW`, `NSFW`, `BOTH` |
| role_assigned | ENUM | `INITIATE`, `TRAVELLER`, `NONE` |
| intro_text | TEXT | Their introduction form submission |
| rejoin_count | INTEGER | How many times they've left and rejoined |
| notes | TEXT | Mod notes (freeform) |

### Table: `events`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| discord_user_id | VARCHAR(20) | FK to members |
| event_type | ENUM | `JOIN`, `LEAVE`, `VERIFIED`, `REJECTED`, `ACCOUNT_SWITCH`, `JAILED`, `ROLE_CHANGE` |
| event_at | TIMESTAMP | When it happened |
| triggered_by | VARCHAR(20) | Mod's Discord ID if mod-triggered |
| notes | TEXT | Context |

### Table: `account_links`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| old_discord_user_id | VARCHAR(20) | FK to members |
| new_discord_user_id | VARCHAR(20) | FK to members |
| linked_at | TIMESTAMP | When approved |
| approved_by_mod_id | VARCHAR(20) | Mod who approved |
| reason | TEXT | User-provided reason |

---

## Role Structure

| Role | Who Gets It | Access |
|---|---|---|
| `@Unverified` | Auto on join | #welcome, #account-claim only |
| `@Verification-Pending` | After intro submitted | Same as @Unverified + can see a "pending" info channel |
| `@Traveller` | Verified, SFW preference | All SFW channels |
| `@Initiate` | Verified, NSFW preference | All SFW + NSFW channels |
| `@Jailed` | Locked accounts | Only #jailed-accounts (read-only) |

---

## Channels Needed

| Channel | Visibility | Purpose |
|---|---|---|
| `#welcome` | @Unverified can see | Bot posts welcome embed with Begin Verification button |
| `#account-claim` | @Unverified can see | Only for /claim-old-account command |
| `#mod-verify-queue` | Mods only | Bot posts formatted verification cards with Approve/Reject |
| `#verification-log` | Mods only | Stream of all join/leave/verify/rejoin events |
| `#jailed-accounts` | @Jailed can see | Explains jailed status to locked accounts |

---

## Tech Stack

### Bot Framework
**discord.js v14** (Node.js)  
Reason: Best support for Buttons, Select Menus, and Modals (the three UI components this flow depends on). Most maintained, largest community, best documentation.  
Alternative: discord.py (Python) works too but discord.js v14 has better component support.

### Database
**SQLite** for smaller servers (under ~10,000 members)  
→ No external setup, single file, zero cost, good enough.

**PostgreSQL** if you want a proper setup  
→ More scalable, better for querying, can run on Railway or Supabase free tier.

### Hosting
**Railway.app** — Recommended  
- Free $5/month credit (usually enough for a Discord bot)
- Always-on (doesn't spin down like Render free tier)
- Simple Node.js deployment with environment variables for bot token
- Built-in PostgreSQL if you go that route

**Alternatives:** Fly.io (free tier), VPS on DigitalOcean ($4/month), or your own machine if always on.

---

## Implementation Phases

### Phase 1 — Bot Setup + Button Verification Flow (Week 1–2)
- Create bot in Discord Developer Portal, set up discord.js project
- Welcome embed with Begin Verification button
- Rules agreement step
- Role selection via Select Menus
- Content preference (SFW/NSFW) step
- Basic in-memory state machine per user (no DB yet)

### Phase 2 — Introduction Modal + Mod Queue (Week 2–3)
- Introduction modal (Steps 5–6)
- Mod review queue with formatted cards
- Approve/Reject buttons with role assignment
- DM on approval/rejection

### Phase 3 — Database + Returning Member Detection (Week 3–4)
- Set up SQLite/PostgreSQL
- Persist all member data on verification
- Detect returning verified members on `guildMemberAdd`
- Auto-verify flow + #verification-log logging
- Track all events in `events` table

### Phase 4 — Account Switch System (Week 4–5)
- `/claim-old-account` slash command
- Private thread creation with mods
- @Jailed role + #jailed-accounts channel
- `account_links` DB table

### Phase 5 — Polish + Analytics (Ongoing)
- Timeout handling (user starts verification but doesn't finish — send reminder after 24h)
- Mod dashboard command: `/stats` — shows verifications this week, avg time-to-verify, rejoin rate
- Auto-expire pending verifications after 7 days

---

## What You Need to Do First

1. **Create a Discord Application** at https://discord.com/developers/applications → New Application → Bot tab → Reset Token (save this)
2. **Invite the bot** to your server with these permissions: Manage Roles, Send Messages, Create Private Threads, Manage Channels, Read Message History, Use Application Commands
3. **Decide on hosting** — Railway.app is the easiest path
4. **Decide on database** — SQLite to start is fine, migrate to Postgres later if needed
5. **Note your role IDs** for @Unverified, @Initiate, @Traveller (Settings → Roles → right click → Copy ID with Developer Mode on)

---

## What You Don't Need to Build

- A web dashboard (Discord's mod queue channel + bot commands are enough)
- A full intro system in #introductions (you can still have the channel for community reading, but verification happens in DM)
- Complex analytics (Phase 5 is optional, bot commands are sufficient)

---

## Existing Bots You Can Keep

| Bot | Keep Using For | Stop Using For |
|---|---|---|
| Carl-bot | Interest/hobby reaction roles in #roles | Verification flow |
| MEE6 | Leveling, moderation | Verification |
| Any existing logging bot | General logging | Member lifecycle (custom bot handles this now) |

The custom verification bot and Carl-bot can coexist without conflict. Carl-bot handles community roles; custom bot handles the verification pipeline.

---

## Summary of Wins

| Problem | Before | After |
|---|---|---|
| Joining friction | 3 channels + freeform intro + wait 24h | Guided 5-step DM flow, modal form |
| Mod workload | Read intro, find roles, manually assign | One-click Approve/Reject on formatted card |
| SFW/NSFW selection | Hidden in roles channel | Explicit step in verification flow |
| Returning members | Full re-verification | Auto-verify in seconds |
| Account switches | No mechanism | `/claim-old-account` + private thread |
| Member tracking | None | Full join/leave/verify/rejoin history |


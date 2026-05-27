# Discord Verify Bot — Complete Setup Guide

> JS se familiar nahi ho toh bhi follow kar sakte ho. Har step clearly likha hai.

---

## 💰 Railway.app Cost — Pehle Samajh Lo

| Plan | Cost | Use Case |
|---|---|---|
| Hobby | **$5/month** | Testing + small server (recommended) |
| Pro | $20/month | Larger usage, multiple bots |

Railway gives $5 free trial credit. So **first month free**.  
Ek Discord bot ke liye typically $1–2/month use hota hai (very low resource).

---

## 📋 PART 1: Discord Developer Portal Setup

### Step 1.1 — Create the Application

1. Jao: https://discord.com/developers/applications
2. Click **"New Application"**
3. Name do: `VerifyBot` (ya kuch bhi)
4. Click **"Create"**

### Step 1.2 — Create the Bot

1. Left sidebar mein click **"Bot"**
2. Click **"Add Bot"** → **"Yes, do it!"**
3. Scroll down to **"Privileged Gateway Intents"**
4. Enable: ✅ **SERVER MEMBERS INTENT** (ZAROORI HAI)
5. Enable: ✅ **MESSAGE CONTENT INTENT** (just in case)
6. Click **"Save Changes"**

### Step 1.3 — Get Your Bot Token

1. Bot page pe click **"Reset Token"**
2. Token copy karo — **KISI KO MAT DIKHANA, KABHI BHI**
3. Kisi safe jagah save karo (Notepad, etc.) — baad mein .env mein daalna hai

### Step 1.4 — Get Your Application/Client ID

1. Left sidebar → **"General Information"**
2. **"Application ID"** copy karo

### Step 1.5 — Invite Bot to Your Server

Yeh URL browser mein kholo (apna Application ID replace karo):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=8&scope=bot%20applications.commands
```

> `permissions=8` = Administrator (easiest for testing)  
> Production mein narrow down karte hain

1. Server select karo
2. **"Authorize"** click karo

---

## 📋 PART 2: Your Computer Setup

### Step 2.1 — Install Node.js

1. Jao: https://nodejs.org
2. **LTS version** download karo (20.x ya higher)
3. Install karo (default settings theek hain)
4. Verify: Command Prompt/Terminal mein type karo:
   ```
   node --version
   ```
   Output aana chahiye: `v20.x.x`

### Step 2.2 — Download/Open the Bot Code

The bot code is in the `discord-verify-bot` folder.

Open **Command Prompt** (Windows) ya **Terminal** (Mac/Linux) aur navigate karo:
```
cd "C:\Users\Admin\OneDrive - Corporate Infotech Pvt Ltd\Documents\Claude\Projects\Discord Help\discord-verify-bot"
```

### Step 2.3 — Install Dependencies

```
npm install
```

Yeh `node_modules` folder create karega — pakka sure karo network connected hai.

### Step 2.4 — Create .env File

1. `discord-verify-bot` folder mein ek file banao: `.env` (sirf `.env`, koi extension nahi)
2. Isme yeh content dalo:

```
DISCORD_TOKEN=paste_your_bot_token_here
CLIENT_ID=paste_your_application_id_here
LOG_LEVEL=info
```

---

## 📋 PART 3: Discord Server Setup

Developer Mode enable karo (IDs copy karne ke liye):
**Settings → Advanced → Developer Mode → ON**

### Step 3.1 — Create Required Roles

Server Settings → Roles → Create Role (in this order, top to bottom):

| Role Name | Color | Who Gets It |
|---|---|---|
| `Unverified` | Gray | New members (auto by bot) |
| `Verification Pending` | Yellow | Intro submitted, awaiting mod |
| `Initiate` | Purple | Verified, SFW + NSFW |
| `Traveler` | Green | Verified, SFW only |
| `Jailed` | Red | Locked accounts (Phase 3) |

**IMPORTANT:** Bot role (@VerifyBot ya jो bhi naam hai) ko **Initiate, Traveler, Unverified ke UPAR** rakhna hoga permissions mein. Nahi toh roles assign nahi kar payega.

### Step 3.2 — Create Required Channels

| Channel Name | Type | Visible To |
|---|---|---|
| `#welcome` | Text | @Unverified, @everyone |
| `#account-claim` | Text | @Unverified (Phase 3 mein use hoga) |
| `#mod-verify-queue` | Text | Mods only |
| `#verification-log` | Text | Mods only |

**Channel Permissions for `#welcome`:**
- @everyone → View Channel ✅, Send Messages ❌
- @Unverified → View Channel ✅
- Bot role → View Channel ✅, Send Messages ✅, Manage Messages ✅

**Channel Permissions for `#mod-verify-queue` and `#verification-log`:**
- @everyone → View Channel ❌
- Mod role → View Channel ✅
- Bot role → View Channel ✅, Send Messages ✅

### Step 3.3 — Create Your Guild Config File

1. Right-click your server name → **"Copy Server ID"**
2. `guild-configs/` folder mein ek file banao: `{YOUR_SERVER_ID}.json`
   - Example: `964889268046692414.json`
3. `example-config.json` ka content copy karo is file mein
4. Sab IDs fill karo:

**How to get Channel/Role IDs:**
- Channel par right-click → **"Copy Channel ID"**
- Role pe right-click (Server Settings → Roles) → **"Copy Role ID"**

Fill in karni hain yeh fields:
```json
{
  "guildId": "964889268046692414",
  "guildName": "Aapka Server Naam",
  "channels": {
    "welcomeChannelId": "RIGHT_CLICK_WELCOME_COPY_ID",
    "modQueueChannelId": "RIGHT_CLICK_MOD_QUEUE_COPY_ID",
    "logChannelId": "RIGHT_CLICK_LOG_COPY_ID",
    "accountClaimChannelId": "RIGHT_CLICK_ACCOUNT_CLAIM_COPY_ID"
  },
  "roles": {
    "unverifiedRoleId": "RIGHT_CLICK_UNVERIFIED_ROLE_COPY_ID",
    "travelerRoleId": "RIGHT_CLICK_TRAVELER_ROLE_COPY_ID",
    "initiateRoleId": "RIGHT_CLICK_INITIATE_ROLE_COPY_ID",
    "jailedRoleId": "RIGHT_CLICK_JAILED_ROLE_COPY_ID",
    "verificationPendingRoleId": "RIGHT_CLICK_PENDING_ROLE_COPY_ID"
  },
  ...interest roles ka bhi sab fill karna hai
}
```

**For your second server:** Same process — ek aur `{SERVER_2_ID}.json` file banao. Bot dono serve karega!

---

## 📋 PART 4: Run the Bot Locally (Testing)

### Step 4.1 — Register Slash Commands (sirf ek baar)

```
npm run deploy-commands
```

Output aana chahiye: `✅ Successfully registered 3 commands!`

### Step 4.2 — Start the Bot

```
npm start
```

Yeh dikhna chahiye:
```
[2026-05-25 14:32:01] info: Connecting to Discord...
[2026-05-25 14:32:02] info: ✅ Bot is ONLINE as: VerifyBot#1234
[2026-05-25 14:32:02] info: 📡 Connected to 1 guild(s)
[2026-05-25 14:32:02] info: Config loaded for guild: Aapka Server (964889268046692414)
```

### Step 4.3 — Test It!

1. Kisi dusre account se (ya test account se) apna server join karo
2. Bot DM aana chahiye with "Begin Verification →" button
3. Saare steps complete karo
4. Mod account se `#mod-verify-queue` check karo — card aana chahiye
5. Approve click karo — user ko role milna chahiye

---

## 📋 PART 5: Railway.app Deployment (Production)

### Step 5.1 — GitHub Setup

Bot code ko GitHub pe upload karo:
1. https://github.com pe account banao (agar nahi hai)
2. New repository banao: `discord-verify-bot` (Private rakho)
3. Code upload karo (GitHub Desktop easiest tool hai)
4. **`.env` file UPLOAD MAT KARNA** — `.gitignore` already handle karta hai

### Step 5.2 — Railway Account

1. Jao: https://railway.app
2. **"Login with GitHub"** click karo
3. GitHub account se authorize karo

### Step 5.3 — Create Railway Project

1. Dashboard pe **"New Project"** click karo
2. **"Deploy from GitHub repo"** select karo
3. Apna `discord-verify-bot` repo select karo
4. Railway auto-detect karega ki yeh Node.js project hai

### Step 5.4 — Environment Variables Add Karo

1. Project open karo → click service pe
2. **"Variables"** tab
3. Click **"Raw Editor"** aur paste karo:
```
DISCORD_TOKEN=your_actual_token_here
CLIENT_ID=your_actual_client_id_here
LOG_LEVEL=info
```
4. **"Update Variables"** click karo

### Step 5.5 — Deploy

1. Railway automatically deploy karega
2. **"Deploy Logs"** mein dekho:
   ```
   ✅ Bot is ONLINE as: VerifyBot#1234
   ```
3. Done! Bot 24/7 online rahega.

### Step 5.6 — guild-configs Files

Railway pe code deploy hone ke baad, config files add karne ka easiest tarika:
1. GitHub repo mein config files add karo (guild-configs/ folder mein)
2. Railway automatically redeploy karega

---

## 🔧 Common Issues & Fixes

### Bot ne DM nahi bheja?
- User ne DMs disable kar rakhe hain — bot #welcome mein fallback message bhejega

### "Missing Permissions" error?
- Bot role ko Initiate/Traveler ke **UPAR** rakhna zaroori hai server settings mein

### Bot online hai but nothing happening when I join?
- Confirm karo `SERVER MEMBERS INTENT` enabled hai Developer Portal mein
- Config file ka `guildId` sahi hai?
- `npm run deploy-commands` run kiya?

### Mod queue card nahi aaya?
- `modQueueChannelId` correct hai config mein?
- Bot ko us channel mein Send Messages permission hai?

---

## 🗺️ Roadmap — Kya Baaki Hai

| Phase | Feature | Status |
|---|---|---|
| **Phase 1** | New member verification flow | ✅ **Done (yahi hai)** |
| **Phase 2** | PostgreSQL DB + Returning member auto-verify | 🔜 Next |
| **Phase 3** | Account switch system (`/claim-old-account`) | 🔜 After Phase 2 |
| **Phase 4** | `/config` admin command (GUI config, no JSON editing) | 🔜 Future |
| **Phase 5** | `/stats` command — verification analytics | 🔜 Future |

---

## 📁 File Structure Reference

```
discord-verify-bot/
├── src/
│   ├── index.js                    ← Entry point (bot starts here)
│   ├── deploy-commands.js          ← Run once to register slash commands
│   ├── config/
│   │   └── configManager.js        ← Reads guild config JSON files
│   ├── events/
│   │   ├── ready.js                ← Bot online hone pe
│   │   ├── guildMemberAdd.js       ← Member join pe
│   │   ├── guildMemberRemove.js    ← Member leave pe
│   │   └── interactionCreate.js    ← All buttons/modals/dropdowns
│   └── utils/
│       ├── logger.js               ← Winston logging
│       ├── stateManager.js         ← Tracks verification progress
│       ├── embeds.js               ← Discord embed builders
│       └── components.js           ← Buttons, dropdowns, modals
├── guild-configs/
│   ├── example-config.json         ← Template (copy to your server ID)
│   └── 964889268046692414.json     ← Your server's config (create this)
├── .env                            ← Bot token (NEVER commit to git)
├── .env.example                    ← Template for .env
├── .gitignore
├── package.json
└── SETUP.md                        ← This file
```

---
name: events
description: "Skill for the Events area of discord-verify-bot. 61 symbols across 8 files."
---

# Events

61 symbols | 8 files | Cohesion: 63%

## When to Use

- Working with code in `discord-verify-bot/`
- Understanding how handleButton, step_content, step_openIntroModal work
- Modifying events-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `discord-verify-bot/src/events/interactionCreate.js` | handleButton, step_content, step_openIntroModal, mod_action, mod_approve (+18) |
| `discord-verify-bot/src/utils/embeds.js` | buildIntroPromptEmbed, buildApprovedEmbed, buildPublicIntroEmbed, getRoleLabelsForCategory, buildPendingEmbed (+9) |
| `discord-verify-bot/src/utils/components.js` | buildOpenIntroButton, buildIntroModal, buildRejectReasonModal, buildModQueueButtons, buildKinksModal (+7) |
| `discord-verify-bot/src/utils/stateManager.js` | getState, updateState, initState, clearState |
| `discord-verify-bot/src/events/guildMemberAdd.js` | execute, sendVerificationMessage, sendToVerifyChannel, logEvent |
| `discord-verify-bot/src/config/configManager.js` | reloadGuildConfig, getGuildConfig |
| `discord-verify-bot/src/events/guildMemberUpdate.js` | execute |
| `discord-verify-bot/src/events/guildMemberRemove.js` | execute |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `handleButton` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 46 |
| `step_content` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 239 |
| `step_openIntroModal` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 262 |
| `mod_action` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 377 |
| `mod_approve` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 403 |
| `buildOpenIntroButton` | Function | `discord-verify-bot/src/utils/components.js` | 175 |
| `buildIntroModal` | Function | `discord-verify-bot/src/utils/components.js` | 217 |
| `buildRejectReasonModal` | Function | `discord-verify-bot/src/utils/components.js` | 332 |
| `buildIntroPromptEmbed` | Function | `discord-verify-bot/src/utils/embeds.js` | 96 |
| `buildApprovedEmbed` | Function | `discord-verify-bot/src/utils/embeds.js` | 129 |
| `buildPublicIntroEmbed` | Function | `discord-verify-bot/src/utils/embeds.js` | 245 |
| `getRoleLabelsForCategory` | Function | `discord-verify-bot/src/utils/embeds.js` | 256 |
| `getState` | Function | `discord-verify-bot/src/utils/stateManager.js` | 71 |
| `handleModalSubmit` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 61 |
| `step_introSubmit` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 279 |
| `step_kinks` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 319 |
| `step_kinksSubmit` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 346 |
| `postToModQueue` | Function | `discord-verify-bot/src/events/interactionCreate.js` | 552 |
| `buildModQueueButtons` | Function | `discord-verify-bot/src/utils/components.js` | 187 |
| `buildKinksModal` | Function | `discord-verify-bot/src/utils/components.js` | 282 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Execute → GetGuildConfig` | cross_community | 4 |
| `Execute → BuildVerifyPanelEmbed` | cross_community | 4 |
| `Execute → BuildPersistentVerifyButton` | cross_community | 4 |
| `Execute → ClearState` | cross_community | 4 |
| `Execute → InitState` | cross_community | 4 |
| `Execute → UpdateState` | cross_community | 4 |
| `Execute → GetState` | cross_community | 4 |
| `Execute → BuildRestartVerifyButton` | cross_community | 4 |
| `Execute → BuildWelcomeEmbed` | intra_community | 4 |
| `Execute → BuildBeginButton` | intra_community | 4 |

## How to Explore

1. `gitnexus_context({name: "handleButton"})` — see callers and callees
2. `gitnexus_query({query: "events"})` — find related execution flows
3. Read key files listed above for implementation details

// ============================================================
// STATE MANAGER — Tracks each user's verification progress
//
// "State" matlab: user verification ke kis step pe hai, aur
// unhone ab tak kya select kiya hai (roles, SFW/NSFW, intro).
//
// Phase 1: In-memory Map use karta hai (bot restart pe state clear ho jata hai)
// Phase 2: Yeh state PostgreSQL DB mein jayegi (persistent)
//
// Key format: "guildId-userId"   e.g. "964889268046692414-123456789"
// ============================================================

const logger = require('./logger');

// Kitne time baad incomplete verification expire ho jaye
const TIMEOUT_MINUTES = 60;

// The in-memory store: ek Map jisme saare active verifications hain
const states = new Map();

// ---- Possible steps in the flow ----
const STEPS = {
  NOT_STARTED: 'NOT_STARTED',  // Joined but hasn't clicked "Begin"
  RULES:       'RULES',        // Step 1: Seeing the rules
  ROLES:       'ROLES',        // Step 2: Selecting interest roles
  CONTENT:     'CONTENT',      // Step 3: Choosing SFW/NSFW
  INTRO:       'INTRO',        // Step 4: Filling out introduction form
  PENDING:     'PENDING',      // Submitted, waiting for mod approval
  VERIFIED:    'VERIFIED',     // Approved by mod
  REJECTED:    'REJECTED',     // Rejected by mod
};

/**
 * Naya verification session start karta hai (jab member joins)
 */
function initState(guildId, userId) {
  const key = `${guildId}-${userId}`;

  const state = {
    guildId,
    userId,
    step: STEPS.NOT_STARTED,

    // Step 1
    rulesAgreed: false,

    // Step 2: { categoryIndex: [roleId, roleId, ...] }
    selectedRoles: {},

    // Step 3: 'SFW' | 'NSFW'
    contentPreference: null,

    // Step 4: { displayName, age, howFound, aboutYou }
    intro: null,

    // For sending follow-up messages in the mod queue
    modMessageId: null,

    startedAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  states.set(key, state);
  logger.debug(`Initialized verification state`, { guildId, userId });
  return state;
}

/**
 * User ki current state return karta hai.
 * Agar state expire ho gayi ho ya exist nahi karta, null return karta hai.
 */
function getState(guildId, userId) {
  const key = `${guildId}-${userId}`;
  const state = states.get(key);

  if (!state) return null;

  // Expiry check
  const ageMinutes = (Date.now() - state.lastActivityAt) / 1000 / 60;
  if (ageMinutes > TIMEOUT_MINUTES) {
    logger.info(`State expired for user ${userId} (${ageMinutes.toFixed(0)} min old)`);
    states.delete(key);
    return null;
  }

  return state;
}

/**
 * State ke specific fields update karta hai + activity timer refresh karta hai
 */
function updateState(guildId, userId, updates) {
  const key = `${guildId}-${userId}`;
  const state = states.get(key);

  if (!state) {
    logger.warn(`Cannot update — state not found`, { guildId, userId });
    return null;
  }

  Object.assign(state, updates, { lastActivityAt: Date.now() });
  return state;
}

/**
 * State delete karta hai (verification complete hone pe)
 */
function clearState(guildId, userId) {
  const key = `${guildId}-${userId}`;
  states.delete(key);
}

/**
 * Kisi user ki state dhundhta hai sirf userId se (guildId bina)
 * Yeh DM interactions ke liye zaroori hai (DMs mein guildId nahi hota)
 * Note: Agar user 2 servers mein ek saath verify kar raha ho (unlikely), first match return hoga
 */
function findStateByUserId(userId) {
  for (const [key, state] of states.entries()) {
    if (state.userId === userId) return state;
  }
  return null;
}

// ---- Auto-cleanup every 10 minutes ----
// Memory leak rokne ke liye expired states remove karta hai
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, state] of states.entries()) {
    const ageMinutes = (now - state.lastActivityAt) / 1000 / 60;
    if (ageMinutes > TIMEOUT_MINUTES) {
      states.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug(`State cleanup: removed ${cleaned} expired sessions`);
  }
}, 10 * 60 * 1000);

module.exports = { STEPS, initState, getState, updateState, clearState, findStateByUserId };

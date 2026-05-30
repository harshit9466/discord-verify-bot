// ============================================================
// STATE MANAGER — Verification flow state, DB-backed
//
// Bot restarts pe state ab survive karta hai — PostgreSQL mein
// persist hota hai, in-memory Map ki jagah.
//
// Saare functions async hain — callers ko await karna zaroori hai.
// ============================================================

const logger    = require('./logger');
const stateRepo = require('../db/stateRepository');

const STEPS = {
  NOT_STARTED: 'NOT_STARTED',
  RULES:       'RULES',
  ROLES:       'ROLES',
  CONTENT:     'CONTENT',
  INTRO:       'INTRO',
  EDIT_MENU:   'EDIT_MENU',
  PENDING:     'PENDING',
  VERIFIED:    'VERIFIED',
  REJECTED:    'REJECTED',
};

async function initState(guildId, userId) {
  const state = await stateRepo.initState(guildId, userId);
  logger.debug('Initialized verification state', { guildId, userId });
  return state;
}

async function getState(guildId, userId) {
  return stateRepo.getState(guildId, userId);
}

async function updateState(guildId, userId, updates) {
  return stateRepo.updateState(guildId, userId, updates);
}

async function clearState(guildId, userId) {
  return stateRepo.clearState(guildId, userId);
}

async function findStateByUserId(userId) {
  return stateRepo.findStateByUserId(userId);
}

// Cleanup expired sessions every 10 minutes
setInterval(async () => {
  try {
    const cleaned = await stateRepo.cleanupExpired();
    if (cleaned > 0) logger.debug(`State cleanup: removed ${cleaned} expired sessions`);
  } catch (err) {
    logger.error('State cleanup failed:', { error: err.message });
  }
}, 10 * 60 * 1000);

module.exports = { STEPS, initState, getState, updateState, clearState, findStateByUserId };

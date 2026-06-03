// ============================================================
// STATE MANAGER — Verification flow state, DB-backed
//
// Bot restarts pe state ab survive karta hai — PostgreSQL mein
// persist hota hai, in-memory Map ki jagah.
//
// Saare functions async hain — callers ko await karna zaroori hai.
// ============================================================

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

async function initState(guildId, userId)          { return stateRepo.initState(guildId, userId); }
async function getState(guildId, userId)           { return stateRepo.getState(guildId, userId); }
async function updateState(guildId, userId, updates) { return stateRepo.updateState(guildId, userId, updates); }
async function markApproved(guildId, userId)       { return stateRepo.markApproved(guildId, userId); }
async function markRejected(guildId, userId)       { return stateRepo.markRejected(guildId, userId); }
async function markLeft(guildId, userId)           { return stateRepo.markLeft(guildId, userId); }
async function findStateByUserId(userId)           { return stateRepo.findStateByUserId(userId); }

module.exports = { STEPS, initState, getState, updateState, markApproved, markRejected, markLeft, findStateByUserId };

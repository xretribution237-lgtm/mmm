// src/database/db.js
// =============================================
// CreativeMode Bot - Database Layer (SQLite)
// All economy, mod requests, tickets, and audit
// logs are handled here with prepared statements
// to prevent SQL injection.
// =============================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/creativemode.db';

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// =============================================
// SCHEMA INITIALIZATION
// =============================================
db.exec(`
  -- Players table: stores emerald balances and verification status
  CREATE TABLE IF NOT EXISTS players (
    user_id       TEXT PRIMARY KEY,
    username      TEXT NOT NULL,
    emeralds      INTEGER NOT NULL DEFAULT 0,
    verified      INTEGER NOT NULL DEFAULT 0,
    free_mod_used INTEGER NOT NULL DEFAULT 0,
    joined_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Mod requests: every mod request ever made
  CREATE TABLE IF NOT EXISTS mod_requests (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    mod_type      TEXT NOT NULL,
    emerald_cost  INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pending',
    is_free       INTEGER NOT NULL DEFAULT 0,
    assigned_to   TEXT,
    channel_id    TEXT,
    message_id    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES players(user_id)
  );

  -- Transactions: immutable ledger of all emerald movements
  CREATE TABLE IF NOT EXISTS transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL,
    amount        INTEGER NOT NULL,
    type          TEXT NOT NULL,
    reason        TEXT NOT NULL,
    ref_id        TEXT,
    performed_by  TEXT NOT NULL DEFAULT 'system',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tickets: support/request tickets
  CREATE TABLE IF NOT EXISTS tickets (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    subject       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at     TEXT,
    closed_by     TEXT
  );

  -- Backups: log of all /backup commands run
  CREATE TABLE IF NOT EXISTS backups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    performed_by  TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    note          TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Audit log: all sensitive admin actions
  CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    action        TEXT NOT NULL,
    performed_by  TEXT NOT NULL,
    target_user   TEXT,
    details       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// =============================================
// PLAYER OPERATIONS
// =============================================
const playerOps = {
  get: db.prepare('SELECT * FROM players WHERE user_id = ?'),

  create: db.prepare(`
    INSERT INTO players (user_id, username, emeralds, verified)
    VALUES (@user_id, @username, @emeralds, @verified)
  `),

  updateEmeralds: db.prepare(`
    UPDATE players SET emeralds = emeralds + @amount, updated_at = datetime('now')
    WHERE user_id = @user_id
  `),

  setVerified: db.prepare(`
    UPDATE players SET verified = 1, updated_at = datetime('now')
    WHERE user_id = ?
  `),

  markFreeModUsed: db.prepare(`
    UPDATE players SET free_mod_used = 1, updated_at = datetime('now')
    WHERE user_id = ?
  `),

  getLeaderboard: db.prepare(`
    SELECT user_id, username, emeralds FROM players
    WHERE verified = 1
    ORDER BY emeralds DESC LIMIT 10
  `),

  // Safe emerald deduction — will not go below 0, returns false if insufficient
  deductEmeralds(userId, amount) {
    const player = this.get.get(userId);
    if (!player || player.emeralds < amount) return false;
    this.updateEmeralds.run({ user_id: userId, amount: -amount });
    return true;
  },

  // Atomic verify + grant emeralds in one transaction
  verifyAndGrant: db.transaction((userId, username, grantAmount) => {
    let player = playerOps.get.get(userId);
    if (!player) {
      playerOps.create.run({ user_id: userId, username, emeralds: 0, verified: 0 });
    }
    player = playerOps.get.get(userId);
    if (player.verified) return { alreadyVerified: true, player };
    playerOps.setVerified.run(userId);
    playerOps.updateEmeralds.run({ user_id: userId, amount: grantAmount });
    transactionOps.log.run({
      user_id: userId,
      amount: grantAmount,
      type: 'grant',
      reason: 'verification_bonus',
      ref_id: null,
      performed_by: 'system'
    });
    return { alreadyVerified: false, player: playerOps.get.get(userId) };
  }),
};

// =============================================
// TRANSACTION OPERATIONS
// =============================================
const transactionOps = {
  log: db.prepare(`
    INSERT INTO transactions (user_id, amount, type, reason, ref_id, performed_by)
    VALUES (@user_id, @amount, @type, @reason, @ref_id, @performed_by)
  `),

  getHistory: db.prepare(`
    SELECT * FROM transactions WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 20
  `),
};

// =============================================
// MOD REQUEST OPERATIONS
// =============================================
const modOps = {
  create: db.prepare(`
    INSERT INTO mod_requests (id, user_id, title, description, mod_type, emerald_cost, is_free)
    VALUES (@id, @user_id, @title, @description, @mod_type, @emerald_cost, @is_free)
  `),

  get: db.prepare('SELECT * FROM mod_requests WHERE id = ?'),

  getByUser: db.prepare(`
    SELECT * FROM mod_requests WHERE user_id = ?
    ORDER BY created_at DESC
  `),

  getPending: db.prepare(`
    SELECT mr.*, p.username, p.emeralds as user_emeralds
    FROM mod_requests mr
    JOIN players p ON mr.user_id = p.user_id
    WHERE mr.status = 'pending'
    ORDER BY mr.created_at ASC
  `),

  updateStatus: db.prepare(`
    UPDATE mod_requests
    SET status = @status, assigned_to = @assigned_to, updated_at = datetime('now')
    WHERE id = @id
  `),

  setMessageId: db.prepare(`
    UPDATE mod_requests SET message_id = @message_id, channel_id = @channel_id
    WHERE id = @id
  `),

  // Atomic: deduct emeralds + create mod request
  submitRequest: db.transaction((userId, username, requestData, cost, isFree) => {
    const { v4: uuidv4 } = require('uuid');
    const player = playerOps.get.get(userId);
    if (!player) return { error: 'not_verified' };
    if (!isFree && player.emeralds < cost) return { error: 'insufficient_emeralds', have: player.emeralds, need: cost };
    if (isFree && player.free_mod_used) return { error: 'free_mod_used' };

    const id = uuidv4();
    modOps.create.run({ id, user_id: userId, ...requestData, emerald_cost: cost, is_free: isFree ? 1 : 0 });

    if (!isFree) {
      playerOps.updateEmeralds.run({ user_id: userId, amount: -cost });
      transactionOps.log.run({
        user_id: userId, amount: -cost, type: 'spend',
        reason: `mod_request:${id}`, ref_id: id, performed_by: userId
      });
    } else {
      playerOps.markFreeModUsed.run(userId);
    }

    return { success: true, requestId: id };
  }),
};

// =============================================
// TICKET OPERATIONS
// =============================================
const ticketOps = {
  create: db.prepare(`
    INSERT INTO tickets (id, user_id, channel_id, subject)
    VALUES (@id, @user_id, @channel_id, @subject)
  `),

  getByChannel: db.prepare('SELECT * FROM tickets WHERE channel_id = ?'),

  getByUser: db.prepare(`
    SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
  `),

  close: db.prepare(`
    UPDATE tickets SET status = 'closed', closed_at = datetime('now'), closed_by = @closed_by
    WHERE channel_id = @channel_id
  `),

  getOpenCount: db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE user_id = ? AND status = 'open'`),
};

// =============================================
// AUDIT LOG OPERATIONS
// =============================================
const auditOps = {
  log: db.prepare(`
    INSERT INTO audit_log (action, performed_by, target_user, details)
    VALUES (@action, @performed_by, @target_user, @details)
  `),

  getRecent: db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50`),
};

// =============================================
// BACKUP OPERATIONS
// =============================================
const backupOps = {
  log: db.prepare(`
    INSERT INTO backups (performed_by, file_path, note)
    VALUES (@performed_by, @file_path, @note)
  `),
};

module.exports = { db, playerOps, transactionOps, modOps, ticketOps, auditOps, backupOps };

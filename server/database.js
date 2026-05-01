import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'orion.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize database schema
export function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT,
      picture TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Chat sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      personality TEXT DEFAULT 'formal',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sessionId) REFERENCES chat_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // API keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      isActive INTEGER DEFAULT 1,
      lastUsed DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database initialized');
}

// User operations
export const userDb = {
  create: (id, email, name, password, picture) => {
    const stmt = db.prepare(`
      INSERT INTO users (id, email, name, password, picture)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, email, name, password, picture);
    return userDb.findById(id);
  },

  findById: (id) => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  },

  findByEmail: (email) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  },

  update: (id, data) => {
    const set = Object.keys(data)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.values(data);
    const stmt = db.prepare(`
      UPDATE users 
      SET ${set}, updatedAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(...values, id);
    return userDb.findById(id);
  }
};

// Chat session operations
export const sessionDb = {
  create: (id, userId, title) => {
    const stmt = db.prepare(`
      INSERT INTO chat_sessions (id, userId, title)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, userId, title || null);
    return sessionDb.findById(id);
  },

  findById: (id) => {
    const stmt = db.prepare('SELECT * FROM chat_sessions WHERE id = ?');
    return stmt.get(id);
  },

  findByUserId: (userId) => {
    const stmt = db.prepare(`
      SELECT * FROM chat_sessions 
      WHERE userId = ? 
      ORDER BY updatedAt DESC
    `);
    return stmt.all(userId);
  },

  update: (id, data) => {
    const set = Object.keys(data)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.values(data);
    const stmt = db.prepare(`
      UPDATE chat_sessions 
      SET ${set}, updatedAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(...values, id);
    return sessionDb.findById(id);
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM chat_sessions WHERE id = ?');
    stmt.run(id);
  }
};

// Chat message operations
export const messageDb = {
  create: (id, sessionId, userId, role, content, personality) => {
    const stmt = db.prepare(`
      INSERT INTO chat_messages (id, sessionId, userId, role, content, personality)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, sessionId, userId, role, content, personality || 'formal');
    return messageDb.findById(id);
  },

  findById: (id) => {
    const stmt = db.prepare('SELECT * FROM chat_messages WHERE id = ?');
    return stmt.get(id);
  },

  findBySessionId: (sessionId) => {
    const stmt = db.prepare(`
      SELECT * FROM chat_messages 
      WHERE sessionId = ? 
      ORDER BY createdAt ASC
    `);
    return stmt.all(sessionId);
  },

  deleteBySessionId: (sessionId) => {
    const stmt = db.prepare('DELETE FROM chat_messages WHERE sessionId = ?');
    stmt.run(sessionId);
  }
};

// API key operations
export const apiKeyDb = {
  create: (id, userId, name, key) => {
    const stmt = db.prepare(`
      INSERT INTO api_keys (id, userId, name, key, isActive)
      VALUES (?, ?, ?, ?, 1)
    `);
    stmt.run(id, userId, name, key);
    return apiKeyDb.findById(id);
  },

  findById: (id) => {
    const stmt = db.prepare('SELECT * FROM api_keys WHERE id = ?');
    return stmt.get(id);
  },

  findByUserId: (userId) => {
    const stmt = db.prepare(`
      SELECT id, userId, name, key, isActive, lastUsed, createdAt, updatedAt
      FROM api_keys 
      WHERE userId = ? 
      ORDER BY createdAt DESC
    `);
    return stmt.all(userId);
  },

  findByKey: (key) => {
    const stmt = db.prepare('SELECT * FROM api_keys WHERE key = ?');
    return stmt.get(key);
  },

  update: (id, data) => {
    const set = Object.keys(data)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.values(data);
    const stmt = db.prepare(`
      UPDATE api_keys 
      SET ${set}, updatedAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(...values, id);
    return apiKeyDb.findById(id);
  },

  updateLastUsed: (id) => {
    const stmt = db.prepare(`
      UPDATE api_keys 
      SET lastUsed = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(id);
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM api_keys WHERE id = ?');
    stmt.run(id);
  },

  deleteByUserId: (userId) => {
    const stmt = db.prepare('DELETE FROM api_keys WHERE userId = ?');
    stmt.run(userId);
  }
};

export default db;

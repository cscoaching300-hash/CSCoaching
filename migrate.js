// migrate.js — creates tables and adds any missing columns safely
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function ensureColumn(table, column, def) {
  const rows = await all(`PRAGMA table_info(${table})`);
  const has = rows.some(r => r.name === column);
  if (!has) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    console.log(`Added ${table}.${column}`);
  }
}

(async () => {
  try {
    // Base tables (idempotent)
    await run(`CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_iso TEXT NOT NULL,
      end_iso   TEXT NOT NULL,
      is_booked INTEGER DEFAULT 0,
      location  TEXT
    )`);

    await run(`CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL,
      email   TEXT UNIQUE NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await run(`CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id   INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      notes     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(slot_id) REFERENCES slots(id),
      FOREIGN KEY(member_id) REFERENCES members(id)
    )`);

    // Add new columns if they don't exist (safe on existing DBs)
    await ensureColumn('members',  'password_hash',  'TEXT');
    await ensureColumn('members',  'invite_token',   'TEXT');
    await ensureColumn('members',  'invite_expires', 'TEXT');

    await ensureColumn('bookings', 'cancelled_by',   'TEXT');            // 'member' | 'admin'
    await ensureColumn('bookings', 'cancelled_at',   'TEXT');
    await ensureColumn('bookings', 'refunded',       'INTEGER DEFAULT 0');

    // Helpful indexes
    await run(`CREATE INDEX IF NOT EXISTS idx_slots_start ON slots(start_iso)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id)`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email ON members(email)`);

    console.log('✅ Migration complete.');
  } catch (e) {
    console.error('Migration error:', e.message);
  } finally {
    db.close();
  }
})();

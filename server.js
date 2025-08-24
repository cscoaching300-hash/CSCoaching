// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
app.set('trust proxy', 1); // secure cookies behind Render/HTTPS

/* ---------- Config ---------- */
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

/* ---------- Database: Turso in production; sqlite locally ---------- */
const useTurso = !!process.env.TURSO_DATABASE_URL;

let db; // adapter exposing sqlite-like callbacks: run/get/all/serialize
let DATA_DIR;

if (useTurso) {
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  db = {
    run(sql, params = [], cb = () => {}) {
      client.execute({ sql, args: params })
        .then(res => cb(null, {
          lastID: Number(res.lastInsertRowid || 0),
          changes: res.rowsAffected || 0
        }))
        .catch(err => cb(err));
    },
    get(sql, params = [], cb = () => {}) {
      client.execute({ sql, args: params })
        .then(res => cb(null, res.rows?.[0] || null))
        .catch(err => cb(err));
    },
    all(sql, params = [], cb = () => {}) {
      client.execute({ sql, args: params })
        .then(res => cb(null, res.rows || []))
        .catch(err => cb(err));
    },
    serialize(fn) { fn(); }
  };
} else {
  // Local dev only
  const sqlite3 = require('sqlite3').verbose();
  DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new sqlite3.Database(path.join(DATA_DIR, 'app.sqlite'));
  db = sqlite;
}

/* ---------- Security & middleware ---------- */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "img-src": ["'self'", "data:"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"],
      "font-src": ["'self'", "https:", "data:"]
    }
  }
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------- Sessions ---------- */
let sessionStore = new session.MemoryStore(); // Render free = memory only
app.use(session({
  name: 'csc_sid',
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.RENDER, // secure cookies on Render
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}));

/* ---------- Table bootstrapping (idempotent) ---------- */
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    credits INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_iso TEXT NOT NULL,
    end_iso TEXT NOT NULL,
    is_booked INTEGER DEFAULT 0,
    location TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    slot_id INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    cancelled_at TEXT,
    refunded INTEGER DEFAULT 0
  )`);
});

/* ---------- Email ---------- */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

function customerHtml({ name, email, start_iso, end_iso, location, credits, hero }) {
  const s = new Date(start_iso), e = new Date(end_iso);
  const when = `${s.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#000;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#0f0f0f;border:1px solid #1a1a1a;border-radius:12px;color:#fff;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center" style="padding:20px 16px 8px;">${hero ? `<img src="cid:heroimg" alt="CSCoaching" width="600" style="display:block;width:100%;height:auto;border-radius:10px;border:0;outline:none;">` : `<div style="font-size:24px;font-weight:700;letter-spacing:.5px;">CSCoaching</div>`}</td></tr><tr><td style="height:1px;background:#1a1a1a;"></td></tr><tr><td style="padding:18px;font-size:16px;line-height:1.5;"><p style="margin:0 0 10px;">Hi <strong>${name || email}</strong>,</p><p style="margin:0 0 14px;">Your coaching session is <span style="color:#31c553">confirmed</span> ✅</p><table role="presentation" width="100%" style="background:#0b0b0b;border:1px solid #1a1a1a;border-radius:10px;"><tr><td style="padding:12px 14px 0;font-size:14px;color:#d0d0d0;">When</td></tr><tr><td style="padding:0 14px 10px;font-size:16px;color:#fff;"><strong>${when}</strong></td></tr><tr><td style="padding:0 14px 0;font-size:14px;color:#d0d0d0;">Location</td></tr><tr><td style="padding:0 14px 12px;font-size:16px;color:#fff;"><strong>${location || 'CSCoaching'}</strong></td></tr><tr><td style="padding:0 14px 14px;font-size:14px;color:#fff;"><span style="display:inline-block;background:#121212;border:1px solid #1a1a1a;border-radius:8px;padding:6px 10px;">Remaining session credits: <strong style="color:#e02424;">${typeof credits === 'number' ? credits : '—'}</strong></span></td></tr></table><p style="margin:12px 0 0;color:#b5b5b5;font-size:12px;">Need to reschedule? Reply to this email.</p><p style="margin:6px 0 0;color:#b5b5b5;font-size:12px;">© CSCoaching • All rights reserved</p></td></tr></table></td></tr></table></body></html>`;
}
async function sendCustomerEmail({ to, name, email, start_iso, end_iso, location, credits }) {
  const heroPath = fs.existsSync(path.join(__dirname, 'public', 'logo.png')) ? path.join(__dirname, 'public', 'logo.png') : null;
  await transporter.sendMail({
    from: `"CSCoaching" <${process.env.SMTP_USER}>`,
    to, subject: '🎳 CSCoaching — Your session is confirmed',
    html: customerHtml({ name, email, start_iso, end_iso, location, credits, hero: !!heroPath }),
    attachments: heroPath ? [{ filename: 'logo.png', path: heroPath, cid: 'heroimg' }] : []
  });
}
async function sendAdminEmail({ start_iso, end_iso, location, name, email }) {
  const s = new Date(start_iso), e = new Date(end_iso);
  await transporter.sendMail({
    from: `"CSCoaching" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
    subject: '📩 New CSCoaching booking',
    text: `New booking\n\nName: ${name || email}\nEmail: ${email}\nWhen: ${s} – ${e}\nLocation: ${location || ''}`
  });
}
async function sendActivationEmail({ to, name, token }) {
  const link = `${APP_BASE_URL}/activate.html?token=${encodeURIComponent(token)}`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#0f0f0f;color:#fff;padding:24px"><div style="max-width:560px;margin:0 auto;background:#101215;border:1px solid #1a1a1a;border-radius:12px;padding:20px"><h2 style="margin:0 0 12px">Welcome to CSCoaching</h2><p style="color:#cfcfcf">Hi ${name || to}, click below to set your password:</p><p style="margin:16px 0"><a href="${link}" style="background:#e02424;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block">Activate your account</a></p><p style="color:#9a9a9a;font-size:12px">Or paste this link:<br>${link}</p></div></body></html>`;
  await transporter.sendMail({ from: `"CSCoaching" <${process.env.SMTP_USER}>`, to, subject: 'Activate your CSCoaching account', html });
}

/* ---------- Helpers ---------- */
function requireAdmin(req, res, next) {
  const k = req.header('X-ADMIN-KEY');
  if (!k || k !== ADMIN_KEY) return res.status(401).json({ error: 'ADMIN_ONLY' });
  next();
}
function requireMember(req, res, next) {
  if (req.session && req.session.member) return next();
  return res.status(401).json({ error: 'UNAUTHORIZED' });
}

// promise wrappers
const pRun = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
);
const pGet = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
);
const pAll = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
);

/* ---------- Slot filter & API ---------- */
function withinCoachingWindow(slot) {
  const norm = s => (s || '').trim().toLowerCase();
  const inRange = (h, a, b) => h >= a && h < b;
  const d = new Date(slot.start_iso), dow = d.getDay(), h = d.getHours(), loc = norm(slot.location);
  if (dow === 1 && inRange(h, 17, 21)) return !loc || loc.includes('scunthorpe');
  if (dow === 2 && inRange(h, 17, 22)) return !loc || loc.includes('hull');
  if (dow === 3 && inRange(h, 18, 22)) return !loc || loc.includes('shipley');
  if (dow === 4 && inRange(h, 17, 22)) return !loc || loc.includes('hull');
  return false;
}

// Explicit routes so they don’t fall back to index.html
app.get('/book.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'book.html'))
);

app.get('/login.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'login.html'))
);

app.get('/dashboard.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);

// logout route (calls API then redirects)
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});


app.get('/api/slots', async (req, res) => {
  try {
    const onlyAvailable = String(req.query.onlyAvailable || '').toLowerCase() === 'true';
    const debug = (req.query.debug || '').toString().toLowerCase();
    const now = new Date();
    const startReq = req.query.from ? new Date(req.query.from + 'T00:00:00Z') : now;
    const hardEnd = new Date(now); hardEnd.setDate(hardEnd.getDate() + 14);
    const endReq = req.query.to ? new Date(req.query.to + 'T23:59:59Z') : hardEnd;
    const end = endReq < hardEnd ? endReq : hardEnd;

    let where = `WHERE start_iso>=? AND start_iso<?`;
    const params = [startReq.toISOString(), end.toISOString()];
    if (onlyAvailable) where += ` AND is_booked=0`;

    const rows = await pAll(`SELECT id,start_iso,end_iso,is_booked,location FROM slots ${where} ORDER BY start_iso ASC`, params);
    let filtered = (debug === 'bypass') ? rows : rows.filter(withinCoachingWindow);
    if (filtered.length === 0 && rows.length > 0 && debug !== 'bypass') filtered = rows;

    if (debug) return res.json({ ok: true, debug: { window: { from: params[0], to: params[1] }, onlyAvailable, totalRows: rows.length, afterFilter: filtered.length }, slots: filtered });
    res.json({ ok: true, slots: filtered });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

/* ---------- Booking (no login needed) ---------- */
app.post('/api/book', async (req, res) => {
  try {
    const { slot_id, email, notes } = req.body || {};
    if (!slot_id || !email) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const slot = await pGet(`SELECT * FROM slots WHERE id=?`, [slot_id]);
    if (!slot) return res.status(404).json({ error: 'SLOT_NOT_FOUND' });
    if (slot.is_booked) return res.status(400).json({ error: 'SLOT_ALREADY_BOOKED' });

    let member = await pGet(`SELECT * FROM members WHERE lower(email)=lower(?)`, [email]);
    if (!member) {
      const ins = await pRun(`INSERT INTO members (name,email,credits) VALUES (?,?,?)`, [null, email, 0]);
      member = await pGet(`SELECT * FROM members WHERE id=?`, [ins.lastID]);
    }

    const insBk = await pRun(`INSERT INTO bookings (member_id,slot_id,notes) VALUES (?,?,?)`, [member.id, slot.id, notes || null]);
    await pRun(`UPDATE slots SET is_booked=1 WHERE id=?`, [slot.id]);

    let remaining = member.credits;
    if (remaining > 0) {
      await pRun(`UPDATE members SET credits=credits-1 WHERE id=? AND credits>0`, [member.id]);
      remaining = (await pGet(`SELECT credits FROM members WHERE id=?`, [member.id])).credits;
    }

    sendAdminEmail({ start_iso: slot.start_iso, end_iso: slot.end_iso, location: slot.location, name: member.name, email }).catch(console.error);
    sendCustomerEmail({ to: email, name: member.name, email, start_iso: slot.start_iso, end_iso: slot.end_iso, location: slot.location, credits: remaining }).catch(console.error);

    res.json({ ok: true, booking_id: insBk.lastID, credits: remaining });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

/* ---------- Auth & member APIs ---------- */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });
  try {
    const m = await pGet(`SELECT * FROM members WHERE lower(email)=lower(?)`, [email]);
    if (!m || !m.password_hash || !bcrypt.compareSync(password, m.password_hash))
      return res.status(401).json({ error: 'INVALID_LOGIN' });
    req.session.member = { id: m.id, name: m.name, email: m.email };
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
// Handle logout from nav link
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('csc_sid');
    res.redirect('/login.html'); // send them back to login
  });
});
app.get('/api/me', requireMember, async (req, res) => {
  try {
    const m = await pGet(`SELECT id,name,email,credits FROM members WHERE id=?`, [req.session.member.id]);
    if (!m) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ ok: true, member: m });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});
app.get('/api/auth/check-invite', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'MISSING_TOKEN' });
  try {
    const row = await pGet(
      `SELECT invites.*, members.name, members.email
       FROM invites JOIN members ON invites.member_id=members.id
       WHERE invites.id=? AND invites.used=0 AND datetime(expires_at)>datetime('now')`,
      [token]
    );
    if (!row) return res.status(400).json({ error: 'INVALID_OR_EXPIRED' });
    res.json({ ok: true, name: row.name, email: row.email });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});
app.post('/api/auth/set-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });
  try {
    const inv = await pGet(`SELECT * FROM invites WHERE id=? AND used=0 AND datetime(expires_at)>datetime('now')`, [token]);
    if (!inv) return res.status(400).json({ error: 'INVALID_OR_EXPIRED' });
    const hash = bcrypt.hashSync(password, 10);
    await pRun(`UPDATE members SET password_hash=? WHERE id=?`, [hash, inv.member_id]);
    await pRun(`UPDATE invites SET used=1 WHERE id=?`, [token]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});
app.get('/api/member/bookings', requireMember, async (req, res) => {
  try {
    const rows = await pAll(
      `SELECT b.id AS booking_id, b.cancelled_at, b.refunded,
  s.id AS slot_id, s.start_iso, s.end_iso, s.location
       FROM bookings b JOIN slots s ON b.slot_id=s.id
       WHERE b.member_id=?
       ORDER BY s.start_iso DESC`,
      [req.session.member.id]
    );
    res.json({ ok: true, bookings: rows });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});

/* ---------- Admin APIs ---------- */
/* ========== ADMIN: BOOKINGS LIST (future, exclude cancelled) ========== */
app.get('/api/admin/bookings', requireAdmin, async (_req, res) => {
  try {
    const nowIso = new Date().toISOString();
    const rows = await pAll(
      `SELECT
          b.id        AS booking_id,
          b.member_id,
          b.slot_id,
          b.cancelled_at,
          b.refunded,
          s.start_iso,
          s.end_iso,
          s.location,
          m.name      AS member_name,
          m.email     AS member_email
       FROM bookings b
       JOIN slots   s ON b.slot_id   = s.id
       JOIN members m ON b.member_id = m.id
       WHERE s.start_iso > ?
         AND b.cancelled_at IS NULL
       ORDER BY s.start_iso ASC`,
      [nowIso]
    );
    res.json({ ok: true, bookings: rows });
  } catch (e) {
    console.error('GET /api/admin/bookings error:', e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});
// List members (for the admin table)
app.get('/api/admin/members', requireAdmin, async (_req, res) => {
  try {
    const rows = await pAll(
      `SELECT id, name, email, credits
         FROM members
        ORDER BY created_at DESC`,
      []
    );
    res.json({ ok: true, members: rows });
  } catch (e) {
    console.error('GET /api/admin/members error:', e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});


app.post('/api/admin/members', requireAdmin, async (req, res) => {
  try {
    // ---- sanitize inputs to primitives ----
    const rawName   = req.body?.name;
    const rawEmail  = req.body?.email;
    const rawCreds  = req.body?.credits;

    if (!rawEmail) return res.status(400).json({ error: 'MISSING_EMAIL' });

    const name   = (rawName === undefined || rawName === null || rawName === '') ? null : String(rawName);
    const email  = String(rawEmail).trim();
    const creditsNum = Number.isFinite(Number(rawCreds)) ? Number(rawCreds) : 0;

    // ---- see if member exists ----
    const existing = await pGet(
      `SELECT id, name, email, credits
         FROM members
        WHERE lower(email) = lower(?)`,
      [email]
    );

    // helper to create (or reissue) an invite safely
    async function issueInvite(memberId, inviteName) {
      const token = uuidv4();
      const expiresISO = new Date(Date.now() + 7*24*60*60*1000).toISOString(); // +7 days, as ISO string
      // bind all four values explicitly as primitives
      await pRun(
        `INSERT INTO invites (id, member_id, expires_at, used)
               VALUES (?, ?, ?, ?)`,
        [String(token), Number(memberId), String(expiresISO), 0] // <- 0 as number, not boolean
      );
      sendActivationEmail({ to: email, name: inviteName, token }).catch(console.error);
      return token;
    }

    if (existing) {
      // update only the fields provided; keep params primitive/null
      await pRun(
        `UPDATE members
            SET name    = COALESCE(?, name),
                credits = COALESCE(?, credits)
          WHERE id = ?`,
        [name, Number.isFinite(creditsNum) ? creditsNum : null, Number(existing.id)]
      );

      const token = await issueInvite(existing.id, name || existing.name);
      return res.json({ ok: true, member_id: existing.id, invite: token, existed: true });
    }

    // create new member
    const ins = await pRun(
      `INSERT INTO members (name, email, credits)
            VALUES (?, ?, ?)`,
      [name, email, creditsNum]
    );
    const memberId = Number(ins.lastID);

    const token = await issueInvite(memberId, name);
    return res.json({ ok: true, member_id: memberId, invite: token, existed: false });

  } catch (e) {
    // make duplicate email explicit if it ever slips to here
    if ((e.message || '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS' });
    }
    console.error(e);
    return res.status(500).json({ error: 'DB_ERROR' });
  }
});


/* >>> FIXED: Coerce credits safely to avoid 500s on Turso <<< */
app.patch('/api/admin/members/:id', requireAdmin, async (req, res) => {
  let { credits, name } = req.body || {};
  try {
    credits = (credits !== undefined && credits !== null && credits !== '') ? Number(credits) : null;
    await pRun(
      `UPDATE members
       SET credits = COALESCE(?, credits),
           name    = COALESCE(?, name)
       WHERE id = ?`,
      [credits, name || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/admin/members error:", e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

app.delete('/api/admin/members/:id', requireAdmin, async (req, res) => {
  try {
    await pRun(`DELETE FROM members WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});

app.get('/api/admin/slots', requireAdmin, async (_req, res) => {
  try {
    const rows = await pAll(`SELECT * FROM slots ORDER BY start_iso DESC`, []);
    res.json({ ok: true, slots: rows });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});
app.post('/api/admin/slots', requireAdmin, async (req, res) => {
  const { start_iso, location } = req.body || {};
  if (!start_iso) return res.status(400).json({ error: 'MISSING_START' });
  try {
    const start = new Date(start_iso), end = new Date(start.getTime() + 60 * 60 * 1000);
    const ins = await pRun(`INSERT INTO slots (start_iso,end_iso,location) VALUES (?,?,?)`, [start.toISOString(), end.toISOString(), location || null]);
    res.json({ ok: true, id: ins.lastID });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});
app.delete('/api/admin/slots/:id', requireAdmin, async (req, res) => {
  try {
    await pRun(`DELETE FROM slots WHERE id=? AND is_booked=0`, [req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});

/* ========== ADMIN: BOOKINGS LIST (future) ========== */
app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  try {
    const rows = await pAll(
      `SELECT b.id AS booking_id, b.cancelled_at, b.refunded,
	s.id AS slot_id, s.start_iso, s.end_iso, s.location
              m.name AS member_name, m.email AS member_email
       FROM bookings b
       JOIN slots s  ON b.slot_id = s.id
       JOIN members m ON b.member_id = m.id
       WHERE datetime(s.start_iso) > datetime('now')
 	AND b.cancelled_at IS NULL
AND datetime(s.start_iso) > datetime('now')
ORDER BY s.start_iso ASC`,

      []
    );
    res.json({ ok: true, bookings: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

/* ========== ADMIN: MOVE A BOOKING ========== */
app.patch('/api/admin/bookings/:id/move', requireAdmin, async (req, res) => {
  const bid = Number(req.params.id);
  const { new_slot_id } = req.body || {};
  if (!bid || !new_slot_id) return res.status(400).json({ error: 'MISSING_FIELDS' });

  try {
    // current booking & slot
    const b = await pGet(
      `SELECT b.id, b.slot_id, b.member_id, s.start_iso
       FROM bookings b JOIN slots s ON b.slot_id = s.id
       WHERE b.id = ?`,
      [bid]
    );
    if (!b) return res.status(404).json({ error: 'NOT_FOUND' });

    const tgt = await pGet(`SELECT id, is_booked FROM slots WHERE id = ?`, [new_slot_id]);
    if (!tgt || tgt.is_booked) return res.status(400).json({ error: 'TARGET_TAKEN' });

    // free old slot, occupy new, update booking
    await pRun(`UPDATE slots SET is_booked = 0 WHERE id = ?`, [b.slot_id]);
    await pRun(`UPDATE slots SET is_booked = 1 WHERE id = ?`, [new_slot_id]);
    await pRun(`UPDATE bookings SET slot_id = ? WHERE id = ?`, [new_slot_id, bid]);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

/* ========== ADMIN: CANCEL A BOOKING (optional refund) ========== */
app.post('/api/admin/bookings/:id/cancel', requireAdmin, async (req, res) => {
  const bid = Number(req.params.id);
  const refund = String(req.query.refund || 'true').toLowerCase() === 'true';
  try {
    const row = await pGet(
      `SELECT b.*, s.start_iso
       FROM bookings b JOIN slots s ON b.slot_id = s.id
       WHERE b.id = ?`,
      [bid]
    );
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (row.cancelled_at) return res.status(400).json({ error: 'ALREADY_CANCELLED' });

    await pRun(`UPDATE bookings SET cancelled_at = datetime('now'), refunded = ? WHERE id = ?`, [refund ? 1 : 0, bid]);
    await pRun(`UPDATE slots SET is_booked = 0 WHERE id = ?`, [row.slot_id]);
    if (refund) await pRun(`UPDATE members SET credits = credits + 1 WHERE id = ?`, [row.member_id]);

    res.json({ ok: true, refunded: refund });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

/* ========== ADMIN: MAINTAIN SLOTS (Mon–Thu windows) ========== */
app.post('/api/admin/maintain-slots', requireAdmin, async (req, res) => {
  const days = Math.max(1, Math.min(31, Number(req.query.days || 14)));

  // business rules — same as your front-end filter
  function hoursForDay(dow) {
    if (dow === 1) return [17,18,19,20];        // Mon Scunthorpe
    if (dow === 2) return [17,18,19,20,21];     // Tue Hull
    if (dow === 3) return [18,19,20,21];        // Wed Shipley
    if (dow === 4) return [17,18,19,20,21];     // Thu Hull
    return [];
  }
  function defaultLocation(dow) {
    if (dow === 1) return 'Scunthorpe';
    if (dow === 2) return 'Hull';
    if (dow === 3) return 'Shipley';
    if (dow === 4) return 'Hull';
    return null;
  }

  try {
    // Purge past empty slots
    const delRes = await pRun(
      `DELETE FROM slots
       WHERE is_booked = 0 AND datetime(end_iso) < datetime('now')`,
      []
    );
    let purged = delRes.changes || 0;

    // Create forward slots
    let created = 0;
    const base = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dow = d.getDay();

      const hours = hoursForDay(dow);
      const loc = defaultLocation(dow);
      for (const h of hours) {
        const start = new Date(d); start.setHours(h,0,0,0);
        const end   = new Date(start.getTime() + 60*60*1000);

        // Only insert if not exists already (same start)
        const exists = await pGet(`SELECT id FROM slots WHERE start_iso = ?`, [start.toISOString()]);
        if (!exists) {
          await pRun(
            `INSERT INTO slots (start_iso, end_iso, location, is_booked) VALUES (?,?,?,0)`,
            [start.toISOString(), end.toISOString(), loc]
          );
          created++;
        }
      }
    }
    res.json({ ok: true, purged, created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});
/* -------- Member: Cancel their own booking (refund only if >24h) -------- */
app.post('/api/member/bookings/:id/cancel', requireMember, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum)) return res.status(400).json({ error: 'BAD_ID' });

  try {
    // 1) Try by booking id (expected)
    let row = await pGet(
      `SELECT b.id, b.member_id, b.slot_id, b.cancelled_at, s.start_iso
         FROM bookings b
         JOIN slots s ON b.slot_id = s.id
        WHERE b.id = ? AND b.member_id = ?`,
      [idNum, req.session.member.id]
    );

    // 2) Fallback: if not found, try treating :id as slot_id (robustness)
    if (!row) {
      row = await pGet(
        `SELECT b.id, b.member_id, b.slot_id, b.cancelled_at, s.start_iso
           FROM bookings b
           JOIN slots s ON b.slot_id = s.id
          WHERE b.slot_id = ? AND b.member_id = ?`,
        [idNum, req.session.member.id]
      );
    }

    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (row.cancelled_at) return res.status(400).json({ error: 'ALREADY_CANCELLED' });

    const startMs = new Date(row.start_iso).getTime();
    const refunded = Date.now() < (startMs - 24 * 60 * 60 * 1000) ? 1 : 0;

    await pRun(`UPDATE bookings SET cancelled_at = datetime('now'), refunded = ? WHERE id = ?`, [refunded, row.id]);
    await pRun(`UPDATE slots SET is_booked = 0 WHERE id = ?`, [row.slot_id]);
    if (refunded) await pRun(`UPDATE members SET credits = credits + 1 WHERE id = ?`, [row.member_id]);

    return res.json({ ok: true, refunded: !!refunded });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'DB_ERROR' });
  }
});

// Return JSON 404 for any unknown /api/* route/method
app.all('/api/*', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

/* ---------- Easy Logout via link ---------- */
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    // also clear cookie to be neat
    res.clearCookie('csc_sid', {
      sameSite: 'lax',
      secure: !!process.env.RENDER,
      httpOnly: true
    });
    res.redirect('/');
  });
});
// Lightweight, no-error auth check
app.get('/api/auth/status', async (req, res) => {
  if (req.session && req.session.member) {
    const m = await pGet(
      `SELECT id,name,email,credits FROM members WHERE id=?`,
      [req.session.member.id]
    ).catch(() => null);
    return res.json({ ok: true, authed: true, member: m || null });
  }
  return res.json({ ok: true, authed: false });
});


/* ---------- Static ---------- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));



/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`Server running on ${APP_BASE_URL} (turso=${useTurso})`);
});


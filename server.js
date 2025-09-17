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
let db;                // sqlite-like adapter
let DATA_DIR;
let tursoClient = null; // NEW: raw libsql client for transactions


if (useTurso) {
  const { createClient } = require('@libsql/client');

  // Keep a reference to the raw client for transactions
  tursoClient = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // sqlite-like adapter for run/get/all
  db = {
    run(sql, params = [], cb = () => {}) {
      tursoClient.execute({ sql, args: params })
        .then(res => cb(null, {
          lastID: Number(res.lastInsertRowid || 0),
          changes: res.rowsAffected || 0
        }))
        .catch(err => cb(err));
    },
    get(sql, params = [], cb = () => {}) {
      tursoClient.execute({ sql, args: params })
        .then(res => cb(null, res.rows?.[0] || null))
        .catch(err => cb(err));
    },
    all(sql, params = [], cb = () => {}) {
      tursoClient.execute({ sql, args: params })
        .then(res => cb(null, res.rows || []))
        .catch(err => cb(err));
    },
    serialize(fn) { fn(); }
  };
} else {
  // ... keep your local sqlite block as-is
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
  db.run(`CREATE TABLE IF NOT EXISTS members (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS invites (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS slots   (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS bookings(...)`);
  db.run(`CREATE TABLE IF NOT EXISTS holidays (
    day  TEXT PRIMARY KEY,   -- 'YYYY-MM-DD' in Europe/London
    note TEXT
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
  const when = whenLondon(start_iso, end_iso, true); // shows BST/GMT
  return `<!doctype html><html><body style="margin:0;padding:0;background:#000;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#0f0f0f;border:1px solid #1a1a1a;border-radius:12px;color:#fff;font-family:Arial,Helvetica,sans-serif;">
        <tr>
          <td align="center" style="padding:20px 16px 8px;">
            ${hero
              ? `<img src="cid:heroimg" alt="CSCoaching" width="600" style="display:block;width:100%;height:auto;border-radius:10px;border:0;outline:none;">`
              : `<div style="font-size:24px;font-weight:700;letter-spacing:.5px;">CSCoaching</div>`}
          </td>
        </tr>
        <tr><td style="height:1px;background:#1a1a1a;"></td></tr>
        <tr>
          <td style="padding:18px;font-size:16px;line-height:1.5;">
            <p style="margin:0 0 10px;">Hi <strong>${name || email}</strong>,</p>
            <p style="margin:0 0 14px;">Your coaching session is <span style="color:#31c553">confirmed</span> ✅</p>
            <table role="presentation" width="100%" style="background:#0b0b0b;border:1px solid #1a1a1a;border-radius:10px;">
              <tr><td style="padding:12px 14px 0;font-size:14px;color:#d0d0d0;">When</td></tr>
              <tr><td style="padding:0 14px 10px;font-size:16px;color:#fff;"><strong>${when}</strong></td></tr>
              <tr><td style="padding:0 14px 0;font-size:14px;color:#d0d0d0;">Location</td></tr>
              <tr><td style="padding:0 14px 12px;font-size:16px;color:#fff;"><strong>${location || 'CSCoaching'}</strong></td></tr>
              <tr>
                <td style="padding:0 14px 14px;font-size:14px;color:#fff;">
                  <span style="display:inline-block;background:#121212;border:1px solid #1a1a1a;border-radius:8px;padding:6px 10px;">
                    Remaining session credits: <strong style="color:#e02424;">${Number.isFinite(credits) ? credits : '—'}</strong>
                  </span>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;color:#b5b5b5;font-size:12px;">Need to reschedule? Reply to this email.</p>
            <p style="margin:6px 0 0;color:#b5b5b5;font-size:12px;">© CSCoaching • All rights reserved</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body></html>`;
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
  const when = whenLondon(start_iso, end_iso, true);
  await transporter.sendMail({
    from: `"CSCoaching" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
    subject: '📩 New CSCoaching booking',
    text: `New booking

Name: ${name || email}
Email: ${email}
When: ${when}
Location: ${location || ''}`
  });
}

async function sendActivationEmail({ to, name, token }) {
  const link = `${APP_BASE_URL}/activate.html?token=${encodeURIComponent(token)}`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#0f0f0f;color:#fff;padding:24px"><div style="max-width:560px;margin:0 auto;background:#101215;border:1px solid #1a1a1a;border-radius:12px;padding:20px"><h2 style="margin:0 0 12px">Welcome to CSCoaching</h2><p style="color:#cfcfcf">Hi ${name || to}, click below to set your password:</p><p style="margin:16px 0"><a href="${link}" style="background:#e02424;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block">Activate your account</a></p><p style="color:#9a9a9a;font-size:12px">Or paste this link:<br>${link}</p></div></body></html>`;
  await transporter.sendMail({ from: `"CSCoaching" <${process.env.SMTP_USER}>`, to, subject: 'Activate your CSCoaching account', html });
}

async function sendZeroCreditsEmail({ member, slot }) {
  const when = whenLondon(slot.start_iso, slot.end_iso, true); // uses your earlier helper
  const text = `Heads up — ${member.name || member.email} now has 0 credits.

Member: ${member.name || ''} <${member.email}>
When:   ${when}
Where:  ${slot.location || ''}`;

  await transporter.sendMail({
    from: `"CSCoaching" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
    subject: '⚠️ Member credits reached 0',
    text,
  });
}
async function sendZeroCreditsEmail({ member, slot }) {
  try {
    const s = new Date(slot.start_iso), e = new Date(slot.end_iso);
    const when = `${s.toLocaleDateString([], {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    })}, ${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Notify the member
    await transporter.sendMail({
      from: `"CSCoaching" <${process.env.SMTP_USER}>`,
      to: member.email,
      subject: 'You’ve used your last CSCoaching session credit',
      text: `Hi ${member.name || member.email},

Thanks for booking. That booking used your last remaining session credit.
Details: ${when}${slot.location ? ` @ ${slot.location}` : ''}

Reply to this email if you’d like to top up your credits, or message Clare directly.

— CSCoaching`,
    });

    // Let the admin know too (optional but requested)
    await transporter.sendMail({
      from: `"CSCoaching" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      subject: 'Member has hit 0 credits',
      text: `Member ${member.name || member.email} has just hit 0 credits after booking.
When: ${when}${slot.location ? ` @ ${slot.location}` : ''}`
    });
  } catch (e) {
    console.error('sendZeroCreditsEmail failed:', e);
  }
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

// Transaction wrapper that uses Turso's tx API in prod and BEGIN/COMMIT locally
async function withTx(execFn) {
  if (useTurso) {
    const tx = await tursoClient.transaction();
    const tRun = (sql, params=[]) => tx.execute({ sql, args: params });
    try {
      const out = await execFn({ tRun });
      await tx.commit();
      return out;
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }
  } else {
    await pRun('BEGIN');
    try {
      const out = await execFn({
        tRun: async (sql, params=[]) => pRun(sql, params)
      });
      await pRun('COMMIT');
      return out;
    } catch (e) {
      try { await pRun('ROLLBACK'); } catch {}
      throw e;
    }
  }
}

// Helper to read credits inside tx (works for both turso/local)
async function txGetCredits(tRun, memberId) {
  const q = await tRun(`SELECT credits FROM members WHERE id=?`, [memberId]);
  const row = q.rows?.[0] || null; // turso path
  if (row && row.credits !== undefined) return Number(row.credits);
  // local fallback (SELECT via pRun doesn't return rows), re-select outside tx:
  const r = await pGet(`SELECT credits FROM members WHERE id=?`, [memberId]);
  return Number(r?.credits || 0);
}


/* ---------- Slot filter & API ---------- */
// --- helper: extract hour in Europe/London (0-23) ---
function londonHour(dateLike) {
  const d = new Date(dateLike);
  // returns "00".."23"
  const hStr = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hour12: false, timeZone: 'Europe/London'
  }).format(d);
  return Number(hStr);
}
// --- helper: day-of-week in Europe/London (0=Sun..6=Sat) ---
function londonDOW(dateLike) {
  const d = new Date(dateLike);
  // Create a date string for Europe/London and read back DOW by constructing a new Date
  // Simpler: use toLocaleString then new Date — but safer is to compute via hour shift:
  // We'll just use Intl for weekday short and map; keeps it readable.
  const w = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', timeZone: 'Europe/London'
  }).format(d); // "Sun".."Sat"
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(w);
}

function withinCoachingWindow(slot) {
  const norm = s => (s || '').trim().toLowerCase();
  const inRange = (h, a, b) => h >= a && h < b;

  const dow = londonDOW(slot.start_iso);
  const h   = londonHour(slot.start_iso);
  const loc = norm(slot.location);

  // Mon (Scunthorpe) 17–21, Tue (Hull) 17–22, Wed (Shipley) 18–22, Thu (Hull) 17–22
  if (dow === 1 && inRange(h, 17, 21)) return !loc || loc.includes('scunthorpe');
  if (dow === 2 && inRange(h, 17, 22)) return !loc || loc.includes('hull');
  if (dow === 3 && inRange(h, 18, 22)) return !loc || loc.includes('shipley');
  if (dow === 4 && inRange(h, 17, 22)) return !loc || loc.includes('hull');
  return false;
}

// Allowed windows per DOW (0=Sun..6=Sat) -> set of allowed START hours
function allowedHoursFor(dow, location) {
  const loc = (location || '').toLowerCase();
  // If location is blank, accept default location for that weekday.
  // Mon Scunthorpe 17–20 (start hours), Tue Hull 17–21, Wed Shipley 18–21, Thu Hull 17–21
  if (dow === 1 && (!loc || loc.includes('scunthorpe'))) return new Set([17,18,19,20]);
  if (dow === 2 && (!loc || loc.includes('hull')))       return new Set([17,18,19,20,21]);
  if (dow === 3 && (!loc || loc.includes('shipley')))    return new Set([18,19,20,21]);
  if (dow === 4 && (!loc || loc.includes('hull')))       return new Set([17,18,19,20,21]);
  return new Set(); // others: no starts allowed
}

// Validate a start datetime (London) against day/location windows.
// Returns { ok, reason }.
function validateStartLondon(startISO, location) {
  const dow = londonDOW(startISO);
  const hr  = londonHour(startISO);
  const allowed = allowedHoursFor(dow, location);
  if (!allowed.size) return { ok:false, reason:'DAY_NOT_ALLOWED' };
  if (!allowed.has(hr)) return { ok:false, reason:'HOUR_NOT_ALLOWED' };
  return { ok:true };
}
// --- London helpers already present: londonDOW, londonHour ---

// Snap a Date to exact minute precision (top-of-hour by default)
function snapMinutes(d, step = 60) {
  const dt = new Date(d);
  dt.setSeconds(0, 0);
  const m = dt.getMinutes();
  const snapped = Math.round(m / step) * step;
  dt.setMinutes(snapped);
  return dt;
}

// Allowed windows per DOW (0=Sun..6=Sat) -> set of allowed START hours
function allowedHoursFor(dow, location) {
  const loc = (location || '').toLowerCase();
  // If location is blank, accept default location for that weekday.
  // Mon Scunthorpe 17–20 (start hours), Tue Hull 17–21, Wed Shipley 18–21, Thu Hull 17–21
  if (dow === 1 && (!loc || loc.includes('scunthorpe'))) return new Set([17,18,19,20]);
  if (dow === 2 && (!loc || loc.includes('hull')))       return new Set([17,18,19,20,21]);
  if (dow === 3 && (!loc || loc.includes('shipley')))    return new Set([18,19,20,21]);
  if (dow === 4 && (!loc || loc.includes('hull')))       return new Set([17,18,19,20,21]);
  return new Set(); // others: no starts allowed
}

// Validate a start datetime (London) against day/location windows.
// Returns { ok, reason }.
function validateStartLondon(startISO, location) {
  const dow = londonDOW(startISO);
  const hr  = londonHour(startISO);
  const allowed = allowedHoursFor(dow, location);
  if (!allowed.size) return { ok:false, reason:'DAY_NOT_ALLOWED' };
  if (!allowed.has(hr)) return { ok:false, reason:'HOUR_NOT_ALLOWED' };
  return { ok:true };
}

// --- London time formatting helpers ---
const fmtDayLondon = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  timeZone: 'Europe/London',
});
const fmtTimeLondon = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false,
  timeZone: 'Europe/London',
});
const fmtTimeLondonTZ = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false,
  timeZone: 'Europe/London', timeZoneName: 'short', // BST/GMT
});
function whenLondon(start_iso, end_iso, withTZ = true) {
  const s = new Date(start_iso);
  const e = new Date(end_iso);
  const day = fmtDayLondon.format(s);
  const tFmt = withTZ ? fmtTimeLondonTZ : fmtTimeLondon;
  return `${day}, ${tFmt.format(s)} – ${tFmt.format(e)}`;
}



/* ---------- Public API: slots (with all=true + holidays) ---------- */
app.get('/api/slots', async (req, res) => {
  try {
    const onlyAvailable = String(req.query.onlyAvailable || '').toLowerCase() === 'true';
    const debug = (req.query.debug || '').toString().toLowerCase();
    const showAll = String(req.query.all || '').toLowerCase() === 'true';
    const includeHolidays = String(req.query.includeHolidays || '').toLowerCase() === 'true';

    // window
    const now = new Date();
    const startReq = req.query.from ? new Date(req.query.from + 'T00:00:00Z') : now;

    const maxDays = Math.max(1, Math.min(180, Number(req.query.maxDays || 14)));
    const hardEnd = new Date(now); hardEnd.setDate(hardEnd.getDate() + maxDays);
    const endReq = req.query.to ? new Date(req.query.to + 'T23:59:59Z') : hardEnd;
    const end = endReq < hardEnd ? endReq : hardEnd;

    // fetch raw slots
    let where = `WHERE start_iso>=? AND start_iso<?`;
    const params = [startReq.toISOString(), end.toISOString()];
    if (onlyAvailable) where += ` AND is_booked=0`;

    const rows = await pAll(
      `SELECT id,start_iso,end_iso,is_booked,location
         FROM slots
        ${where}
        ORDER BY start_iso ASC`, params
    );

    // optional: get holidays in the same window
    let holidays = [];
    if (includeHolidays) {
      const fromYMD = params[0].slice(0,10);
      const toYMD   = params[1].slice(0,10);
      holidays = await pAll(
        `SELECT day, note FROM holidays
         WHERE day >= ? AND day <= ?
         ORDER BY day ASC`,
        [fromYMD, toYMD]
      );
    }

    // build a Set of holiday keys for quick exclusion
    const holiSet = new Set(holidays.map(h => h.day)); // 'YYYY-MM-DD'

    // helper: key by Europe/London day
    const FMT_YMD = new Intl.DateTimeFormat('en-GB', {
      year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Europe/London'
    });
    const keyFromISO = iso => {
      const parts = FMT_YMD.formatToParts(new Date(iso))
        .reduce((a,p) => (a[p.type]=p.value, a), {});
      return `${parts.year}-${parts.month}-${parts.day}`;
    };

        // business rule filter (unless showAll or debug=bypass)
    let filtered = rows;
    if (!showAll && debug !== 'bypass') {
      filtered = rows.filter(withinCoachingWindow);
      if (filtered.length === 0 && rows.length > 0) filtered = rows;
    }

    // universal cleanup: remove 22:00–23:00 starts
    filtered = filtered.filter(s => londonHour(s.start_iso) !== 22);


    // exclude any slots that fall on a holiday day
    filtered = filtered.filter(s => !holiSet.has(keyFromISO(s.start_iso)));

    // respond
    const payload = { ok: true, slots: filtered };
    if (includeHolidays) payload.holidays = holidays;

    if (debug) {
      payload.debug = {
        window: { from: params[0], to: params[1] },
        onlyAvailable, showAll,
        totalRows: rows.length,
        afterFilter: filtered.length,
        holidayDays: holidays.map(h => h.day)
      };
    }
    return res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ---------- Booking (must be a member with credits > 0) ---------- */
app.post('/api/book', async (req, res) => {
  const slotId = Number(req.body?.slotId ?? req.body?.slot_id);
  const email  = (req.body?.email || '').toLowerCase().trim();
  const notes  = (req.body?.notes || null);

  if (!slotId || !email) return res.status(400).json({ error: 'MISSING_FIELDS' });

  try {
    const slot = await pGet(`SELECT * FROM slots WHERE id=?`, [slotId]);
    if (!slot) return res.status(404).json({ error: 'SLOT_NOT_FOUND' });
    if (Number(slot.is_booked)) return res.status(409).json({ error: 'SLOT_ALREADY_BOOKED' });

    const member = await pGet(
      `SELECT id, name, email, credits FROM members WHERE lower(email)=lower(?)`,
      [email]
    );
    if (!member) return res.status(403).json({ error: 'NOT_MEMBER' });
    if (!Number.isFinite(member.credits) || member.credits <= 0) {
      return res.status(402).json({ error: 'NO_CREDITS' });
    }

    const result = await withTx(async ({ tRun }) => {
      // decrement only if > 0
      const dec = await tRun(
        `UPDATE members SET credits = credits - 1 WHERE id = ? AND credits > 0`,
        [member.id]
      );
      const decChanges = (dec.rowsAffected ?? dec.changes ?? 0);
      if (!decChanges) return { ok:false, code:402, error:'NO_CREDITS' };

      // mark slot booked
      const upd = await tRun(
        `UPDATE slots SET is_booked = 1 WHERE id = ? AND is_booked = 0`,
        [slotId]
      );
      const updChanges = (upd.rowsAffected ?? upd.changes ?? 0);
      if (!updChanges) {
        await tRun(`UPDATE members SET credits = credits + 1 WHERE id = ?`, [member.id]);
        return { ok:false, code:409, error:'SLOT_ALREADY_BOOKED' };
      }

      // create booking
      const ins = await tRun(
        `INSERT INTO bookings (member_id,slot_id,notes) VALUES (?,?,?)`,
        [member.id, slotId, notes]
      );

      const credits = await txGetCredits(tRun, member.id);

      return {
        ok: true,
        bookingId: Number(ins.lastInsertRowid || ins.lastID || 0),
        credits: credits
      };
    });

    if (!result.ok) return res.status(result.code).json({ error: result.error });

    // Side-effects AFTER commit
    sendAdminEmail({
      start_iso: slot.start_iso,
      end_iso: slot.end_iso,
      location: slot.location,
      name: member.name,
      email: member.email
    }).catch(console.error);

    sendCustomerEmail({
      to: member.email,
      name: member.name,
      email: member.email,
      start_iso: slot.start_iso,
      end_iso: slot.end_iso,
      location: slot.location,
      credits: result.credits
    }).catch(console.error);

    if (result.credits === 0) {
      sendZeroCreditsEmail({ member, slot }).catch(console.error);
    }

    return res.status(201).json({ ok: true, booking_id: result.bookingId, credits: result.credits });
  } catch (e) {
    console.error('BOOK TX ERROR:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
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

// Lightweight, no-error auth check for nav
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
/* ADMIN: upcoming bookings (future, exclude cancelled) */
app.get('/api/admin/bookings', requireAdmin, async (_req, res) => {
  try {
    const nowIso = new Date().toISOString();
    const rows = await pAll(
      `SELECT 
          b.id          AS booking_id,
          b.member_id,
          b.slot_id,
          b.cancelled_at,
          b.refunded,
          s.start_iso,
          s.end_iso,
          s.location,
          m.name        AS member_name,
          m.email       AS member_email
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
    const rawName   = req.body?.name;
    const rawEmail  = req.body?.email;
    const rawCreds  = req.body?.credits;

    if (!rawEmail) return res.status(400).json({ error: 'MISSING_EMAIL' });

    const name   = (rawName === undefined || rawName === null || rawName === '') ? null : String(rawName);
    const email  = String(rawEmail).trim();
    const creditsNum = Number.isFinite(Number(rawCreds)) ? Number(rawCreds) : 0;

    const existing = await pGet(
      `SELECT id, name, email, credits
         FROM members
        WHERE lower(email) = lower(?)`,
      [email]
    );

    async function issueInvite(memberId, inviteName) {
      const token = uuidv4();
      const expiresISO = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      await pRun(
        `INSERT INTO invites (id, member_id, expires_at, used)
         VALUES (?, ?, ?, ?)`,
        [String(token), Number(memberId), String(expiresISO), 0]
      );
      sendActivationEmail({ to: email, name: inviteName, token }).catch(console.error);
      return token;
    }

    if (existing) {
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

    const ins = await pRun(
      `INSERT INTO members (name, email, credits)
       VALUES (?, ?, ?)`,
      [name, email, creditsNum]
    );
    const memberId = Number(ins.lastID);
    const token = await issueInvite(memberId, name);
    return res.json({ ok: true, member_id: memberId, invite: token, existed: false });

  } catch (e) {
    if ((e.message || '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS' });
    }
    console.error(e);
    return res.status(500).json({ error: 'DB_ERROR' });
  }
});

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
  try {
    const force = String(req.query.force || 'false').toLowerCase() === 'true';
    const { start_iso, location, duration_minutes } = req.body || {};
    if (!start_iso) return res.status(400).json({ error: 'MISSING_START' });

    // Interpret incoming local time, snap to top of hour, recompute end by duration
    const startLocal = snapMinutes(new Date(start_iso), 60);
    const durMin = Number.isFinite(Number(duration_minutes)) ? Number(duration_minutes) : 60;
    const endLocal   = new Date(startLocal.getTime() + durMin * 60 * 1000);

    // Validate against windows (unless force=true)
    if (!force) {
      const v = validateStartLondon(startLocal.toISOString(), location);
      if (!v.ok) return res.status(400).json({ error: v.reason });
    }

    // Uniqueness on start_iso
    const dup = await pGet(`SELECT id FROM slots WHERE start_iso=?`, [startLocal.toISOString()]);
    if (dup) return res.status(409).json({ error: 'DUPLICATE_START' });

    const ins = await pRun(
      `INSERT INTO slots (start_iso,end_iso,location,is_booked) VALUES (?,?,?,0)`,
      [startLocal.toISOString(), endLocal.toISOString(), location || null]
    );
    res.json({ ok: true, id: ins.lastID });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});


app.delete('/api/admin/slots/:id', requireAdmin, async (req, res) => {
  try {
    await pRun(`DELETE FROM slots WHERE id=? AND is_booked=0`, [req.params.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'DB_ERROR' }); }
});

/* ADMIN: move & cancel bookings */
app.patch('/api/admin/bookings/:id/move', requireAdmin, async (req, res) => {
  const bid = Number(req.params.id);
  const { new_slot_id } = req.body || {};
  if (!bid || !new_slot_id) return res.status(400).json({ error: 'MISSING_FIELDS' });

  try {
    const b = await pGet(
      `SELECT b.id, b.slot_id, b.member_id, s.start_iso
       FROM bookings b JOIN slots s ON b.slot_id = s.id
       WHERE b.id = ?`,
      [bid]
    );
    if (!b) return res.status(404).json({ error: 'NOT_FOUND' });

    const tgt = await pGet(`SELECT id, is_booked FROM slots WHERE id = ?`, [new_slot_id]);
    if (!tgt || tgt.is_booked) return res.status(400).json({ error: 'TARGET_TAKEN' });

    await pRun(`UPDATE slots SET is_booked = 0 WHERE id = ?`, [b.slot_id]);
    await pRun(`UPDATE slots SET is_booked = 1 WHERE id = ?`, [new_slot_id]);
    await pRun(`UPDATE bookings SET slot_id = ? WHERE id = ?`, [new_slot_id, bid]);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

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

/* ---------- Admin: Holidays CRUD ---------- */

// List holidays (optionally by range)
app.get('/api/admin/holidays', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    let rows = [];
    if (from && to) {
      rows = await pAll(
        `SELECT day, note FROM holidays
         WHERE day >= ? AND day <= ?
         ORDER BY day ASC`, [from, to]
      );
    } else {
      rows = await pAll(`SELECT day, note FROM holidays ORDER BY day ASC`, []);
    }
    res.json({ ok: true, holidays: rows });
  } catch (e) {
    console.error('GET /api/admin/holidays', e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// Upsert a holiday
app.post('/api/admin/holidays', requireAdmin, async (req, res) => {
  try {
    const { day, note } = req.body || {};
    if (!day) return res.status(400).json({ error: 'MISSING_DAY' });
    await pRun(
      `INSERT INTO holidays (day, note)
       VALUES (?, ?)
       ON CONFLICT(day) DO UPDATE SET note=excluded.note`,
      [day, note || null]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/holidays', e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// Remove a holiday
app.delete('/api/admin/holidays/:day', requireAdmin, async (req, res) => {
  try {
    await pRun(`DELETE FROM holidays WHERE day = ?`, [req.params.day]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/holidays/:day', e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});


/* ========== ADMIN: MAINTAIN SLOTS (Mon–Thu windows) ========== */
app.post('/api/admin/maintain-slots', requireAdmin, async (req, res) => {
  const days = Math.max(1, Math.min(31, Number(req.query.days || 14)));

  // Which hours & location per day-of-week
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

  // Build ISO string for y-m-d at a *London* wall-clock hour
  function londonISO(y, m, d, hour) {
    const guessUTC = new Date(Date.UTC(y, m, d, hour, 0, 0));

    const londonHourStr = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hour12: false, timeZone: 'Europe/London'
    }).format(guessUTC);

    const londonHourNum = Number(londonHourStr);
    const diffHours = hour - londonHourNum;
    guessUTC.setUTCHours(guessUTC.getUTCHours() + diffHours);

    return guessUTC.toISOString();
  }

  try {
    // Purge past, unbooked slots
    const delRes = await pRun(
      `DELETE FROM slots
       WHERE is_booked = 0 AND datetime(end_iso) < datetime('now')`,
      []
    );
    const purged = delRes.changes || 0;

    let created = 0;
    const base = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);

      const dow = d.getDay();
      const hours = hoursForDay(dow);
      const loc   = defaultLocation(dow);
      if (!hours.length) continue;

      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const dayNum = d.getUTCDate();

      for (const h of hours) {
        const startISO = londonISO(y, m, dayNum, h);
        const endISO   = londonISO(y, m, dayNum, h + 1);

        const exists = await pGet(`SELECT id FROM slots WHERE start_iso = ?`, [startISO]);
        if (!exists) {
          await pRun(
            `INSERT INTO slots (start_iso, end_iso, location, is_booked)
             VALUES (?,?,?,0)`,
            [startISO, endISO, loc]
          );
          created++;
        }
      }
    }

    res.json({ ok: true, purged, created });
  } catch (e) {
    console.error('POST /api/admin/maintain-slots error:', e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

/* ---------- ADMIN: Update an unbooked slot (start/location/duration) ---------- */
app.patch('/api/admin/slots/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' });

    const { start_iso, location, duration_minutes } = req.body || {};
    if (!start_iso && !location && !duration_minutes) {
      return res.status(400).json({ error: 'NO_FIELDS' });
    }

    // Only allow editing if slot is not booked
    const slot = await pGet(`SELECT id, is_booked, start_iso, end_iso FROM slots WHERE id=?`, [id]);
    if (!slot) return res.status(404).json({ error: 'NOT_FOUND' });
    if (Number(slot.is_booked)) return res.status(400).json({ error: 'BOOKED_SLOT' });

    // Compute new start/end
    const newStart = start_iso ? new Date(start_iso) : new Date(slot.start_iso);
    const durMin = Number.isFinite(Number(duration_minutes)) ? Number(duration_minutes) : 60;
    const newEnd = new Date(newStart.getTime() + durMin * 60 * 1000);

const force = String(req.query.force || 'false').toLowerCase() === 'true';
if (!force) {
  const v = validateStartLondon(newStart.toISOString(), (location ?? slot.location));
  if (!v.ok) return res.status(400).json({ error: v.reason });
}


    // Avoid duplicates on start_iso (simple uniqueness by start time)
    const dup = await pGet(
      `SELECT id FROM slots WHERE start_iso=? AND id<>?`,
      [newStart.toISOString(), id]
    );
    if (dup) return res.status(409).json({ error: 'DUPLICATE_START' });

    await pRun(
      `UPDATE slots
          SET start_iso = ?,
              end_iso   = ?,
              location  = COALESCE(?, location)
        WHERE id = ?`,
      [newStart.toISOString(), newEnd.toISOString(), (location ?? null), id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/admin/slots/:id error:', e);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});
/* ---------- ADMIN: Bulk create slots ----------
  Body:
  {
    "from": "YYYY-MM-DD",
    "to": "YYYY-MM-DD",
    "weekdays": [1,2,3,4],      // Mon=1 .. Sun=0
    "hours": [17,18,19,20],     // London wall-clock hours (24h)
    "duration_minutes": 60,
    "location": "Hull"
  }
*/
app.post('/api/admin/slots/bulk', requireAdmin, async (req, res) => {
  try {
    const { from, to, weekdays, hours, duration_minutes, location } = req.body || {};
    const force = String(req.query.force || 'false').toLowerCase() === 'true';

    if (!from || !to) return res.status(400).json({ error: 'MISSING_RANGE' });
    const wd  = Array.isArray(weekdays) ? weekdays.map(Number) : [];
    const hh  = Array.isArray(hours)    ? hours.map(Number)    : [];
    const dur = Number.isFinite(Number(duration_minutes)) ? Number(duration_minutes) : 60;
    if (!wd.length || !hh.length) return res.status(400).json({ error: 'MISSING_PATTERN' });

    const startDay = new Date(from + 'T00:00:00Z');
    const endDay   = new Date(to   + 'T23:59:59Z');
    if (!(startDay < endDay)) return res.status(400).json({ error: 'BAD_RANGE' });

    function londonISO(y, m, d, hour) {
      const guessUTC = new Date(Date.UTC(y, m, d, hour, 0, 0));
      const londonHourStr = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }).format(guessUTC);
      const londonHourNum = Number(londonHourStr);
      const diffHours = hour - londonHourNum;
      guessUTC.setUTCHours(guessUTC.getUTCHours() + diffHours);
      return guessUTC.toISOString();
    }
    const londonWeekday = (dateLike) => {
      const w = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(new Date(dateLike));
      return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(w);
    };

    let created = 0, skipped = 0;

    // OUTER for-loop — make sure this block is closed later
    for (let t = new Date(startDay); t <= endDay; t.setUTCDate(t.getUTCDate() + 1)) {
      const y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
      const dow = londonWeekday(t);
      if (!wd.includes(dow)) continue;

      // INNER for-loop — this one already had a closing brace
      for (const h of hh) {
        const startISO = londonISO(y, m, d, h);
        const endISO   = londonISO(y, m, d, h + Math.max(1, Math.round(dur/60)));

        if (!force) {
          const v = validateStartLondon(startISO, location);
          if (!v.ok) { skipped++; continue; }
        }

        const exists = await pGet(`SELECT id FROM slots WHERE start_iso = ?`, [startISO]);
        if (exists) { skipped++; continue; }

        await pRun(
          `INSERT INTO slots (start_iso, end_iso, location, is_booked) VALUES (?,?,?,0)`,
          [startISO, endISO, location || null]
        );
        created++;
      } // <-- closes inner loop
    }   // <-- closes outer loop

    return res.json({ ok: true, created, skipped });
  } catch (e) {
    console.error('POST /api/admin/slots/bulk error:', e);
    return res.status(500).json({ error: 'DB_ERROR' });
  }
});



/* -------- Member: Cancel their own booking (refund only if >24h) -------- */
app.post('/api/member/bookings/:id/cancel', requireMember, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isFinite(idNum)) return res.status(400).json({ error: 'BAD_ID' });

  try {
    let row = await pGet(
      `SELECT b.id, b.member_id, b.slot_id, b.cancelled_at, s.start_iso
         FROM bookings b
         JOIN slots s ON b.slot_id = s.id
        WHERE b.id = ? AND b.member_id = ?`,
      [idNum, req.session.member.id]
    );

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

/* ---------- Unknown /api => 404 JSON ---------- */
app.all('/api/*', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

/* ---------- Easy Logout via link (single definition) ---------- */
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('csc_sid', {
      sameSite: 'lax',
      secure: !!process.env.RENDER,
      httpOnly: true
    });
    res.redirect('/');
  });
});

/* ---------- Explicit HTML routes so they don’t fall through ---------- */
app.get('/book.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'book.html'))
);
app.get('/login.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'login.html'))
);
app.get('/dashboard.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);

/* ---------- Static & catch-all ---------- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`Server running on ${APP_BASE_URL} (turso=${useTurso})`);
}); 
 
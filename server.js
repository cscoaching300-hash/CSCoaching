/* FULL server.js — Admin upgrades (fixed order & braces) */
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';
const APP_BASE = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

/* -------------------- DB -------------------- */
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new sqlite3.Database(path.join(DATA_DIR, 'app.sqlite'));

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
    used INTEGER DEFAULT 0,
    FOREIGN KEY(member_id) REFERENCES members(id)
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
    refunded INTEGER DEFAULT 0,
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(slot_id) REFERENCES slots(id)
  )`);
});

/* -------------------- Middleware -------------------- */
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
app.use(session({
  name: 'csc_sid',
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly:true, sameSite:'lax', secure:false, maxAge: 1000*60*60*24*14 }
}));

/* -------------------- Email -------------------- */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

function customerHtml({ name, email, start_iso, end_iso, location, credits, hero }) {
  const s = new Date(start_iso), e = new Date(end_iso);
  const when = `${s.toLocaleDateString([], { weekday:'short', day:'numeric', month:'short', year:'numeric' })}, ${s.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} – ${e.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#000;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#0f0f0f;border:1px solid #1a1a1a;border-radius:12px;color:#fff;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center" style="padding:20px 16px 8px;">${hero?`<img src="cid:heroimg" alt="CSCoaching" width="600" style="display:block;width:100%;height:auto;border-radius:10px;border:0;outline:none;">`:`<div style="font-size:24px;font-weight:700;letter-spacing:.5px;">CSCoaching</div>`}</td></tr><tr><td style="height:1px;background:#1a1a1a;"></td></tr><tr><td style="padding:18px;font-size:16px;line-height:1.5;"><p style="margin:0 0 10px;">Hi <strong>${name||email}</strong>,</p><p style="margin:0 0 14px;">Your coaching session is <span style="color:#31c553">confirmed</span> ✅</p><table role="presentation" width="100%" style="background:#0b0b0b;border:1px solid #1a1a1a;border-radius:10px;"><tr><td style="padding:12px 14px 0;font-size:14px;color:#d0d0d0;">When</td></tr><tr><td style="padding:0 14px 10px;font-size:16px;color:#fff;"><strong>${when}</strong></td></tr><tr><td style="padding:0 14px 0;font-size:14px;color:#d0d0d0;">Location</td></tr><tr><td style="padding:0 14px 12px;font-size:16px;color:#fff;"><strong>${location||'CSCoaching'}</strong></td></tr><tr><td style="padding:0 14px 14px;font-size:14px;color:#fff;"><span style="display:inline-block;background:#121212;border:1px solid #1a1a1a;border-radius:8px;padding:6px 10px;">Remaining session credits: <strong style="color:#e02424;">${typeof credits==='number'?credits:'—'}</strong></span></td></tr></table><p style="margin:12px 0 0;color:#b5b5b5;font-size:12px;">Need to reschedule? Reply to this email.</p><p style="margin:6px 0 0;color:#b5b5b5;font-size:12px;">© CSCoaching • All rights reserved</p></td></tr></table></td></tr></table></body></html>`;
}

async function sendCustomerEmail({ to, name, email, start_iso, end_iso, location, credits }) {
  const heroPath = fs.existsSync(path.join(__dirname, 'public', 'logo.png')) ? path.join(__dirname, 'public', 'logo.png') : null;
  await transporter.sendMail({
    from: `"CSCoaching" <${process.env.SMTP_USER}>`,
    to,
    subject: '🎳 CSCoaching — Your session is confirmed',
    html: customerHtml({ name, email, start_iso, end_iso, location, credits, hero: !!heroPath }),
    attachments: heroPath ? [{ filename:'logo.png', path: heroPath, cid:'heroimg' }] : []
  });
}
async function sendAdminEmail({ start_iso, end_iso, location, name, email }) {
  const s = new Date(start_iso), e = new Date(end_iso);
  await transporter.sendMail({
    from: `"CSCoaching" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
    subject: '📩 New CSCoaching booking',
    text: `New booking\n\nName: ${name||email}\nEmail: ${email}\nWhen: ${s} – ${e}\nLocation: ${location||''}`
  });
}
async function sendActivationEmail({ to, name, token }) {
  const link = `${APP_BASE}/activate.html?token=${encodeURIComponent(token)}`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#0f0f0f;color:#fff;padding:24px"><div style="max-width:560px;margin:0 auto;background:#101215;border:1px solid #1a1a1a;border-radius:12px;padding:20px"><h2 style="margin:0 0 12px">Welcome to CSCoaching</h2><p style="color:#cfcfcf">Hi ${name||to}, click below to set your password:</p><p style="margin:16px 0"><a href="${link}" style="background:#e02424;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block">Activate your account</a></p><p style="color:#9a9a9a;font-size:12px">Or paste this link:<br>${link}</p></div></body></html>`;
  await transporter.sendMail({ from:`"CSCoaching" <${process.env.SMTP_USER}>`, to, subject:'Activate your CSCoaching account', html });
}
async function sendAdminCancelEmail({ to, name, start_iso, location }) {
  const s = new Date(start_iso);
  const when = `${s.toLocaleDateString([], { weekday:'short', day:'numeric', month:'short', year:'numeric' })} ${s.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#0f0f0f;color:#fff;padding:24px"><div style="max-width:560px;margin:0 auto;background:#101215;border:1px solid #1a1a1a;border-radius:12px;padding:20px"><h2 style="margin:0 0 12px">Session Cancelled</h2><p>Hi ${name||to}, your session on <strong>${when}</strong> at <strong>${location||'CSCoaching'}</strong> was cancelled by the coach. Your credit has been restored.</p></div></body></html>`;
  await transporter.sendMail({ from:`"CSCoaching" <${process.env.SMTP_USER}>`, to, subject:'CSCoaching — Your session was cancelled', html });
}
async function sendAdminRescheduleEmail({ to, name, old_start, new_start, new_end, location }) {
  const os = new Date(old_start);
  const ns = new Date(new_start), ne = new Date(new_end);
  const oldWhen = `${os.toLocaleDateString([], { weekday:'short', day:'numeric', month:'short' })} ${os.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
  const newWhen = `${ns.toLocaleDateString([], { weekday:'short', day:'numeric', month:'short' })} ${ns.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} – ${ne.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#0f0f0f;color:#fff;padding:24px"><div style="max-width:560px;margin:0 auto;background:#101215;border:1px solid #1a1a1a;border-radius:12px;padding:20px"><h2 style="margin:0 0 12px">Session Rescheduled</h2><p>Hi ${name||to}, your session previously at <strong>${oldWhen}</strong> has been moved to:</p><p><strong>${newWhen}</strong> at <strong>${location||'CSCoaching'}</strong></p></div></body></html>`;
  await transporter.sendMail({ from:`"CSCoaching" <${process.env.SMTP_USER}>`, to, subject:'CSCoaching — Session rescheduled', html });
}

/* -------------------- Helpers -------------------- */
function requireAdmin(req,res,next){ const k=req.header('X-ADMIN-KEY'); if(!k||k!==ADMIN_KEY) return res.status(401).json({error:'ADMIN_ONLY'}); next(); }
function requireMember(req,res,next){ if(req.session && req.session.member) return next(); return res.status(401).json({error:'UNAUTHORIZED'}); }
function getMemberByEmail(email){ return new Promise((resolve,reject)=>{ db.get(`SELECT * FROM members WHERE lower(email)=lower(?)`,[email],(e,row)=> e?reject(e):resolve(row||null)); }); }
function createMember({name,email,credits=0}){ return new Promise((resolve,reject)=>{ db.run(`INSERT INTO members (name,email,credits) VALUES (?,?,?)`,[name||null,email,credits],function(e){ if(e) return reject(e); db.get(`SELECT * FROM members WHERE id=?`,[this.lastID],(e2,row)=> e2?reject(e2):resolve(row)); }); }); }

function withinCoachingWindow(slot){
  const norm = s => (s||'').trim().toLowerCase(); const inRange=(h,a,b)=>h>=a && h<b;
  const d=new Date(slot.start_iso), dow=d.getDay(), h=d.getHours(), loc=norm(slot.location);
  if (dow===1 && inRange(h,17,21)) return !loc || loc.includes('scunthorpe');
  if (dow===2 && inRange(h,17,22)) return !loc || loc.includes('hull');
  if (dow===3 && inRange(h,18,22)) return !loc || loc.includes('shipley');
  if (dow===4 && inRange(h,17,22)) return !loc || loc.includes('hull');
  return false;
}

/* -------------------- Public API -------------------- */
app.get('/api/slots',(req,res)=>{
  const onlyAvailable = String(req.query.onlyAvailable||'').toLowerCase()==='true';
  const debug = (req.query.debug||'').toString().toLowerCase();
  const now=new Date();
  const startReq = req.query.from? new Date(req.query.from+'T00:00:00Z') : now;
  const hardEnd = new Date(now); hardEnd.setDate(hardEnd.getDate()+14);
  const endReq = req.query.to? new Date(req.query.to+'T23:59:59Z') : hardEnd;
  const end = endReq < hardEnd ? endReq : hardEnd;
  const params=[startReq.toISOString(), end.toISOString()];
  let where=`WHERE start_iso>=? AND start_iso<?`; if(onlyAvailable) where+=` AND is_booked=0`;
  db.all(`SELECT id,start_iso,end_iso,is_booked,location FROM slots ${where} ORDER BY start_iso ASC`, params, (err,rows)=>{
    if (err) return res.status(500).json({error:'DB_ERROR'});
    let filtered = (debug==='bypass')? rows : rows.filter(withinCoachingWindow);
    if (filtered.length===0 && rows.length>0 && debug!=='bypass') filtered=rows;
    if (debug) return res.json({ ok:true, debug:{ window:{from:params[0],to:params[1]}, onlyAvailable, totalRows:rows.length, afterFilter:filtered.length }, slots:filtered });
    res.json({ ok:true, slots:filtered });
  });
});

app.post('/api/book', async (req,res)=>{
  try{
    const { slot_id, email, notes } = req.body||{};
    if (!slot_id || !email) return res.status(400).json({ error:'MISSING_FIELDS' });
    const slot = await new Promise((resolve,reject)=> db.get(`SELECT * FROM slots WHERE id=?`,[slot_id],(e,row)=> e?reject(e):resolve(row)));
    if (!slot) return res.status(404).json({error:'SLOT_NOT_FOUND'});
    if (slot.is_booked) return res.status(400).json({error:'SLOT_ALREADY_BOOKED'});
    let member = await getMemberByEmail(email); if(!member) member = await createMember({email,credits:0});
    const booking = await new Promise((resolve,reject)=> db.run(`INSERT INTO bookings (member_id,slot_id,notes) VALUES (?,?,?)`,[member.id, slot.id, notes||null], function(e){ if(e) return reject(e); db.get(`SELECT * FROM bookings WHERE id=?`,[this.lastID],(e2,row)=> e2?reject(e2):resolve(row)); }));
    await new Promise((resolve,reject)=> db.run(`UPDATE slots SET is_booked=1 WHERE id=?`,[slot.id], e=> e?reject(e):resolve()));
    let remaining=member.credits;
    if (remaining>0){
      await new Promise((resolve,reject)=> db.run(`UPDATE members SET credits=credits-1 WHERE id=? AND credits>0`,[member.id],e=> e?reject(e):resolve()));
      const row = await new Promise((resolve,reject)=> db.get(`SELECT credits FROM members WHERE id=?`,[member.id],(e,r)=> e?reject(e):resolve(r)));
      remaining=row.credits;
    }
    sendAdminEmail({ start_iso:slot.start_iso, end_iso:slot.end_iso, location:slot.location, name:member.name, email }).catch(console.error);
    sendCustomerEmail({ to:email, name:member.name, email, start_iso:slot.start_iso, end_iso:slot.end_iso, location:slot.location, credits:remaining }).catch(console.error);
    res.json({ ok:true, booking_id:booking.id, credits:remaining });
  }catch(e){ console.error(e); res.status(500).json({error:'SERVER_ERROR'}); }
});

/* -------------------- Member auth & dashboard -------------------- */
app.post('/api/auth/login',(req,res)=>{
  const { email, password } = req.body||{};
  if (!email || !password) return res.status(400).json({error:'MISSING_FIELDS'});
  db.get(`SELECT * FROM members WHERE lower(email)=lower(?)`,[email],(e,m)=>{
    if (e) return res.status(500).json({error:'DB_ERROR'});
    if (!m || !m.password_hash || !bcrypt.compareSync(password, m.password_hash)) return res.status(401).json({error:'INVALID_LOGIN'});
    req.session.member = { id:m.id, name:m.name, email:m.email }; res.json({ok:true});
  });
});
app.post('/api/auth/logout',(req,res)=>{ req.session.destroy(()=> res.json({ok:true})); });
app.get('/api/me', requireMember, (req,res)=>{
  const id=req.session.member.id;
  db.get(`SELECT id,name,email,credits FROM members WHERE id=?`,[id],(e,m)=> e?res.status(500).json({error:'DB_ERROR'}) : (!m?res.status(404).json({error:'NOT_FOUND'}) : res.json({ok:true, member:m})));
});

app.get('/api/auth/check-invite',(req,res)=>{
  const token=req.query.token;
  if(!token) return res.status(400).json({error:'MISSING_TOKEN'});
  db.get(`SELECT invites.*, members.name, members.email FROM invites JOIN members ON invites.member_id=members.id WHERE invites.id=? AND invites.used=0 AND datetime(expires_at)>datetime('now')`,[token],(e,row)=>{
    if(e) return res.status(500).json({error:'DB_ERROR'});
    if(!row) return res.status(400).json({error:'INVALID_OR_EXPIRED'});
    res.json({ok:true, name:row.name, email:row.email});
  });
});
app.post('/api/auth/set-password',(req,res)=>{
  const { token, password } = req.body||{};
  if (!token || !password) return res.status(400).json({error:'MISSING_FIELDS'});
  db.get(`SELECT * FROM invites WHERE id=? AND used=0 AND datetime(expires_at)>datetime('now')`,[token],(e,inv)=>{
    if (e) return res.status(500).json({error:'DB_ERROR'});
    if (!inv) return res.status(400).json({error:'INVALID_OR_EXPIRED'});
    const hash=bcrypt.hashSync(password,10);
    db.run(`UPDATE members SET password_hash=? WHERE id=?`,[hash, inv.member_id], (e1)=>{
      if(e1) return res.status(500).json({error:'DB_ERROR'});
      db.run(`UPDATE invites SET used=1 WHERE id=?`,[token], (e2)=> e2?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true}));
    });
  });
});

app.get('/api/member/bookings', requireMember, (req,res)=>{
  db.all(`SELECT b.id as booking_id, b.cancelled_at, b.refunded, s.id, s.start_iso, s.end_iso, s.location
          FROM bookings b JOIN slots s ON b.slot_id=s.id
          WHERE b.member_id=? ORDER BY s.start_iso DESC`,
    [req.session.member.id],
    (e,rows)=> e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true, bookings:rows}));
});
app.post('/api/member/bookings/:id/cancel', requireMember, (req,res)=>{
  const bid=Number(req.params.id);
  db.get(`SELECT b.*, s.start_iso FROM bookings b JOIN slots s ON b.slot_id=s.id WHERE b.id=? AND b.member_id=?`,
    [bid, req.session.member.id], (e,row)=>{
      if (e) return res.status(500).json({error:'DB_ERROR'});
      if (!row) return res.status(404).json({error:'NOT_FOUND'});
      if (row.cancelled_at) return res.status(400).json({error:'ALREADY_CANCELLED'});
      const start = new Date(row.start_iso).getTime();
      const cutoff = start - 24*60*60*1000;
      const refunded = Date.now() < cutoff ? 1 : 0;
      db.serialize(()=>{
        db.run(`UPDATE bookings SET cancelled_at=datetime('now'), refunded=? WHERE id=?`,[refunded,bid]);
        db.run(`UPDATE slots SET is_booked=0 WHERE id=?`,[row.slot_id]);
        if (refunded) db.run(`UPDATE members SET credits=credits+1 WHERE id=?`,[row.member_id]);
      });
      res.json({ok:true, refunded:!!refunded});
    });
});

/* -------------------- ADMIN: Members & Slots -------------------- */
function requireAdminKey(req,res,next){ return requireAdmin(req,res,next); }

app.get('/api/admin/members', requireAdminKey, (req,res)=>{
  db.all(`SELECT id,name,email,credits FROM members ORDER BY created_at DESC`,[],
    (e,rows)=> e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true, members:rows}));
});

app.post('/api/admin/members', requireAdminKey, (req,res)=>{
  const { name, email, credits=0 } = req.body||{};
  if (!email) return res.status(400).json({error:'MISSING_EMAIL'});
  db.run(`INSERT INTO members (name,email,credits) VALUES (?,?,?)`,[name||null,email,Number(credits)||0], function(err){
    if (err) return res.status(500).json({error:'DB_ERROR'});
    const memberId=this.lastID;
    const token=uuidv4(); const expires=new Date(); expires.setDate(expires.getDate()+7);
    db.run(`INSERT INTO invites (id,member_id,expires_at) VALUES (?,?,?)`,[token,memberId,expires.toISOString()], async (e2)=>{
      if (e2) return res.status(500).json({error:'DB_ERROR'});
      sendActivationEmail({ to:email, name, token }).catch(console.error);
      res.json({ok:true, member_id:memberId, invite:token});
    });
  });
});

app.post('/api/admin/invites/resend', requireAdminKey, (req,res)=>{
  const email=(req.body?.email||'').trim().toLowerCase();
  if (!email) return res.status(400).json({error:'MISSING_EMAIL'});
  db.get(`SELECT id,name FROM members WHERE lower(email)=?`,[email],(e,m)=>{
    if (e) return res.status(500).json({error:'DB_ERROR'});
    if (!m) return res.status(404).json({error:'NO_SUCH_MEMBER'});
    const token=uuidv4(); const expires=new Date(); expires.setDate(expires.getDate()+7);
    db.run(`INSERT INTO invites (id,member_id,expires_at) VALUES (?,?,?)`,[token,m.id,expires.toISOString()], async (e2)=>{
      if (e2) return res.status(500).json({error:'DB_ERROR'});
      try{ await sendActivationEmail({ to:email, name:m.name, token }); res.json({ok:true}); }
      catch(e3){ console.error(e3); res.status(500).json({error:'EMAIL_FAIL'}); }
    });
  });
});

app.patch('/api/admin/members/:id', requireAdminKey, (req,res)=>{
  const { credits, name } = req.body||{};
  db.run(`UPDATE members SET credits=COALESCE(?,credits), name=COALESCE(?,name) WHERE id=?`,
    [typeof credits==='number'?credits:null, name||null, req.params.id],
    (e)=> e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true}));
});

app.delete('/api/admin/members/:id', requireAdminKey, (req,res)=>{
  db.run(`DELETE FROM members WHERE id=?`,[req.params.id],
    (e)=> e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true}));
});

app.get('/api/admin/slots', requireAdminKey, (req,res)=>{
  db.all(`SELECT * FROM slots ORDER BY start_iso DESC`,[],
    (e,rows)=> e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true, slots:rows}));
});

app.post('/api/admin/slots', requireAdminKey, (req,res)=>{
  const { start_iso, location } = req.body||{};
  if (!start_iso) return res.status(400).json({error:'MISSING_START'});
  const start=new Date(start_iso), end=new Date(start.getTime()+60*60*1000);
  db.run(`INSERT INTO slots (start_iso,end_iso,location) VALUES (?,?,?)`,
    [start.toISOString(), end.toISOString(), location||null],
    function(e){ return e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true, id:this.lastID}); });
});

app.delete('/api/admin/slots/:id', requireAdminKey, (req,res)=>{
  db.run(`DELETE FROM slots WHERE id=? AND is_booked=0`,[req.params.id],
    (e)=> e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true}));
});

/* Upcoming bookings (booked + future) */
app.get('/api/admin/bookings/upcoming', requireAdminKey, (req,res)=>{
  db.all(`
    SELECT b.id as booking_id, b.member_id, b.slot_id,
           m.name as member_name, m.email as member_email, m.credits as member_credits,
           s.start_iso, s.end_iso, s.location
    FROM bookings b
    JOIN members m ON b.member_id = m.id
    JOIN slots s   ON b.slot_id   = s.id
    WHERE b.cancelled_at IS NULL
      AND datetime(s.start_iso) >= datetime('now')
    ORDER BY s.start_iso ASC
  `, [], (e,rows)=> e?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true, bookings:rows}));
});

/* Edit slot time/location; if booked, email member about reschedule */
app.patch('/api/admin/slots/:id', requireAdminKey, (req,res)=>{
  const id = Number(req.params.id);
  const { start_iso, location } = req.body||{};
  if (!start_iso && !location) return res.status(400).json({error:'NO_CHANGES'});

  db.get(`SELECT * FROM slots WHERE id=?`, [id], (e,slot)=>{
    if (e) return res.status(500).json({error:'DB_ERROR'});
    if (!slot) return res.status(404).json({error:'NOT_FOUND'});

    const newStart = start_iso ? new Date(start_iso) : new Date(slot.start_iso);
    const newEnd   = new Date(newStart.getTime() + 60*60*1000);
    const newLoc   = (typeof location==='string' && location.trim()) ? location.trim() : slot.location;

    db.run(`UPDATE slots SET start_iso=?, end_iso=?, location=? WHERE id=?`,
      [newStart.toISOString(), newEnd.toISOString(), newLoc, id],
      async (e2)=>{
        if (e2) return res.status(500).json({error:'DB_ERROR'});

        if (slot.is_booked) {
          db.get(`SELECT b.id as booking_id, m.email, m.name
                  FROM bookings b JOIN members m ON b.member_id=m.id
                  WHERE b.slot_id=? AND b.cancelled_at IS NULL`, [id], async (e3,row)=>{
            if (!e3 && row) {
              try{
                await sendAdminRescheduleEmail({
                  to: row.email, name: row.name,
                  old_start: slot.start_iso,
                  new_start: newStart.toISOString(),
                  new_end: newEnd.toISOString(),
                  location: newLoc
                });
              }catch(err){ console.error('reschedule mail err', err); }
            }
            return res.json({ok:true});
          });
        } else {
          return res.json({ok:true});
        }
      });
  });
});

/* Cancel slot (refund if booked, notify) */
app.post('/api/admin/slots/:id/cancel', requireAdminKey, (req,res)=>{
  const id = Number(req.params.id);
  db.get(`SELECT * FROM slots WHERE id=?`, [id], (e,slot)=>{
    if (e) return res.status(500).json({error:'DB_ERROR'});
    if (!slot) return res.status(404).json({error:'NOT_FOUND'});

    if (!slot.is_booked) {
      db.run(`DELETE FROM slots WHERE id=?`, [id], (e2)=> e2?res.status(500).json({error:'DB_ERROR'}) : res.json({ok:true, deleted:true}));
      return;
    }

    db.get(`SELECT b.*, m.email, m.name FROM bookings b JOIN members m ON b.member_id=m.id
            WHERE b.slot_id=? AND b.cancelled_at IS NULL`, [id], (e3,row)=>{
      if (e3) return res.status(500).json({error:'DB_ERROR'});
      if (!row) {
        db.run(`UPDATE slots SET is_booked=0 WHERE id=?`,[id], ()=> res.json({ok:true}));
        return;
      }

      db.serialize(()=>{
        db.run(`UPDATE bookings SET cancelled_at=datetime('now'), refunded=1 WHERE id=?`, [row.id]);
        db.run(`UPDATE members SET credits=credits+1 WHERE id=?`, [row.member_id]);
        db.run(`DELETE FROM slots WHERE id=?`, [id]);
      });

      sendAdminCancelEmail({ to:row.email, name:row.name, start_iso:slot.start_iso, location:slot.location })
        .catch(err=> console.error('cancel mail err', err));

      res.json({ok:true, refunded:true, notified:true});
    });
  });
});

/* Admin: list/move/cancel specific bookings (general) */
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  db.all(
    `SELECT 
       b.id            AS booking_id,
       b.cancelled_at  AS cancelled_at,
       b.refunded      AS refunded,
       b.member_id     AS member_id,
       m.name          AS member_name,
       m.email         AS member_email,
       s.id            AS slot_id,
       s.start_iso     AS start_iso,
       s.end_iso       AS end_iso,
       s.location      AS location
     FROM bookings b
     JOIN members m ON b.member_id = m.id
     JOIN slots   s ON b.slot_id   = s.id
     WHERE b.cancelled_at IS NULL
       AND datetime(s.start_iso) >= datetime('now')
     ORDER BY s.start_iso ASC`,
    [],
    (err, rows) => err ? res.status(500).json({ error: 'DB_ERROR' }) : res.json({ ok: true, bookings: rows })
  );
});

app.post('/api/admin/bookings/:id/cancel', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const refund = String(req.query.refund ?? 'true').toLowerCase() !== 'false';
  db.get(
    `SELECT b.*, s.start_iso 
     FROM bookings b JOIN slots s ON b.slot_id = s.id
     WHERE b.id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
      if (row.cancelled_at) return res.status(400).json({ error: 'ALREADY_CANCELLED' });

      db.serialize(() => {
        db.run(`UPDATE bookings SET cancelled_at = datetime('now'), refunded = ? WHERE id = ?`, [refund ? 1 : 0, id]);
        db.run(`UPDATE slots SET is_booked = 0 WHERE id = ?`, [row.slot_id]);
        if (refund) db.run(`UPDATE members SET credits = credits + 1 WHERE id = ?`, [row.member_id]);
      });
      res.json({ ok: true, refunded: refund });
    }
  );
});

app.patch('/api/admin/bookings/:id/move', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { new_slot_id } = req.body || {};
  if (!new_slot_id) return res.status(400).json({ error: 'MISSING_NEW_SLOT' });

  db.get(
    `SELECT b.*, s.start_iso
     FROM bookings b JOIN slots s ON b.slot_id = s.id
     WHERE b.id = ?`,
    [id],
    (err, bk) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      if (!bk) return res.status(404).json({ error: 'NOT_FOUND' });
      if (bk.cancelled_at) return res.status(400).json({ error: 'ALREADY_CANCELLED' });

      db.get(`SELECT * FROM slots WHERE id = ?`, [new_slot_id], (e2, target) => {
        if (e2) return res.status(500).json({ error: 'DB_ERROR' });
        if (!target) return res.status(404).json({ error: 'TARGET_NOT_FOUND' });
        if (target.is_booked) return res.status(400).json({ error: 'TARGET_BOOKED' });
        if (new Date(target.start_iso).getTime() <= Date.now())
          return res.status(400).json({ error: 'TARGET_IN_PAST' });

        db.serialize(() => {
          db.run(`UPDATE slots SET is_booked = 0 WHERE id = ?`, [bk.slot_id]);
          db.run(`UPDATE slots SET is_booked = 1 WHERE id = ?`, [target.id]);
          db.run(`UPDATE bookings SET slot_id = ? WHERE id = ?`, [target.id, id]);
        });
        res.json({ ok: true, new_slot_id: target.id });
      });
    }
  );
});

/* -------------------- Slot maintenance -------------------- */
async function purgePastUnbooked(){
  return new Promise((resolve,reject)=>
    db.run(`DELETE FROM slots WHERE is_booked=0 AND datetime(end_iso)<datetime('now')`,[],
      function(e){ e?reject(e):resolve(this.changes||0); }));
}
function hoursFor(dow){
  switch(dow){
    case 1: return {location:'Scunthorpe', hours:[17,18,19,20]};
    case 2: return {location:'Hull', hours:[17,18,19,20,21]};
    case 3: return {location:'Shipley', hours:[18,19,20,21]};
    case 4: return {location:'Hull', hours:[17,18,19,20,21]};
    default: return null;
  }
}
function insertSlotIfMissing(startLocal, location){
  const startIso=new Date(startLocal).toISOString(), endIso=new Date(startLocal.getTime()+60*60*1000).toISOString();
  return new Promise((resolve,reject)=> db.get(`SELECT id FROM slots WHERE start_iso=?`,[startIso],(e,row)=>{
    if(e) return reject(e); if(row) return resolve(false);
    db.run(`INSERT INTO slots (start_iso,end_iso,is_booked,location) VALUES (?,?,0,?)`,
      [startIso,endIso,location||null], function(err){ err?reject(err):resolve(true); });
  }));
}
async function topUpFutureSlots(days=14){
  const today=new Date(); let created=0;
  for (let i=0;i<days;i++){
    const d=new Date(today); d.setHours(0,0,0,0); d.setDate(today.getDate()+i);
    const plan=hoursFor(d.getDay()); if(!plan) continue;
    for (const h of plan.hours){
      const startLocal=new Date(d); startLocal.setHours(h,0,0,0);
      if (startLocal.getTime()<=Date.now()) continue;
      if (await insertSlotIfMissing(startLocal, plan.location)) created++;
    }
  }
  return created;
}
async function maintainSlots(days=14){
  const purged=await purgePastUnbooked(); const created=await topUpFutureSlots(days); return {purged,created,days};
}
app.post('/api/admin/maintain-slots', requireAdminKey, async (req,res)=>{
  const days=Math.max(1, Math.min(31, Number(req.query.days||14)));
  try{ const out=await maintainSlots(days); res.json({ok:true, ...out}); }
  catch(e){ console.error(e); res.status(500).json({error:'MAINTAIN_ERROR'}); }
});
function scheduleDaily(hour=2, minute=15, fn=()=>{}){
  const now=new Date(); const next=new Date(now); next.setHours(hour,minute,0,0);
  if(next<=now) next.setDate(next.getDate()+1);
  const delay=next-now;
  setTimeout(()=>{ Promise.resolve(fn()).catch(console.error);
    setInterval(()=> Promise.resolve(fn()).catch(console.error), 24*60*60*1000);
  }, delay);
}
scheduleDaily(2,15, async ()=>{
  try{ const {purged,created}=await maintainSlots(14); console.log(`[slots] nightly → purged ${purged}, created ${created}`); }
  catch(e){ console.error('[slots] nightly error', e); }
});

/* -------------------- Static & start -------------------- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (_req,res)=> res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (_req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, ()=> console.log(`Server running on ${APP_BASE}`));

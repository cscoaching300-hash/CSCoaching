// public/js/book.js (v6)
console.log('[book.js v6] start');

const $ = s => document.querySelector(s);
const slotsDiv = $('#slots');
const slotsErr = $('#slotsError');
let selectedSlot = null;
let me = null;

// ---------- helpers ----------
function fmt(dt, as) {
  const d = new Date(dt);
  if (as === 'date') return d.toLocaleDateString([], { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function selectCard(cardEl, id) {
  selectedSlot = id;
  slotsDiv.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  const btn = $('#bookBtn'); if (btn) btn.disabled = false;
  const msg = $('#msg'); if (msg) msg.textContent = 'Slot selected. Enter your email to confirm.';
}

// ---------- me / credits ----------
async function loadMe() {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      me = j.member;
      const pill = $('#creditPill'); if (pill) pill.textContent = `Credits: ${me.credits}`;
      const emailEl = $('#email'); if (emailEl && me.email) emailEl.value = me.email;
      console.log('[book.js] /api/me ok', me);
    } else {
      console.log('[book.js] /api/me not logged in (401 is fine)');
    }
  } catch (e) {
    console.warn('[book.js] /api/me error', e);
  }
}

// ---------- slots ----------
async function loadSlots() {
  if (!slotsDiv) return;
  slotsDiv.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  if (slotsErr) slotsErr.textContent = '';

  const params = new URLSearchParams();
  params.set('onlyAvailable','true');

  try {
    const r = await fetch('/api/slots?' + params.toString(), { cache: 'no-store' });
    const raw = await r.text();
    let j;
    try { j = JSON.parse(raw); }
    catch { console.error('[book.js] JSON parse fail. Raw:', raw); throw new Error('Invalid response from server'); }

    const list = Array.isArray(j.slots) ? j.slots : [];
    console.log('[book.js] slots:', list.length);

    if (!list.length) {
      slotsDiv.innerHTML = '<div class="muted" style="padding:10px;">No open slots right now.</div>';
      if (slotsErr) slotsErr.textContent = '';
      return;
    }

    const html = list.map(s => `
      <div class="slot-card" data-id="${s.id}" tabindex="0" role="button"
           aria-label="Select ${fmt(s.start_iso,'date')} ${fmt(s.start_iso)} at ${s.location || ''}">
        <div>
          <div class="slot-when">${fmt(s.start_iso,'date')}</div>
          <div class="slot-sub">${fmt(s.start_iso)} – ${fmt(s.end_iso)}</div>
          <div class="slot-sub">${s.location || ''}</div>
        </div>
      </div>
    `).join('');
    slotsDiv.innerHTML = html;

    slotsDiv.querySelectorAll('.slot-card').forEach(card => {
      const id = Number(card.getAttribute('data-id'));
      card.addEventListener('click', () => selectCard(card, id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(card, id); }
      });
    });

  } catch (e) {
    console.error('[book.js] loadSlots error:', e);
    slotsDiv.innerHTML = '<div class="muted" style="padding:10px;color:#e88;">Failed to load slots.</div>';
    if (slotsErr) slotsErr.textContent = e.message || 'Network error';
  }
}

// ---------- booking ----------
async function doBook() {
  if (!selectedSlot) return;
  const emailEl = $('#email');
  const email = emailEl ? emailEl.value.trim() : '';
  const notesEl = $('#notes');
  const notes = notesEl ? notesEl.value.trim() : '';
  const hpEl = $('#website');
  const hp = hpEl ? hpEl.value : '';
  const msg = $('#msg');

  if (hp) return; // spam honeypot
  if (!email) { if (msg) msg.textContent = 'Please enter an email address.'; return; }

  try {
    const r = await fetch('/api/book', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ slot_id:selectedSlot, email, notes })
    });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || 'Booking failed'); }
    if (msg) msg.textContent = '✅ Booking confirmed! A confirmation email has been sent.';
    const btn = $('#bookBtn'); if (btn) btn.disabled = true;
    await loadMe();
    await loadSlots();
  } catch (e) {
    console.error('[book.js] doBook error:', e);
    if (msg) msg.textContent = 'Error: ' + e.message;
  }
}

// ---------- init ----------
window.addEventListener('DOMContentLoaded', () => {
  console.log('[book.js] DOM ready');
  loadMe();
  loadSlots();
  const btn = $('#bookBtn');
  if (btn) btn.addEventListener('click', doBook);
});



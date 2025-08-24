// public/js/book.js
(() => {
  // define $ (alias of qs) so your calls like $('#slots') work
  const $  = (s, el = document) => el.querySelector(s);
  const qs = (s, el = document) => el.querySelector(s);

  const slotsHost   = $('#slots');         // calendar mounts here
  const emailInput  = $('#email');
  const notesInput  = $('#notes');
  const honeypot    = $('#website');
  const bookBtn     = $('#bookBtn');
  const msg         = $('#msg');
  const creditPill  = $('#creditPill');

  let selectedSlot = null; // { id, start_iso, end_iso, location }
  let allSlots = [];       // normalized slots from API

  // --- Utils ---
  const isoDayKey = iso => new Date(iso).toISOString().slice(0, 10);
  const fmtTime   = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const addDays   = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDate  = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();

  async function loadCredits() {
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      if (!r.ok) return;
      const j = await r.json();
      const credits = j?.member?.credits ?? '—';
      if (creditPill) creditPill.textContent = `Credits: ${credits}`;
    } catch {}
  }

  // fetch slots; if empty, try bypass filter (debug=bypass)
  async function fetchSlots() {
    const base = '/api/slots?onlyAvailable=true';
    let res = await fetch(base, { credentials: 'same-origin' });
    let j = await res.json().catch(() => ({}));
    let slots = j.slots || [];

    if (!slots.length) {
      res = await fetch(base + '&debug=bypass', { credentials: 'same-origin' });
      j = await res.json().catch(() => ({}));
      slots = j.slots || [];
    }

    allSlots = slots.map(s => ({
      id: Number(s.id),
      start_iso: s.start_iso,
      end_iso: s.end_iso,
      location: s.location || ''
    }));
  }

  // Build 2-week calendar from this week's Sunday
  function renderCalendar() {
    if (!slotsHost) return;

    const byDay = {};
    allSlots.forEach(s => {
      const k = isoDayKey(s.start_iso);
      (byDay[k] = byDay[k] || []).push(s);
    });

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Sunday
    const totalDays = 14;

    slotsHost.innerHTML = `
      <div class="cal">
        <div class="cal-head">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div>
          <div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div class="cal-grid" id="calGrid"></div>
      </div>
    `;

    const grid = $('#calGrid', slotsHost);
    grid.innerHTML = '';

    for (let i = 0; i < totalDays; i++) {
      const day = addDays(weekStart, i);
      const key = day.toISOString().slice(0, 10);
      const list = (byDay[key] || []).sort((a,b) => new Date(a.start_iso) - new Date(b.start_iso));

      const cell = document.createElement('div');
      cell.className = 'cal-cell';

      const head = document.createElement('div');
      head.className = 'cal-cell-head';
      head.innerHTML = `
        <div class="cal-date">${day.toLocaleDateString([], { day: '2-digit' })}</div>
        <div class="cal-month">${day.toLocaleDateString([], { month: 'short' })}</div>
      `;
      if (sameDate(day, today)) head.classList.add('today');

      const body = document.createElement('div');
      body.className = 'cal-cell-body';

      if (!list.length) {
        body.innerHTML = `<div class="cal-empty">—</div>`;
      } else {
        list.forEach(s => {
          const btn = document.createElement('button');
          btn.className = 'slot-chip';
          btn.textContent = `${fmtTime(s.start_iso)}–${fmtTime(s.end_iso)}${s.location ? ` • ${s.location}` : ''}`;
          btn.dataset.id = s.id;
          btn.addEventListener('click', () => selectSlot(s, btn));
          body.appendChild(btn);
        });
      }

      cell.appendChild(head);
      cell.appendChild(body);
      grid.appendChild(cell);
    }
  }

  function selectSlot(slot, btnEl) {
    selectedSlot = slot;
    document.querySelectorAll('.slot-chip.selected').forEach(el => el.classList.remove('selected'));
    btnEl.classList.add('selected');
    if (bookBtn) bookBtn.disabled = false;
    if (msg) {
      msg.textContent =
        `Selected: ${new Date(slot.start_iso).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })} @ ${slot.location || 'CSCoaching'}`;
    }
  }

  async function handleBooking() {
    if (!msg) return;
    msg.textContent = '';
    if (!selectedSlot) { msg.textContent = 'Pick a slot from the calendar first.'; return; }
    const email = (emailInput?.value || '').trim().toLowerCase();
    if (!email) { msg.textContent = 'Please enter your email.'; return; }
    if (honeypot?.value) { msg.textContent = 'Spam detected.'; return; }

    if (bookBtn) bookBtn.disabled = true;
    msg.textContent = 'Booking…';
    try {
      const payload = {
        slot_id: selectedSlot.id,
        email,
        notes: (notesInput?.value || '').trim(),
        website: honeypot?.value || ''
      };
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        msg.textContent = j.error || 'Sorry, something went wrong.';
        return;
      }
      msg.textContent = 'Success! Check your email for confirmation.';
      selectedSlot = null;
      if (emailInput) emailInput.value = '';
      if (notesInput) notesInput.value = '';
      await fetchSlots();
      renderCalendar();
      await loadCredits();
      if (bookBtn) bookBtn.disabled = true;
    } catch (e) {
      console.error(e);
      msg.textContent = 'Network error.';
    } finally {
      if (bookBtn) bookBtn.disabled = false;
    }
  }

  // init
  window.addEventListener('DOMContentLoaded', async () => {
    if (slotsHost) {
      slotsHost.innerHTML = '<div class="skel" style="height:140px"></div>';
    }
    await loadCredits();
    await fetchSlots();
    renderCalendar();
    if (bookBtn) bookBtn.addEventListener('click', handleBooking);
  });
})();

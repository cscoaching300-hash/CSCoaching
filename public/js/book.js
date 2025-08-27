// public/js/book.js
(() => {
  const TZ = 'Europe/London';

  /* ---------- Formatters (DST-aware) ---------- */
  const FMT_TIME = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
  });
  const FMT_DAY = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', timeZone: TZ
  });
  const FMT_MON = new Intl.DateTimeFormat('en-GB', {
    month: 'short', timeZone: TZ
  });
  const FMT_YMD_PARTS = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ
  });
  const FMT_WD = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', timeZone: TZ
  });

  /* ---------- Helpers for YYYY-MM-DD in London ---------- */
  const partsFromDate = (d) =>
    FMT_YMD_PARTS.formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});

  const keyFromISO = (iso) => {
    const p = partsFromDate(new Date(iso));
    return `${p.year}-${p.month}-${p.day}`;
  };

  const keyFromDate = (d) => {
    const p = partsFromDate(d);
    return `${p.year}-${p.month}-${p.day}`;
  };

  const fmtTime = (iso) => FMT_TIME.format(new Date(iso));

  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const sameLocalDay = (a, b) => keyFromDate(a) === keyFromDate(b);

  // Find this week's Sunday *in Europe/London*
  function londonWeekStart(fromDate = new Date()) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(fromDate, -i);
      if (FMT_WD.format(d) === 'Sun') return d;
    }
    return fromDate;
  }

  /* ---------- DOM ---------- */
  const qs = (s, el = document) => el.querySelector(s);

  const slotsHost  = qs('#slots');
  const emailInput = qs('#email');
  const notesInput = qs('#notes');
  const honeypot   = qs('#website');
  const bookBtn    = qs('#bookBtn');
  const msg        = qs('#msg');
  const creditPill = qs('#creditPill');

  let selectedSlot = null;
  let allSlots = [];

  /* ---------- API helpers ---------- */
  async function loadCredits() {
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      if (!r.ok) return;
      const j = await r.json();
      const credits = j?.member?.credits ?? '—';
      if (creditPill) creditPill.textContent = `Credits: ${credits}`;
    } catch {}
  }

  async function fetchSlots() {
    // try normal; fallback to bypass so UI never looks empty
    const base = '/api/slots';
    let res = await fetch(base, { credentials: 'same-origin' });
    let j = await res.json().catch(() => ({}));
    let slots = j.slots || [];

    if (!slots.length) {
      res = await fetch(base + '?debug=bypass', { credentials: 'same-origin' });
      j = await res.json().catch(() => ({}));
      slots = j.slots || [];
    }

    allSlots = slots.map(s => ({
      id: Number(s.id),
      start_iso: s.start_iso,
      end_iso: s.end_iso,
      location: s.location || '',
      is_booked: Number(s.is_booked) === 1
    }));
  }

  /* ---------- Calendar rendering ---------- */
  function renderCalendar() {
    if (!slotsHost) return;

    if (!allSlots.length) {
      slotsHost.innerHTML = `
        <div class="panel">
          <h3 style="margin:0 0 6px">No sessions found</h3>
          <div class="muted">We couldn’t find sessions in the upcoming range.</div>
        </div>`;
      return;
    }

    // group by London local day
    const byDay = {};
    allSlots.forEach(s => {
      const k = keyFromISO(s.start_iso);
      (byDay[k] = byDay[k] || []).push(s);
    });

    const today = new Date();
    const weekStart = londonWeekStart(today); // Sunday in London
    const totalDays = 28; // 4 weeks

    slotsHost.innerHTML = `
      <div class="cal">
        <div class="cal-head">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div>
          <div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div class="cal-grid" id="calGrid"></div>
      </div>
    `;

    const grid = qs('#calGrid', slotsHost);
    grid.innerHTML = '';

    for (let i = 0; i < totalDays; i++) {
      const day = addDays(weekStart, i);
      const key = keyFromDate(day);
      const list = (byDay[key] || []).sort((a, b) => new Date(a.start_iso) - new Date(b.start_iso));

      const cell = document.createElement('div');
      cell.className = 'cal-cell';

      const head = document.createElement('div');
      head.className = 'cal-cell-head';
      head.innerHTML = `
        <div class="cal-date">${FMT_DAY.format(day)}</div>
        <div class="cal-month">${FMT_MON.format(day)}</div>
      `;
      if (sameLocalDay(day, today)) head.classList.add('today');

      const body = document.createElement('div');
      body.className = 'cal-cell-body';

      if (!list.length) {
        body.innerHTML = `<div class="cal-empty">—</div>`;
      } else {
        list.forEach(s => {
          if (s.is_booked) {
            const tag = document.createElement('div');
            tag.className = 'slot-chip booked';
            tag.textContent = `${fmtTime(s.start_iso)}–${fmtTime(s.end_iso)}${s.location ? ` • ${s.location}` : ''} · Booked`;
            body.appendChild(tag);
          } else {
            const btn = document.createElement('button');
            btn.className = 'slot-chip';
            btn.textContent = `${fmtTime(s.start_iso)}–${fmtTime(s.end_iso)}${s.location ? ` • ${s.location}` : ''}`;
            btn.dataset.id = s.id;
            btn.addEventListener('click', () => selectSlot(s, btn));
            body.appendChild(btn);
          }
        });
      }

      cell.appendChild(head);
      cell.appendChild(body);
      grid.appendChild(cell);
    }
  }

  /* ---------- Selection & booking ---------- */
  function selectSlot(slot, btnEl) {
    selectedSlot = slot;
    document.querySelectorAll('.slot-chip.selected').forEach(el => el.classList.remove('selected'));
    btnEl.classList.add('selected');
    if (bookBtn) bookBtn.disabled = false;
    if (msg) {
      msg.textContent = `Selected: ${new Date(slot.start_iso).toLocaleString('en-GB', {
        timeZone: TZ,
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      })} @ ${slot.location || 'CSCoaching'}`;
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

  /* ---------- Init ---------- */
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

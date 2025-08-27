// public/js/book.js
(() => {
  const TZ = 'Europe/London';

  /* ---------- Formatters (DST-aware) ---------- */
  const FMT_TIME = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
  });
  const FMT_DAY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: TZ });
  const FMT_MON = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: TZ });
  const FMT_YMD_PARTS = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ
  });
  const FMT_WD = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TZ });

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

  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameLocalDay = (a, b) => keyFromDate(a) === keyFromDate(b);

  // Find this week's Sunday *in Europe/London* (kept for reference; not used below)
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

  // 🔥 Multi-select (max 2) + holidays cache
  let selectedSlots = [];   // array of { id, start_iso, end_iso, location }
  let allSlots = [];
  let holidaySet = new Set();  // <--- EXACTLY HERE: global set of 'YYYY-MM-DD' holiday days

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
    // Ask server for all slots + holidays (max 60 daysso the UI isn't empty)
    const base = '/api/slots?includeHolidays=true&maxDays=60'; // remove all=true


    let res = await fetch(base, { credentials: 'same-origin' });
    let j = await res.json().catch(() => ({}));
    let slots = j.slots || [];

    // ⬇️ EXACTLY HERE: capture holidays from API (store as Set of 'YYYY-MM-DD')
    holidaySet = new Set((j.holidays || []).map(h => h.day));

    if (!slots.length) {
      // fallback: bypass filter
      res = await fetch(base + '&debug=bypass', { credentials: 'same-origin' });
      j = await res.json().catch(() => ({}));
      slots = j.slots || [];
      if (j.holidays) holidaySet = new Set((j.holidays || []).map(h => h.day));
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

    // group by local day
    const byDay = {};
    allSlots.forEach(s => {
      const k = keyFromISO(s.start_iso);
      (byDay[k] = byDay[k] || []).push(s);
    });

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Sunday in local tz
    const totalDays = 28; // 4 weeks

    // One single grid: first row is headers, rest are cells
    slotsHost.innerHTML = `
      <div class="cal">
        <div class="cal-grid" id="calGrid"></div>
      </div>
    `;

    const grid = qs('#calGrid', slotsHost);
    grid.innerHTML = '';

    // Header row
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      const h = document.createElement('div');
      h.className = 'cal-head-cell';
      h.textContent = d;
      grid.appendChild(h);
    });

    // Day cells
    for (let i = 0; i < totalDays; i++) {
      const day = addDays(weekStart, i);
      const key = keyFromDate(day);
      const list = (byDay[key] || []).sort((a, b) => new Date(a.start_iso) - new Date(b.start_iso));

      // ⬇️ EXACTLY HERE: if the day is a holiday, render banner and skip slots
      if (holidaySet.has(key)) {
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
        body.innerHTML = `<div class="cal-empty" style="color:#e02424;font-weight:700">HOLIDAY</div>`;

        cell.appendChild(head);
        cell.appendChild(body);
        grid.appendChild(cell);
        continue; // next day
      }

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

            // reflect current selections
            if (selectedSlots.find(sel => sel.id === s.id)) btn.classList.add('selected');

            btn.addEventListener('click', () => toggleSlot(s, btn));
            body.appendChild(btn);
          }
        });
      }

      cell.appendChild(head);
      cell.appendChild(body);
      grid.appendChild(cell);
    }

    // button state
    if (bookBtn) bookBtn.disabled = selectedSlots.length === 0;
  }

  /* ---------- Selection (max 2) ---------- */
  function toggleSlot(slot, btnEl) {
    const existingIndex = selectedSlots.findIndex(s => s.id === slot.id);

    if (existingIndex >= 0) {
      // deselect
      selectedSlots.splice(existingIndex, 1);
      btnEl.classList.remove('selected');
    } else {
      // add (cap at 2)
      if (selectedSlots.length >= 2) {
        // remove oldest
        const removed = selectedSlots.shift();
        // remove .selected from the chip in DOM
        document.querySelectorAll('.slot-chip.selected').forEach(el => {
          if (Number(el.dataset.id) === removed.id) el.classList.remove('selected');
        });
      }
      selectedSlots.push(slot);
      btnEl.classList.add('selected');
    }

    // update helper text + button enabled
    if (bookBtn) bookBtn.disabled = selectedSlots.length === 0;

    if (msg) {
      if (!selectedSlots.length) {
        msg.textContent = '';
      } else {
        msg.textContent = 'Selected: ' + selectedSlots.map(s =>
          new Date(s.start_iso).toLocaleString('en-GB', {
            timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
          }) + ` @ ${s.location || 'CSCoaching'}`
        ).join(' + ');
      }
    }
  }

  /* ---------- Booking (bulk with fallback) ---------- */
  async function handleBooking() {
    if (!msg) return;
    msg.textContent = '';

    if (!selectedSlots.length) { msg.textContent = 'Pick at least one slot.'; return; }
    const email = (emailInput?.value || '').trim().toLowerCase();
    if (!email) { msg.textContent = 'Please enter your email.'; return; }
    if (honeypot?.value) { msg.textContent = 'Spam detected.'; return; }

    if (bookBtn) bookBtn.disabled = true;
    msg.textContent = 'Booking…';

    try {
      // Try bulk (server may not support; we’ll fall back)
      const bulkPayload = {
        slot_ids: selectedSlots.map(s => s.id),
        email,
        notes: (notesInput?.value || '').trim(),
        website: honeypot?.value || ''
      };

      let r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(bulkPayload)
      });

      // Fallback to sequential singles if needed
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const looksLikeSingleOnly =
          j?.error === 'MISSING_FIELDS' ||
          j?.error === 'BAD_BODY' ||
          j?.error === 'UNKNOWN_FIELD';

        if (looksLikeSingleOnly || selectedSlots.length > 1) {
          for (const s of selectedSlots) {
            const singlePayload = {
              slot_id: s.id,
              email,
              notes: (notesInput?.value || '').trim(),
              website: honeypot?.value || ''
            };
            const r1 = await fetch('/api/book', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify(singlePayload)
            });
            const j1 = await r1.json().catch(() => ({}));
            if (!r1.ok || !j1.ok) {
              msg.textContent = j1.error || 'Sorry, something went wrong.';
              if (bookBtn) bookBtn.disabled = false;
              return;
            }
          }
        } else {
          msg.textContent = j?.error || 'Sorry, something went wrong.';
          if (bookBtn) bookBtn.disabled = false;
          return;
        }
      }

      msg.textContent = 'Success! Check your email for confirmation.';
      selectedSlots = [];
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

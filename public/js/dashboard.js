/// public/js/dashboard.js
const $ = (s) => document.querySelector(s);

function fmt(dt, as) {
  const d = new Date(dt);
  if (as === 'date')
    return d.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// NOTE: API returns booking_id (not id) and slot_id (aliased from slots.id)
function card({ booking_id, slot_id, start_iso, end_iso, location, cancelled_at, refunded }) {
  const startDate = fmt(start_iso, 'date');
  const startTime = fmt(start_iso, 'time');
  const endTime   = fmt(end_iso, 'time');

  const cancelled = !!cancelled_at;
  const badge = cancelled
    ? `<span class="cs-badge cs-badge--grey">Cancelled${refunded ? ' · Refunded' : ''}</span>`
    : `<span class="cs-badge cs-badge--green">Confirmed</span>`;

  const actions = cancelled
    ? ''
    : `<button class="cs-btn cs-btn--danger"
               data-booking-id="${booking_id}"
               data-slot-id="${slot_id || ''}">Cancel</button>`;

  return `
  <div class="cs-card">
    <div>
      <div class="cs-card-title">${startDate}</div>
      <div class="cs-card-meta">${startTime} – ${endTime} · <strong>${location || 'CSCoaching'}</strong></div>
    </div>
    <div class="cs-card-side">
      ${badge}
      ${actions}
    </div>
  </div>`;
}

async function loadMe() {
  const r = await fetch('/api/me');
  if (!r.ok) { location.href = '/login.html'; return; }
  const j = await r.json();
  const { name, email, credits } = j?.member || {};
  $('#memberName').textContent = name || (email ? email.split('@')[0] : 'there');
  $('#creditPill').textContent = `Credits: ${credits ?? '—'}`;
}

async function loadBookings() {
  const up = $('#upcoming');
  const pa = $('#past');
  up.innerHTML = '<div class="cs-skel"></div>';
  pa.innerHTML = '<div class="cs-skel"></div>';

  const res = await fetch('/api/member/bookings');
  if (!res.ok) { location.href = '/login.html'; return; }
  const { bookings = [] } = await res.json();

  const now = Date.now();
  const upcoming = [];
  const past = [];
  bookings.forEach(b => {
    const isFuture = new Date(b.start_iso).getTime() > now && !b.cancelled_at;
    (isFuture ? upcoming : past).push(b);
  });

  up.innerHTML = upcoming.length
    ? upcoming.map(b => card(b)).join('')
    : '<div class="cs-empty">No upcoming bookings.</div>';

  past.sort((a, b) => new Date(b.start_iso) - new Date(a.start_iso));
  pa.innerHTML = past.length
    ? past.map(b => card(b)).join('')
    : '<div class="cs-empty">No past or cancelled bookings yet.</div>';

  // Wire cancel buttons to booking_id
  document.querySelectorAll('.cs-btn[data-booking-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bid = btn.dataset.bookingId || btn.getAttribute('data-id'); // fallback if an old attr lingers
      if (!bid) {
        console.warn('Cancel button missing booking id:', btn.dataset);
        alert('Sorry—missing booking id.');
        return;
      }
      if (!confirm('Cancel this session?')) return;

      btn.disabled = true;
      try {
        const r = await fetch(`/api/member/bookings/${encodeURIComponent(bid)}/cancel`, { method: 'POST' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { alert(j.error || 'Could not cancel'); return; }
        alert('Cancelled' + (j.refunded ? ' (refund issued)' : ''));
        await loadMe();        // credits may change
        await loadBookings();  // refresh lists
      } catch (err) {
        console.error(err);
        alert('Network error.');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  await loadBookings();
});



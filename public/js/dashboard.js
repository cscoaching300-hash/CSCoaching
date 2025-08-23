// public/js/dashboard.js
const $ = (s) => document.querySelector(s);

function fmt(dt, as) {
  const d = new Date(dt);
  if (as === 'date') {
    return d.toLocaleDateString([], {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function card({ booking_id, start_iso, end_iso, location, cancelled_at, refunded }) { // keep booking_id
  const startDate = fmt(start_iso, 'date');
  const startTime = fmt(start_iso, 'time');
  const endTime   = fmt(end_iso, 'time');

  const cancelled = !!cancelled_at;
  const badge = cancelled
    ? `<span class="cs-badge cs-badge--grey">Cancelled${refunded ? ' · Refunded' : ''}</span>`
    : `<span class="cs-badge cs-badge--green">Confirmed</span>`;

  const actions = cancelled 
? '' 
: `<button class="cs-btn cs-btn--danger" data-id="${booking_id}">Cancel</button>`;

  return `
    <div class="cs-card">
      <div class="cs-card-main">
        <div class="cs-card-title">${startDate}</div>
        <div class="cs-card-meta">
          ${startTime} – ${endTime} · <strong>${location || 'CSCoaching'}</strong>
        </div>
      </div>
      <div class="cs-card-side">
        ${badge}
        ${actions}
      </div>
    </div>
  `;
}

async function loadMe() {
  const r = await fetch('/api/me');
  if (!r.ok) {
    location.href = '/login.html';
    return;
  }
  const j = await r.json();
  const credits = j?.member?.credits ?? '—';
  $('#creditPill').textContent = `Credits: ${credits}`;
}

async function loadBookings() {
  const up = $('#upcoming');
  const pa = $('#past');
  if (up) up.innerHTML = '<div class="cs-skel"></div>';
  if (pa) pa.innerHTML = '<div class="cs-skel"></div>';

  const res = await fetch('/api/member/bookings');
  if (!res.ok) {
    location.href = '/login.html';
    return;
  }
  const { bookings = [] } = await res.json();

  // split into future/past; cancelled items always show in "past"
  const now = Date.now();
  const upcoming = [];
  const past = [];
  bookings.forEach(b => {
    const isFuture = new Date(b.start_iso).getTime() > now;
    if (b.cancelled_at) past.push(b);
    else (isFuture ? upcoming : past).push(b);
  });

  if (up) {
    up.innerHTML = upcoming.length
      ? upcoming.map(b => card(b)).join('')
      : '<div class="cs-empty">No upcoming bookings.</div>';
  }

  if (pa) {
    pa.innerHTML = past.length
      ? past.map(b => card(b)).join('')
      : '<div class="cs-empty">No past bookings yet.</div>';
  }

  // wire cancel buttons (only exist on upcoming cards)
  document.querySelectorAll('.cs-btn[data-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!confirm('Cancel this session?')) return;
      const r = await fetch(`/api/member/bookings/${id}/cancel`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(j.error || 'Could not cancel');
        return;
      }
      alert('Cancelled' + (j.refunded ? ' (refund issued)' : ''));
      await loadMe();        // credits may change
      await loadBookings();  // refresh lists
    });
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  await loadBookings();
});

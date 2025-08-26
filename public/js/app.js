const qs = (s, el=document) => el.querySelector(s);
const slotsContainer = qs('#slotsContainer');
const fromDate = qs('#fromDate');
const toDate = qs('#toDate');
const onlyAvailable = qs('#onlyAvailable');
const loadBtn = qs('#loadBtn');

const modal = qs('#modal');
const closeModal = qs('#closeModal');
const slotIdInput = qs('#slotId');
const modalWhen = qs('#modalWhen');
const form = qs('#bookForm');
const formMsg = qs('#formMsg');
const yearEl = qs('#year');

yearEl.textContent = new Date().getFullYear();

const fmtDateTime = iso => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday:'short', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
};
const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
const dayKey = iso => new Date(iso).toISOString().slice(0,10);

function groupByDay(slots){ const g={}; for(const s of slots){ const k=dayKey(s.start_iso); (g[k]=g[k]||[]).push(s);} return g; }
function todayStr(offset=0){ const d = new Date(); d.setDate(d.getDate()+offset); return d.toISOString().slice(0,10); }

async function loadSlots(){
  const params = new URLSearchParams();
  if (fromDate.value) params.set('from', fromDate.value);
  if (toDate.value) params.set('to', toDate.value);
  if (onlyAvailable.checked) params.set('onlyAvailable', 'true');
  const res = await fetch('/api/slots?' + params.toString());
  const data = await res.json();
  renderSlots(data.slots || []);
}

function renderSlots(slots){
  if (!slots.length) {
    slotsContainer.innerHTML = `<div class="day"><h3>No slots for this range.</h3></div>`;
    return;
  }
  const groups = groupByDay(slots);
  const keys = Object.keys(groups).sort();
  slotsContainer.innerHTML='';
  for (const k of keys) {
    const list = groups[k];
    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    const d = new Date(k+'T00:00:00');
    const h3 = document.createElement('h3');
    h3.textContent = d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    dayEl.appendChild(h3);
    const wrap = document.createElement('div'); wrap.className='slot-list';
    for (const s of list) {
      const item = document.createElement('div'); item.className='slot';
      const time = document.createElement('span'); time.className='time'; time.textContent = `${fmtTime(s.start_iso)} – ${fmtTime(s.end_iso)}`;
      const loc = document.createElement('span'); loc.className='loc'; loc.textContent = `@ ${s.location || ''}`;
      const badge = document.createElement('span'); badge.className='badge '+(s.is_booked?'badge-booked':'badge-available'); badge.textContent = s.is_booked?'Booked':'Available';
      item.appendChild(time); item.appendChild(loc); item.appendChild(badge);
      if (!s.is_booked) {
        const btn = document.createElement('button'); btn.className='primary'; btn.textContent='Book';
        btn.onclick = () => openModal(s); item.appendChild(btn);
      }
      wrap.appendChild(item);
    }
    dayEl.appendChild(wrap);
    slotsContainer.appendChild(dayEl);
  }
}

function openModal(slot){
  slotIdInput.value = slot.id;
  modalWhen.textContent = `${fmtDateTime(slot.start_iso)} → ${fmtTime(slot.end_iso)} @ ${slot.location || ''}`;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
  qs('#email').focus();
}
function closeModalFn(){
  modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); form.reset(); formMsg.textContent='';
}
closeModal.addEventListener('click', closeModalFn);
modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModalFn(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMsg.textContent = 'Booking…';
  const payload = {
    slot_id: Number(slotIdInput.value),
    email: qs('#email').value.trim().toLowerCase(),
    notes: qs('#notes').value.trim(),
    website: qs('#website').value || ''
  };
  const res = await fetch('/api/book', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.ok) { formMsg.textContent = 'Success! Check your email for confirmation.'; setTimeout(()=>{ closeModalFn(); loadSlots(); }, 900);}
  else { formMsg.textContent = data.message || data.error || 'Sorry, something went wrong.'; }
});

/* ========= Member bookings (optional on this page) ========= */
const myBookingsContainer = qs('#myBookingsContainer');
const myBookingsMsg = qs('#myBookingsMsg'); // optional

async function loadMyBookings() {
  if (!myBookingsContainer) return; // page doesn't show bookings

  myBookingsMsg && (myBookingsMsg.textContent = '');
  myBookingsContainer.innerHTML = '<div class="skel">Loading…</div>';

  try {
    const res = await fetch('/api/member/bookings', { headers: { 'Accept': 'application/json' } });
    if (res.status === 401) {
      myBookingsContainer.innerHTML = '<p>Please sign in to see your bookings.</p>';
      return;
    }
    const data = await res.json();
    const bookings = data.bookings || [];

    if (!bookings.length) {
      myBookingsContainer.innerHTML = '<p>No upcoming bookings.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = `
      <tr>
        <th>When</th><th>Location</th><th>Status</th><th>Actions</th>
      </tr>
    `;

    bookings.forEach(b => {
      const s = new Date(b.start_iso);
      const e = new Date(b.end_iso);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.toLocaleString([], { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })} – ${e.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</td>
        <td>${b.location || ''}</td>
        <td>${b.cancelled_at ? 'Cancelled' : 'Booked'}</td>
        <td>
          ${b.cancelled_at ? '' : `<button class="btn sm btn-cancel" data-id="${b.booking_id}">Cancel</button>`}
        </td>
      `;
      table.appendChild(tr);
    });

    myBookingsContainer.innerHTML = '';
    myBookingsContainer.appendChild(table);

    // Wire up cancel buttons
    myBookingsContainer.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Cancel this session?')) return;
        btn.disabled = true;
        try {
          const res = await fetch(`/api/member/bookings/${id}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const out = await res.json();
          if (!res.ok) {
            alert(out?.error || `Error ${res.status}`);
            return;
          }
          alert(out.refunded ? 'Cancelled and credit refunded.' : 'Cancelled.');
          // Refresh bookings & slots if present
          loadMyBookings();
          if (typeof loadSlots === 'function') loadSlots();
        } catch (err) {
          console.error(err);
          alert('Network error.');
        } finally {
          btn.disabled = false;
        }
      });
    });

  } catch (e) {
    console.error(e);
    myBookingsContainer.innerHTML = '<p>Sorry, failed to load your bookings.</p>';
    myBookingsMsg && (myBookingsMsg.textContent = 'Error loading bookings.');
  }
}

// Kick it off if the container exists on this page
window.addEventListener('DOMContentLoaded', loadMyBookings);

<script>
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/me', { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      // logged in → show dashboard/logout
      document.querySelectorAll('.nav-authed').forEach(el => el.style.display = 'inline');
      document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'none');
    } else {
      // not logged in → show login/register
      document.querySelectorAll('.nav-authed').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'inline');
    }
  } catch {
    // fallback if request fails
    document.querySelectorAll('.nav-authed').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'inline');
  }
});
</script>
<script>
async function loadNav() {
  const res = await fetch('/partials/nav.html');
  const html = await res.text();
  document.getElementById('nav-placeholder').innerHTML = html;

  // Now toggle based on login
  try {
    const me = await fetch('/api/me');
    if (me.ok) {
      document.querySelectorAll('.nav-authed').forEach(el => el.style.display = 'inline');
      document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'none');
    } else {
      document.querySelectorAll('.nav-authed').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'inline');
    }
  } catch {
    document.querySelectorAll('.nav-authed').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'inline');
  }
}
window.addEventListener('DOMContentLoaded', loadNav);
</script>



fromDate.value = todayStr(0);
toDate.value = todayStr(14);
loadBtn.addEventListener('click', loadSlots);
window.addEventListener('DOMContentLoaded', loadSlots);

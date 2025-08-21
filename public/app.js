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

fromDate.value = todayStr(0);
toDate.value = todayStr(14);
loadBtn.addEventListener('click', loadSlots);
window.addEventListener('DOMContentLoaded', loadSlots);

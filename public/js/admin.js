(() => {
  const $ = (s, r = document) => r.querySelector(s);

  const membersDiv   = $('#members');
  const slotsDiv     = $('#slots');
  const upDiv        = $('#upcoming');

  const membersMsg   = $('#membersMsg');
  const slotsMsg     = $('#slotsMsg');
  const upMsg        = $('#upcomingMsg');
  const keyInput     = $('#adminKey');
  const keyMsg       = $('#keyMsg');
  const maintainBtn  = $('#maintainBtn');
  const maintainMsg  = $('#maintainMsg');

  // Load saved key
  const saved = localStorage.getItem('ADMIN_KEY') || '';
  if (saved && keyInput) keyInput.value = saved;

  if ($('#saveKey')) {
    $('#saveKey').addEventListener('click', () => {
      localStorage.setItem('ADMIN_KEY', (keyInput?.value || '').trim());
      if (keyMsg) {
        keyMsg.textContent = 'Saved ✓';
        setTimeout(() => (keyMsg.textContent = ''), 1200);
      }
      refreshAll();
      loadStatsSummary().catch(console.error);
    });
  }

  function adminKey() {
    return localStorage.getItem('ADMIN_KEY') || '';
  }

  async function api(path, opt = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json', 'X-ADMIN-KEY': adminKey() },
      opt.headers || {}
    );

    const res = await fetch(path, Object.assign({}, opt, { headers }));
    const ct = (res.headers.get('content-type') || '').toLowerCase();

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (ct.includes('application/json')) {
        try {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        } catch {}
      } else {
        const text = await res.text().catch(() => '');
        if (text.startsWith('<!doctype') || text.startsWith('<html')) {
          msg = `Non-JSON error (likely route/redirect): ${res.status}`;
        }
      }
      throw new Error(msg);
    }

    if (!ct.includes('application/json')) {
      const text = await res.text().catch(() => '');
      throw new Error('Server returned non-JSON to ' + path + '. Check server logs.');
    }

    return res.json();
  }

  function warnFromError(e) {
    if ((e.message || '').toUpperCase().includes('ADMIN_ONLY') || (e.message || '').includes('401')) {
      return 'Unauthorized. Enter your admin key above and click Save.';
    }
    return e.message || 'Error';
  }

  /* ---------- Add-member buttons (supports old + new UI) ---------- */
  window.addEventListener('DOMContentLoaded', () => {
    const wireAdd = ({ btnId, nameId, emailId, creditsId, msgId }) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;

      const nameEl    = document.getElementById(nameId);
      const emailEl   = document.getElementById(emailId);
      const creditsEl = document.getElementById(creditsId);
      const msgEl     = document.getElementById(msgId);

      btn.addEventListener('click', async () => {
        if (msgEl) msgEl.textContent = '';

        const name    = (nameEl?.value || '').trim();
        const email   = (emailEl?.value || '').trim().toLowerCase();
        const credits = Number(creditsEl?.value || 0);

        if (!email) {
          if (msgEl) msgEl.textContent = 'Email is required.';
          return;
        }

        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Adding…';

        try {
          const res = await fetch('/api/admin/members', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-ADMIN-KEY': adminKey(),
            },
            body: JSON.stringify({ name: name || null, email, credits })
          });

          let j = {};
          try { j = await res.json(); } catch {}

          if (!res.ok) {
            const err = j?.error || `HTTP ${res.status}`;
            if (msgEl) {
              msgEl.textContent =
                err === 'ADMIN_ONLY'
                  ? 'Unauthorized. Enter your admin key above and click Save.'
                  : err;
            }
            return;
          }

          if (msgEl) msgEl.textContent = 'Member added ✓ (invite sent)';
          if (nameEl) nameEl.value = '';
          if (emailEl) emailEl.value = '';
          if (creditsEl) creditsEl.value = '0';

          try { typeof loadMembers === 'function' && loadMembers(); } catch {}
        } catch (e) {
          if (msgEl) msgEl.textContent = e?.message || 'Network error';
        } finally {
          btn.disabled = false;
          btn.textContent = oldText;
        }
      });
    };

    // New panel
    wireAdd({
      btnId: 'addMemberBtn',
      nameId: 'newName',
      emailId: 'newEmail',
      creditsId: 'newCredits',
      msgId: 'addMemberMsg'
    });

    // Old inline row
    wireAdd({
      btnId: 'addMember',
      nameId: 'm_name',
      emailId: 'm_email',
      creditsId: 'm_credits',
      msgId: 'membersMsg'
    });
  });

  /* ---------- Members ---------- */
  async function loadMembers() {
    if (!membersDiv) return;
    if (membersMsg) membersMsg.textContent = '';
    membersDiv.innerHTML = '<div class="skel"></div>';

    try {
      const data = await api('/api/admin/members');

      const table = document.createElement('table');
      table.className = 'table';
      table.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Credits</th>
          <th>Paid</th>
          <th>Actions</th>
        </tr>
      `;

      (data.members || []).forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${m.name || ''}" class="in name" data-id="${m.id}"></td>
          <td>${m.email}</td>
          <td><input type="number" value="${m.credits}" class="in credits" data-id="${m.id}" min="0"></td>
          <td>
            <button class="btn sm paid-toggle" data-id="${m.id}" data-paid="${m.paid ? 1 : 0}">
              ${m.paid ? '✅ Paid' : '💸 To be Paid'}
            </button>
          </td>
          <td>
            <button class="btn sm save" data-id="${m.id}">Save</button>
            <button class="btn sm outline reset" data-id="${m.id}">Send reset link</button>
            <button class="btn sm danger del" data-id="${m.id}">Delete</button>
          </td>
        `;
        table.appendChild(tr);
      });

      membersDiv.innerHTML = '';
      membersDiv.appendChild(table);

      // Save name/credits
      table.querySelectorAll('.save').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const nameEl = table.querySelector(`.name[data-id="${id}"]`);
          const credEl = table.querySelector(`.credits[data-id="${id}"]`);
          try {
            await api(`/api/admin/members/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                name: nameEl.value,
                credits: Number(credEl.value)
              })
            });
            if (membersMsg) {
              membersMsg.textContent = 'Saved ✓';
              setTimeout(() => (membersMsg.textContent = ''), 1000);
            }
          } catch (e) {
            if (membersMsg) membersMsg.textContent = e.message;
          }
        });
      });

      // Delete member
      table.querySelectorAll('.del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this member?')) return;
          try {
            await api(`/api/admin/members/${id}`, { method: 'DELETE' });
            loadMembers();
          } catch (e) {
            if (membersMsg) membersMsg.textContent = e.message;
          }
        });
      });

      // Paid toggle
      table.querySelectorAll('.paid-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const current = btn.dataset.paid === '1';
          const next = !current;

          btn.textContent = next ? '✅ Paid' : '💸 To be Paid';
          btn.dataset.paid = next ? '1' : '0';

          try {
            await api(`/api/admin/members/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ paid: next })
            });
            if (membersMsg) {
              membersMsg.textContent = 'Paid status updated ✓';
              setTimeout(() => (membersMsg.textContent = ''), 1000);
            }
          } catch (e) {
            btn.textContent = current ? '✅ Paid' : '💸 To be Paid';
            btn.dataset.paid = current ? '1' : '0';
            if (membersMsg) membersMsg.textContent = e.message;
          }
        });
      });

      // Reset invite
      table.querySelectorAll('.reset').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          const old = btn.textContent;
          btn.textContent = 'Sending…';
          try {
            await api(`/api/admin/members/${id}/reset-invite`, { method: 'POST' });
            if (membersMsg) {
              membersMsg.textContent = 'Reset link sent ✓';
              setTimeout(() => (membersMsg.textContent = ''), 1200);
            }
          } catch (e) {
            if (membersMsg) membersMsg.textContent = e.message;
          } finally {
            btn.disabled = false;
            btn.textContent = old;
          }
        });
      });
    } catch (e) {
      membersDiv.innerHTML = '';
      if (membersMsg) membersMsg.textContent = warnFromError(e);
    }
  }

  /* ---------- Slots ---------- */
  async function loadSlots() {
    if (!slotsDiv) return;
    if (slotsMsg) slotsMsg.textContent = '';
    slotsDiv.innerHTML = '<div class="skel"></div>';

    try {
      const data = await api('/api/admin/slots');
      const table = document.createElement('table');
      table.className = 'table';
      table.innerHTML = `
        <tr><th>ID</th><th>Start</th><th>End</th><th>Location</th><th>Booked?</th><th>Actions</th></tr>
      `;

      data.slots.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${s.id}</td>
          <td>${s.start_iso}</td>
          <td>${s.end_iso}</td>
          <td>${s.location || ''}</td>
          <td>${s.is_booked ? 'Yes' : 'No'}</td>
          <td>
            ${s.is_booked ? '' : `<button class="btn sm danger del-slot" data-id="${s.id}">Delete</button>`}
          </td>
        `;
        table.appendChild(tr);
      });

      slotsDiv.innerHTML = '';
      slotsDiv.appendChild(table);

      table.querySelectorAll('.del-slot').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this slot?')) return;
          try {
            await api(`/api/admin/slots/${id}`, { method: 'DELETE' });
            loadSlots();
            loadUpcoming();
          } catch (e) {
            if (slotsMsg) slotsMsg.textContent = e.message;
          }
        });
      });
    } catch (e) {
      slotsDiv.innerHTML = '';
      if (slotsMsg) slotsMsg.textContent = warnFromError(e);
    }
  }

  const addSlotBtn = $('#addSlot');
  if (addSlotBtn) {
    addSlotBtn.addEventListener('click', async () => {
      const start = $('#slotStart')?.value;
      const loc   = $('#slotLocation')?.value;
      const dur   = Number($('#slotDuration')?.value || 60);
      const force = !!$('#slotForce')?.checked;

      if (slotsMsg) slotsMsg.textContent = '';
      if (!start) {
        if (slotsMsg) slotsMsg.textContent = 'Pick a start date/time';
        return;
      }

      try {
        const iso = new Date(start).toISOString();
        const url = '/api/admin/slots' + (force ? '?force=true' : '');
        await api(url, {
          method: 'POST',
          body: JSON.stringify({
            start_iso: iso,
            location: loc || null,
            duration_minutes: Number.isFinite(dur) && dur > 0 ? dur : 60
          })
        });

        $('#slotStart').value = '';
        loadSlots();
        loadUpcoming();
        if (slotsMsg) {
          slotsMsg.textContent = 'Slot added ✓';
          setTimeout(() => (slotsMsg.textContent = ''), 1200);
        }
      } catch (e) {
        const msg = (e.message || '').toUpperCase();
        if (!slotsMsg) return;
        if (msg.includes('DAY_NOT_ALLOWED')) slotsMsg.textContent = 'Blocked by day rules — tick “Bypass rules”.';
        else if (msg.includes('HOUR_NOT_ALLOWED')) slotsMsg.textContent = 'Blocked by hour rules — tick “Bypass rules”.';
        else if (msg.includes('DUPLICATE_START')) slotsMsg.textContent = 'A slot with that start already exists.';
        else slotsMsg.textContent = e.message || 'Error';
      }
    });
  }

  /* ---------- Holidays panel ---------- */
  (function holidaysPanel() {
    const hDay       = document.getElementById('hDay');
    const hNote      = document.getElementById('hNote');
    const hAdd       = document.getElementById('hAdd');
    const hDel       = document.getElementById('hDel');
    const hMsg       = document.getElementById('hMsg');
    const hTableBody = document.getElementById('hTable')?.querySelector('tbody');

    async function loadHolidays() {
      if (!hTableBody) return;
      hTableBody.innerHTML = `<tr><td colspan="2">Loading…</td></tr>`;
      try {
        const j = await api('/api/admin/holidays');
        const rows = j.holidays || [];
        if (!rows.length) {
          hTableBody.innerHTML = `<tr><td colspan="2" class="muted">No holidays</td></tr>`;
          return;
        }
        hTableBody.innerHTML = '';
        rows.forEach(h => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${h.day}</td><td>${h.note || ''}</td>`;
          tr.addEventListener('click', () => {
            if (hDay)  hDay.value = h.day;
            if (hNote) hNote.value = h.note || '';
          });
          hTableBody.appendChild(tr);
        });
      } catch (e) {
        hTableBody.innerHTML = '';
        if (hMsg) hMsg.textContent = (e && e.message) || 'Error loading holidays';
      }
    }

    hAdd?.addEventListener('click', async () => {
      if (hMsg) hMsg.textContent = '';
      const day = (hDay?.value || '').trim();
      if (!day) { if (hMsg) hMsg.textContent = 'Pick a date.'; return; }
      try {
        await api('/api/admin/holidays', {
          method: 'POST',
          body: JSON.stringify({ day, note: hNote?.value || '' })
        });
        if (hMsg) hMsg.textContent = 'Saved.';
        loadHolidays();
      } catch (e) {
        if (hMsg) hMsg.textContent = (e && e.message) || 'Error';
      }
    });

    hDel?.addEventListener('click', async () => {
      if (hMsg) hMsg.textContent = '';
      const day = (hDay?.value || '').trim();
      if (!day) { if (hMsg) hMsg.textContent = 'Pick a date to remove.'; return; }
      try {
        await api('/api/admin/holidays/' + encodeURIComponent(day), { method: 'DELETE' });
        if (hMsg) hMsg.textContent = 'Removed.';
        loadHolidays();
      } catch (e) {
        if (hMsg) hMsg.textContent = (e && e.message) || 'Error';
      }
    });

    loadHolidays();
  })();

  /* ---------- Sale / Promotion panel ---------- */
  (function salePanel() {
    const activeEl = document.getElementById('saleActive');
    const nameEl   = document.getElementById('saleName');
    const discEl   = document.getElementById('saleDiscount');
    const saveBtn  = document.getElementById('saleSave');
    const msgEl    = document.getElementById('saleMsg');

    if (!saveBtn) return;

    async function loadSale() {
      if (msgEl) msgEl.textContent = '';
      try {
        const j = await api('/api/admin/sale');
        const cfg = j.sale || j || {};
        if (activeEl) activeEl.checked = !!cfg.active;
        if (nameEl) nameEl.value = cfg.name || '';
        const pct = cfg.discountPercent ?? cfg.discount_percent ?? 0;
        if (discEl) discEl.value = Number.isFinite(Number(pct)) ? Number(pct) : 0;
      } catch (e) {
        if (msgEl) msgEl.textContent = warnFromError(e);
      }
    }

    saveBtn.addEventListener('click', async () => {
      if (msgEl) msgEl.textContent = '';

      const body = {
        active: !!activeEl?.checked,
        name: (nameEl?.value || '').trim(),
        discountPercent: Number(discEl?.value || 0)
      };

      try {
        await api('/api/admin/sale', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        if (msgEl) {
          msgEl.textContent = 'Sale saved ✓';
          setTimeout(() => (msgEl.textContent = ''), 1500);
        }
      } catch (e) {
        if (msgEl) msgEl.textContent = warnFromError(e);
      }
    });

    loadSale();
  })();

  /* ---------- Stats summary ---------- */
  async function loadStatsSummary() {
    const key = adminKey();
    const res = await fetch('/api/admin/stats/summary', {
      headers: { 'X-ADMIN-KEY': key }
    });

    if (!res.ok) {
      console.error('Failed to load stats', await res.text());
      return;
    }

    const data = await res.json();
    if (!data.ok) return;

    const totalEl  = document.getElementById('stats-total');
    const activeEl = document.getElementById('stats-active');
    if (totalEl)  totalEl.textContent  = data.totalVisits;
    if (activeEl) activeEl.textContent = data.activeNow;

    const pathsTbody = document.getElementById('stats-paths');
    if (pathsTbody) {
      pathsTbody.innerHTML = '';
      (data.byPath || []).forEach(row => {
        const tr = document.createElement('tr');
        const tdPath = document.createElement('td');
        const tdCount = document.createElement('td');
        tdPath.textContent = row.path;
        tdCount.textContent = row.visits;
        tr.appendChild(tdPath);
        tr.appendChild(tdCount);
        pathsTbody.appendChild(tr);
      });
    }

    const recentList = document.getElementById('stats-recent');
    if (recentList) {
      recentList.innerHTML = '';
      (data.recent || []).forEach(row => {
        const li = document.createElement('li');
        li.textContent = `${row.created_at} — ${row.path}`;
        recentList.appendChild(li);
      });
    }
  }

  /* ---------- Upcoming bookings with actions ---------- */
  let cachedSlots = [];

  async function loadUpcoming() {
    if (!upDiv) return;
    if (upMsg) upMsg.textContent = '';
    upDiv.innerHTML = '<div class="skel"></div>';

    try {
      const [bookingsRes, slotsRes] = await Promise.all([
        api('/api/admin/bookings'),
        api('/api/admin/slots')
      ]);

      cachedSlots = (slotsRes.slots || [])
        .filter(s => s.is_booked === 0 && new Date(s.start_iso).getTime() > Date.now());

      const bookings = bookingsRes.bookings || [];

      const table = document.createElement('table');
      table.className = 'table';
      table.innerHTML = `
        <tr>
          <th>When</th><th>Location</th><th>Member</th><th>Email</th>
          <th>Move to</th><th>Actions</th>
        </tr>
      `;

      bookings.forEach(b => {
        const tr = document.createElement('tr');

        const shortlist = cachedSlots
          .filter(s => !b.location || !s.location || s.location.toLowerCase() === String(b.location).toLowerCase())
          .slice(0, 50);

        const sel = document.createElement('select');
        sel.className = 'in';
        sel.style.minWidth = '240px';
        sel.dataset.bid = b.booking_id;
        const placeholder = document.createElement('option');
        placeholder.textContent = 'Select a new slot…';
        placeholder.value = '';
        sel.appendChild(placeholder);

        shortlist.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          const sd = new Date(s.start_iso);
          const ed = new Date(s.end_iso);
          opt.textContent = `${sd.toLocaleString([], { weekday:'short', day:'2-digit', month:'short' })} ${sd.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}–${ed.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} • ${s.location || ''}`;
          sel.appendChild(opt);
        });

        const start = new Date(b.start_iso);
        const end   = new Date(b.end_iso);

        tr.innerHTML = `
          <td>${start.toLocaleString([], { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })} – ${end.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</td>
          <td>${b.location || ''}</td>
          <td>${b.member_name || '—'}</td>
          <td>${b.member_email}</td>
          <td></td>
          <td>
            <button class="btn sm move" data-id="${b.booking_id}">Move</button>
            <button class="btn sm danger cancel" data-id="${b.booking_id}" data-refund="1">Cancel + refund</button>
            <button class="btn sm danger outline cancel" data-id="${b.booking_id}" data-refund="0">Cancel (no refund)</button>
          </td>
        `;
        tr.children[4].appendChild(sel);
        table.appendChild(tr);
      });

      upDiv.innerHTML = '';
      upDiv.appendChild(table);
      if (bookings.length === 0 && upMsg) upMsg.textContent = 'No booked sessions yet.';

      // Move booking
      table.querySelectorAll('.move').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id  = btn.dataset.id;
          const sel = table.querySelector(`select[data-bid="${id}"]`);
          const target = Number(sel.value || 0);
          if (!target) {
            if (upMsg) {
              upMsg.textContent = 'Choose a target slot first.';
              setTimeout(() => (upMsg.textContent = ''), 1200);
            }
            return;
          }
          btn.disabled = true;
          try {
            await api(`/api/admin/bookings/${id}/move`, {
              method: 'PATCH',
              body: JSON.stringify({ new_slot_id: target })
            });
            loadSlots();
            loadUpcoming();
          } catch (e) {
            if (upMsg) upMsg.textContent = warnFromError(e);
          } finally {
            btn.disabled = false;
          }
        });
      });

      // Cancel booking
      table.querySelectorAll('.cancel').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const refund = btn.dataset.refund === '1';
          if (!confirm(refund ? 'Cancel and refund credit?' : 'Cancel without refund?')) return;

          btn.disabled = true;
          try {
            const res = await fetch(`/api/admin/bookings/${id}/cancel?refund=${refund ? 'true' : 'false'}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-ADMIN-KEY': adminKey(),
              },
            });
            let body = {};
            try { body = await res.json(); } catch {}
            if (!res.ok) {
              const msg = body?.error || `HTTP ${res.status}`;
              throw new Error(msg);
            }

            if (upMsg) {
              upMsg.textContent = body.refunded ? 'Cancelled + refund issued.' : 'Cancelled.';
              setTimeout(() => (upMsg.textContent = ''), 1500);
            }
            loadSlots();
            loadUpcoming();
          } catch (e) {
            if (upMsg) {
              upMsg.textContent = (e.message === 'ADMIN_ONLY')
                ? 'Unauthorized. Enter your admin key above and click Save.'
                : e.message || 'Error';
            }
          } finally {
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      upDiv.innerHTML = '';
      if (upMsg) upMsg.textContent = warnFromError(e);
    }
  }

  /* ---------- Maintain slots button ---------- */
  if (maintainBtn) {
    maintainBtn.addEventListener('click', async () => {
      maintainBtn.disabled = true;
      maintainBtn.textContent = 'Working...';
      try {
        const out = await api('/api/admin/maintain-slots?days=14', { method: 'POST' });
        if (maintainMsg) maintainMsg.textContent = `Purged ${out.purged}, created ${out.created}.`;
        refreshAll();
      } catch (e) {
        if (maintainMsg) maintainMsg.textContent = warnFromError(e);
      } finally {
        maintainBtn.disabled = false;
        maintainBtn.textContent = 'Maintain slots (14 days)';
        if (maintainMsg) setTimeout(() => (maintainMsg.textContent = ''), 2500);
      }
    });
  }

  /* ---------- Helper to refresh all lists ---------- */
  function refreshAll() {
    loadMembers();
    loadSlots();
    loadUpcoming();
  }

  /* ---------- Initial load ---------- */
  window.addEventListener('DOMContentLoaded', () => {
    refreshAll();
    loadStatsSummary().catch(console.error);
  });

})();  // end IIFE


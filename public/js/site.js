// public/js/site.js
(async () => {
  const placeholder = document.getElementById('nav-placeholder');
  if (!placeholder) {
    console.warn('[site.js] #nav-placeholder not found on this page.');
    return;
  }

  // Helper to toggle guest/authed link visibility
  async function setAuthVisibility() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      const authed = res.ok;
      document.querySelectorAll('.nav-authed').forEach(el => el.style.display = authed ? 'inline' : 'none');
      document.querySelectorAll('.nav-guest').forEach(el => el.style.display = authed ? 'none' : 'inline');
    } catch (e) {
      console.warn('[site.js] /api/me failed; showing guest links.', e);
      document.querySelectorAll('.nav-authed').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'inline');
    }
  }

  // Fetch and inject the partial
  try {
    const bust = Date.now(); // hard cache-bust while iterating
    const res = await fetch(`/partials/nav.html?v=${bust}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // The partial should already include <nav class="cs-nav">...</nav>
    placeholder.innerHTML = html;

    // Wire logout if present
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        } catch {}
        window.location.href = '/';
      });
    }

    // Now set visibility of guest/authed items
    await setAuthVisibility();
    console.log('[site.js] Nav injected and initialized.');
  } catch (err) {
    console.error('[site.js] Failed to load /partials/nav.html:', err);

    // Minimal fallback (guest only) so the page isn’t blank
    placeholder.innerHTML = `
      <nav class="cs-nav">
        <div class="cs-nav-inner">
          <div class="cs-brand"><a href="/" style="text-decoration:none;color:#fff">CSCoaching</a></div>
          <ul class="cs-nav-links">
            <li class="nav-guest"><a href="/book.html">Book a session</a></li>
            <li class="nav-guest"><a href="/login.html">Login</a></li>
            <li class="nav-authed" style="display:none"><a href="/dashboard.html">My bookings</a></li>
            <li class="nav-authed" style="display:none"><a id="logoutLink" href="#">Logout</a></li>
          </ul>
        </div>
      </nav>
    `;
    await setAuthVisibility();
  }
})();

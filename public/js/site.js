// public/js/site.js
(async () => {
  const placeholder = document.getElementById('nav-placeholder');
  if (!placeholder) return;

  async function setAuthVisibility() {
    try {
      // use the lightweight status endpoint (never 401)
      const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      const authed = !!data?.authed;

      document
        .querySelectorAll('.nav-authed')
        .forEach((el) => (el.style.display = authed ? 'inline' : 'none'));
      document
        .querySelectorAll('.nav-guest')
        .forEach((el) => (el.style.display = authed ? 'none' : 'inline'));
    } catch (e) {
      // if anything fails, default to guest view
      document
        .querySelectorAll('.nav-authed')
        .forEach((el) => (el.style.display = 'none'));
      document
        .querySelectorAll('.nav-guest')
        .forEach((el) => (el.style.display = 'inline'));
    }
  }

  try {
    const res = await fetch(`/partials/nav.html?v=${Date.now()}`, {
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    placeholder.innerHTML = await res.text();

    // wire logout, if present
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
          });
        } catch {}
        // always end up on home (also clears cookie via server /logout if used)
        window.location.href = '/';
      });
    }

    await setAuthVisibility();
    console.log('[site.js] Nav injected and initialized.');
  } catch (err) {
    console.error('[site.js] Failed to load /partials/nav.html:', err);
    // Minimal fallback (guest only) so the page isn’t blank
    placeholder.innerHTML = `
      <div class="cs-nav-inner">
        <div class="cs-brand">
          <a href="/" style="text-decoration:none;color:#fff">CSCoaching</a>
        </div>
        <ul class="cs-nav-links">
          <li class="nav-guest"><a href="/">Home</a></li>
          <li class="nav-guest"><a href="/meet-the-coach.html">Meet the Coach</a></li>
          <li class="nav-guest"><a href="/prices.html">Prices</a></li>
          <li class="nav-guest"><a href="/book.html">Book a Session</a></li>
          <li class="nav-guest"><a href="/contact.html">Contact</a></li>
          <li class="nav-guest"><a href="/login.html">Login</a></li>
          <li class="nav-authed" style="display:none"><a href="/dashboard.html">My bookings</a></li>
          <li class="nav-authed" style="display:none"><a id="logoutLink" href="#">Logout</a></li>
        </ul>
      </div>`;
    await setAuthVisibility();
  }
})();

// ----------------------
// Home Page Carousel
// ----------------------
document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('homeCarouselTrack');
  if (!track) return; // not on home page

  // 🔢 Set how many photos you have in /public/img/home/
  //   Expecting files named: home1.jpg, home2.jpg, …, homeN.jpg
  const TOTAL_HOME_PHOTOS = 22; // <-- change this number when you add/remove photos

  const images = [];
  for (let i = 1; i <= TOTAL_HOME_PHOTOS; i++) {
    images.push(`/img/home/home${i}.jpg`);
  }

  if (!images.length) return;

  console.log('[site.js] Initialising home carousel with', images.length, 'images');

  // Build slides
  images.forEach((src) => {
    const slide = document.createElement('div');
    slide.className = 'home-slide';

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';

    slide.appendChild(img);
    track.appendChild(slide);
  });

  // Duplicate slides for a seamless loop
  track.innerHTML += track.innerHTML;

  // Respect reduced-motion preference
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const applyMotionPreference = () => {
    if (mq.matches) {
      track.classList.add('no-animate');
    } else {
      track.classList.remove('no-animate');
    }
  };

  applyMotionPreference();
  mq.addEventListener('change', applyMotionPreference);
});


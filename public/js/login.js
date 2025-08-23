// public/js/login.js
(() => {
  const form = document.getElementById('loginForm');
  if (!form) return; // page didn't render the form

  const msg = document.getElementById('loginMsg');
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');

  async function handleLogin(e) {
    e.preventDefault();
    if (msg) msg.textContent = 'Logging in…';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: (emailEl?.value || '').trim(),
          password: passEl?.value || ''
        })
      });

      const out = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (msg) msg.textContent = out.error || 'Invalid email or password';
        return;
      }

      // success
      if (msg) msg.textContent = '';
      window.location.href = '/dashboard.html';
    } catch (err) {
      console.error(err);
      if (msg) msg.textContent = 'Network error. Please try again.';
    }
  }

  form.addEventListener('submit', handleLogin);
})();

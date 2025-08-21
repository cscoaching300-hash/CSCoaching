// public/js/login.js
const $ = (s) => document.querySelector(s);

async function handleLogin(e) {
  e.preventDefault();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const msg = $('#error');

  msg.textContent = '';

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    msg.textContent = data.error || 'Login failed';
    return;
  }
  location.href = '/dashboard.html';
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (form) form.addEventListener('submit', handleLogin);
});
